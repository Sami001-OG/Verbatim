import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { execFile } from 'node:child_process';
import dns from 'node:dns';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ExtractionMethod, PlatformType, TranscriptResult, TranscriptSegment } from '../types/transcript.ts';
import { getLanguageCode } from '../utils/languages.ts';
import {
  buildPlatformFetchCandidates,
  discoverMediaUrlsFromHtml,
} from '../utils/mediaDiscovery.ts';
import { getPlatformLabel, parseSourceUrl } from '../utils/urlParser.ts';
import {
  cleanSegmentText,
  decodeHtmlEntities,
  normalizeSegments,
  parseTimecodeToSeconds,
  parseYouTubeJson3,
  parseYouTubeTimedTextXml,
} from '../utils/transcriptParser.ts';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore if unsupported in runtime
}

const execFileAsync = promisify(execFile);

const MAX_MEDIA_BYTES = 24 * 1024 * 1024; // 24 MB safety limit
const FETCH_TIMEOUT_MS = 14000;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

const PAGE_NAV_HEADERS = {
  ...BROWSER_HEADERS,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

export class TranscriptionError extends Error {
  statusCode: number;
  suggestion?: string;

  constructor(message: string, statusCode = 422, suggestion?: string) {
    super(message);
    this.name = 'TranscriptionError';
    this.statusCode = statusCode;
    this.suggestion = suggestion;
  }
}

function hasValidGeminiKey(): boolean {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!hasValidGeminiKey() || !apiKey) {
    throw new TranscriptionError(
      'GEMINI_API_KEY is not configured in this deployment environment.',
      422,
      'In Vercel, open Project Settings → Environment Variables, add GEMINI_API_KEY (from Google AI Studio), and redeploy.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseVttOrSrtText(raw: string): TranscriptSegment[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const segments: Array<{ startSec: number; endSec: number; text: string }> = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const arrowMatch =
      /^(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s+-->\s+(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/.exec(
        line,
      );
    if (arrowMatch) {
      const [startPart, endPart] = line.split('-->').map((s) => s.trim().split(/\s+/)[0]);
      const startSec = parseTimecodeToSeconds(startPart);
      const endSec = parseTimecodeToSeconds(endPart);
      i += 1;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i].trim());
        i += 1;
      }
      const text = cleanSegmentText(textLines.join(' '));
      if (text) {
        segments.push({ startSec, endSec, text });
      }
    } else {
      i += 1;
    }
  }

  return normalizeSegments(segments);
}

interface YouTubeCaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  name?: { simpleText?: string };
  kind?: string;
}

async function tryYouTubeCaptions(
  videoId: string,
  preferredLang?: string,
): Promise<{
  title: string;
  author?: string;
  language: string;
  durationSec: number;
  segments: TranscriptSegment[];
  datacenterBlocked?: boolean;
} | null> {
  let captionTracks: YouTubeCaptionTrack[] = [];
  let title = 'YouTube Video';
  let author: string | undefined;
  let durationSec = 0;
  let datacenterBlocked = false;

  // 1. Try current Innertube mobile player endpoints (ANDROID 20.x and IOS 20.x)
  const mobileClients = [
    {
      ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
      client: {
        clientName: 'ANDROID',
        clientVersion: '20.10.38',
        androidSdkVersion: 34,
        osName: 'Android',
        osVersion: '14',
        hl: 'en',
        gl: 'US',
      },
    },
    {
      ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_1 like Mac OS X;)',
      client: {
        clientName: 'IOS',
        clientVersion: '20.10.4',
        deviceMake: 'Apple',
        deviceModel: 'iPhone16,2',
        osName: 'iPhone',
        osVersion: '18.3.1.22D72',
        hl: 'en',
        gl: 'US',
      },
    },
  ];

  for (const profile of mobileClients) {
    if (captionTracks.length > 0) break;
    try {
      const playerResp = await fetchWithTimeout(
        'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': profile.ua,
          },
          body: JSON.stringify({
            context: { client: profile.client },
            videoId,
          }),
        },
      );

      if (playerResp.ok) {
        const data = (await playerResp.json()) as {
          playabilityStatus?: { status?: string; reason?: string };
          videoDetails?: { title?: string; author?: string; lengthSeconds?: string };
          captions?: {
            playerCaptionsTracklistRenderer?: { captionTracks?: YouTubeCaptionTrack[] };
          };
        };
        if (data.playabilityStatus?.status === 'LOGIN_REQUIRED') {
          datacenterBlocked = true;
        }
        if (data.videoDetails?.title) title = data.videoDetails.title;
        if (data.videoDetails?.author) author = data.videoDetails.author;
        if (data.videoDetails?.lengthSeconds) {
          durationSec = parseInt(data.videoDetails.lengthSeconds, 10) || 0;
        }
        captionTracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      }
    } catch {
      // Try next profile
    }
  }

  // 2. Fallback: scrape captionTracks from watch page HTML
  if (captionTracks.length === 0) {
    try {
      const watchResp = await fetchWithTimeout(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
        headers: BROWSER_HEADERS,
      });
      if (watchResp.ok) {
        const html = await watchResp.text();
        const titleMatch = /<meta\s+name="title"\s+content="([^"]+)"/i.exec(html);
        if (titleMatch?.[1]) title = decodeHtmlEntities(titleMatch[1]);

        if (html.includes('"LOGIN_REQUIRED"') && html.includes('not a bot')) {
          datacenterBlocked = true;
        }

        const tracksMatch = /"captionTracks":(\[.*?\])(?:,"audioTracks"|,"translationLanguages"|,"defaultAudioTrackIndex"|\})/s.exec(
          html,
        );
        if (tracksMatch?.[1]) {
          try {
            captionTracks = JSON.parse(tracksMatch[1]) as YouTubeCaptionTrack[];
          } catch {
            // Ignore malformed captionTracks JSON
          }
        }
      }
    } catch {
      // Ignore network errors
    }
  }

  if (captionTracks.length === 0) {
    if (datacenterBlocked) {
      return {
        title,
        author,
        language: 'English',
        durationSec,
        segments: [],
        datacenterBlocked: true,
      };
    }
    return null;
  }

  const targetLangCode = getLanguageCode(preferredLang);
  const sortedTracks = [...captionTracks].sort((a, b) => {
    const aMatches = a.languageCode?.toLowerCase().startsWith(targetLangCode) ? 1 : 0;
    const bMatches = b.languageCode?.toLowerCase().startsWith(targetLangCode) ? 1 : 0;
    if (aMatches !== bMatches) return bMatches - aMatches;
    const aManual = a.kind === 'asr' ? 0 : 1;
    const bManual = b.kind === 'asr' ? 0 : 1;
    return bManual - aManual;
  });

  const chosen = sortedTracks[0];
  if (!chosen?.baseUrl) return null;

  const chosenCode = (chosen.languageCode || '').toLowerCase();
  const wantsSpecificLang = Boolean(preferredLang && preferredLang !== 'auto');
  const needsYouTubeTlang = Boolean(
    wantsSpecificLang && targetLangCode && !chosenCode.startsWith(targetLangCode),
  );
  const langName = needsYouTubeTlang && preferredLang
    ? preferredLang
    : chosen.name?.simpleText || chosen.languageCode || 'Auto';

  // Fetch json3 first, then XML fallback
  try {
    const jsonUrl = new URL(chosen.baseUrl);
    jsonUrl.searchParams.set('fmt', 'json3');
    if (needsYouTubeTlang) {
      jsonUrl.searchParams.set('tlang', targetLangCode);
    }
    const jsonResp = await fetchWithTimeout(jsonUrl.toString(), { headers: BROWSER_HEADERS });
    if (jsonResp.ok) {
      const bodyText = await jsonResp.text();
      if (bodyText.trim().startsWith('{')) {
        const parsedJson3 = JSON.parse(bodyText) as { events?: Array<Record<string, unknown>> };
        const segs = parseYouTubeJson3(parsedJson3);
        if (segs.length > 0) {
          return {
            title,
            author,
            language: langName,
            durationSec: durationSec || segs[segs.length - 1].endSec,
            segments: segs,
          };
        }
      }
    }
  } catch {
    // Fall through to XML
  }

  try {
    const xmlUrl = new URL(chosen.baseUrl);
    if (needsYouTubeTlang) {
      xmlUrl.searchParams.set('tlang', targetLangCode);
    }
    const xmlResp = await fetchWithTimeout(xmlUrl.toString(), { headers: BROWSER_HEADERS });
    if (xmlResp.ok) {
      const xmlText = await xmlResp.text();
      const segs = parseYouTubeTimedTextXml(xmlText);
      if (segs.length > 0) {
        return {
          title,
          author,
          language: langName,
          durationSec: durationSec || segs[segs.length - 1].endSec,
          segments: segs,
        };
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

const TRANSCRIPT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    accessible: {
      type: Type.BOOLEAN,
      description: 'True only if spoken audio or real transcript content was actually accessible.',
    },
    reason: {
      type: Type.STRING,
      description: 'If accessible is false, explain concisely why extraction was not possible.',
    },
    title: {
      type: Type.STRING,
      description: 'Title of the video, reel, clip, or audio recording.',
    },
    author: {
      type: Type.STRING,
      description: 'Channel, creator handle, or speaker organization if known.',
    },
    language: {
      type: Type.STRING,
      description: 'Primary spoken language (e.g. English, Spanish).',
    },
    durationSec: {
      type: Type.NUMBER,
      description: 'Approximate total duration in seconds.',
    },
    segments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          startSec: { type: Type.NUMBER, description: 'Segment start time in seconds.' },
          endSec: { type: Type.NUMBER, description: 'Segment end time in seconds.' },
          speaker: {
            type: Type.STRING,
            description:
              'Speaker name or Speaker 1 / Speaker 2 ONLY when 2+ distinct speakers converse. Leave empty string "" for single-speaker audio. NEVER output "Narrator", "Voiceover", or "Announcer".',
          },
          text: {
            type: Type.STRING,
            description:
              'Exact verbatim spoken words for this segment without speaker prefixes or narrator labels.',
          },
        },
        required: ['startSec', 'endSec', 'text'],
      },
    },
  },
  required: ['accessible', 'title', 'language', 'segments'],
};

interface StructuredTranscriptPayload {
  accessible?: boolean;
  reason?: string;
  title?: string;
  author?: string;
  language?: string;
  durationSec?: number;
  segments?: Array<{ startSec: number; endSec?: number; speaker?: string; text: string }>;
}

async function extractAudioWithFfmpeg(
  inputBuffer: Buffer,
  inputExt: string,
): Promise<{ audioBase64: string; mimeType: string }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verbatim-'));
  const inFile = path.join(tmpDir, `input.${inputExt}`);
  const outFile = path.join(tmpDir, 'audio.mp3');

  try {
    await fs.writeFile(inFile, inputBuffer);
    await execFileAsync('/usr/bin/ffmpeg', [
      '-y',
      '-i',
      inFile,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-b:a',
      '64k',
      outFile,
    ]);
    const audioBuffer = await fs.readFile(outFile);
    return {
      audioBase64: audioBuffer.toString('base64'),
      mimeType: 'audio/mp3',
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function transcribeAudioBufferWithGemini(
  rawBuffer: Buffer,
  mimeType: string,
  meta: {
    sourceUrl: string;
    normalizedUrl: string;
    platform: PlatformType;
    title?: string;
    author?: string;
    languageHint?: string;
    includeSpeakers?: boolean;
  },
): Promise<TranscriptResult> {
  const ai = getGeminiClient();

  let audioBase64: string;
  let finalMime = mimeType;

  const isVideoOrLarge =
    mimeType.startsWith('video/') ||
    rawBuffer.length > 8 * 1024 * 1024 ||
    !['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg'].includes(mimeType);

  if (isVideoOrLarge) {
    const ext = mimeType.split('/')[1]?.split(';')[0]?.replace(/[^a-z0-9]/gi, '') || 'mp4';
    try {
      const converted = await extractAudioWithFfmpeg(rawBuffer, ext);
      audioBase64 = converted.audioBase64;
      finalMime = converted.mimeType;
    } catch {
      // Serverless environments (e.g. Vercel) without /usr/bin/ffmpeg: pass media buffer directly
      audioBase64 = rawBuffer.toString('base64');
      finalMime = mimeType.split(';')[0]?.trim() || 'video/mp4';
    }
  } else {
    audioBase64 = rawBuffer.toString('base64');
    if (finalMime === 'audio/mpeg') finalMime = 'audio/mp3';
  }

  const languageRule =
    meta.languageHint && meta.languageHint !== 'auto'
      ? `Transcribe in or translate to ${meta.languageHint} while keeping timestamps accurate.`
      : 'Transcribe verbatim in the original spoken language.';

  const speakerRule = meta.includeSpeakers
    ? 'Only populate speaker (e.g., their spoken name, or Speaker 1 / Speaker 2) when two or more distinct voices are conversing. If only one person speaks, leave speaker as an empty string "". NEVER use "Narrator", "Voiceover", or "Announcer".'
    : 'Leave speaker completely empty (""). NEVER include speaker prefixes or the word "Narrator" in text.';

  const promptText = [
    'Produce an accurate, verbatim timestamped transcript of all spoken words in this audio.',
    'Break segments cleanly at natural sentence or clause boundaries (roughly 3 to 12 seconds per segment) with accurate startSec and endSec in seconds.',
    'Output only the exact spoken words in text—never prepend "Narrator:", speaker labels, or stage brackets like [Narrator].',
    'Do not paraphrase, summarize, or skip words. Set accessible=true if speech or audio is present.',
    languageRule,
    speakerRule,
  ].join(' ');

  const modelAttempts: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
  ];

  let responseText = '{}';
  let lastModelError: unknown;

  for (const attempt of modelAttempts) {
    try {
      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: finalMime,
                data: audioBase64,
              },
            },
            { text: promptText },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: TRANSCRIPT_RESPONSE_SCHEMA,
          thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
        },
      });
      responseText = (response.text ?? '{}').trim();
      lastModelError = undefined;
      break;
    } catch (err) {
      lastModelError = err;
    }
  }

  if (lastModelError) {
    throw lastModelError;
  }

  const parsed = JSON.parse(responseText || '{}') as StructuredTranscriptPayload;
  const segments = normalizeSegments(parsed.segments ?? []);

  if (segments.length === 0) {
    throw new TranscriptionError(
      'No spoken speech could be detected in this media stream.',
      422,
      'Ensure the clip contains audible speech or try another video link.',
    );
  }

  const lastEnd = segments[segments.length - 1]?.endSec ?? 0;

  return {
    id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sourceUrl: meta.sourceUrl,
    normalizedUrl: meta.normalizedUrl,
    platform: meta.platform,
    title: meta.title || parsed.title || `${getPlatformLabel(meta.platform)} Transcript`,
    author: meta.author || parsed.author || undefined,
    language: parsed.language || (meta.languageHint && meta.languageHint !== 'auto' ? meta.languageHint : 'Auto-detected'),
    durationSec: parsed.durationSec || lastEnd,
    extractionMethod: 'audio-transcription',
    segments,
    createdAt: new Date().toISOString(),
  };
}

async function transcribeYouTubeViaGeminiVideo(
  normalizedUrl: string,
  sourceUrl: string,
  languageHint?: string,
  includeSpeakers?: boolean,
): Promise<TranscriptResult> {
  const ai = getGeminiClient();

  const languageRule =
    languageHint && languageHint !== 'auto'
      ? `Provide the transcript in ${languageHint}.`
      : 'Transcribe verbatim in the video’s primary spoken language.';

  const speakerRule = includeSpeakers
    ? 'Only populate speaker when two or more distinct people are speaking; leave speaker as empty string "" for single-speaker videos. NEVER use "Narrator", "Voiceover", or "Announcer".'
    : 'Leave speaker completely empty (""). NEVER include speaker prefixes or the word "Narrator" in text.';

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [
      {
        role: 'user',
        parts: [
          {
            fileData: {
              fileUri: normalizedUrl,
            },
          },
          {
            text: [
              'Transcribe all spoken words in this YouTube video accurately with timestamps.',
              'Return chronological segments with accurate startSec and endSec in seconds, exact spoken words, title, author/channel, and language.',
              'Output only the spoken words in text—never prepend "Narrator:", speaker labels, or stage brackets like [Narrator].',
              'If the video is private, unavailable, or contains no speech, set accessible=false and explain in reason.',
              languageRule,
              speakerRule,
            ].join(' '),
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: TRANSCRIPT_RESPONSE_SCHEMA,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as StructuredTranscriptPayload;
  if (parsed.accessible === false) {
    throw new TranscriptionError(
      parsed.reason || 'This YouTube video is private, age-restricted, or unavailable.',
      422,
      'Try a public YouTube URL or upload the downloaded audio/video file.',
    );
  }

  const segments = normalizeSegments(parsed.segments ?? []);
  if (segments.length === 0) {
    throw new TranscriptionError(
      'Could not extract spoken segments from this YouTube video.',
      422,
      'Verify that the video is public and contains speech.',
    );
  }

  const lastEnd = segments[segments.length - 1]?.endSec ?? 0;

  return {
    id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sourceUrl,
    normalizedUrl,
    platform: 'youtube',
    title: parsed.title || 'YouTube Video Transcript',
    author: parsed.author || undefined,
    language: parsed.language || 'English',
    durationSec: parsed.durationSec || lastEnd,
    extractionMethod: 'video-analysis',
    segments,
    createdAt: new Date().toISOString(),
  };
}

async function downloadBoundedBytes(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const resp = await fetchWithTimeout(url, { headers: BROWSER_HEADERS }, 20000);
  if (!resp.ok) return null;

  const contentType = (resp.headers.get('content-type') || '').toLowerCase();
  const contentLength = Number(resp.headers.get('content-length') || '0');
  if (contentLength > MAX_MEDIA_BYTES) {
    throw new TranscriptionError(
      'The media file at this link exceeds the 24 MB inline extraction limit.',
      413,
      'Trim or export a shorter clip and upload the audio directly.',
    );
  }

  const arrayBuffer = await resp.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_MEDIA_BYTES) {
    throw new TranscriptionError(
      'The media stream exceeded the 24 MB inline extraction limit.',
      413,
      'Try uploading a compressed MP3/M4A audio file.',
    );
  }

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
  };
}

export async function transcribeFromLink(params: {
  url: string;
  language?: string;
  includeSpeakers?: boolean;
}): Promise<TranscriptResult> {
  const parsed = parseSourceUrl(params.url);
  if (!parsed.valid) {
    throw new TranscriptionError(parsed.error || 'Invalid URL provided.', 400);
  }

  // 1. YouTube pipeline: official/auto captions first, then Gemini direct YouTube video understanding
  if (parsed.platform === 'youtube' && parsed.videoId) {
    const captionData = await tryYouTubeCaptions(parsed.videoId, params.language);
    if (captionData && captionData.segments.length > 0) {
      const baseResult: TranscriptResult = {
        id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sourceUrl: params.url,
        normalizedUrl: parsed.normalizedUrl,
        platform: 'youtube',
        title: captionData.title,
        author: captionData.author,
        language: captionData.language,
        durationSec: captionData.durationSec,
        extractionMethod: 'caption-track',
        segments: captionData.segments,
        createdAt: new Date().toISOString(),
      };

      if (
        params.language &&
        params.language !== 'auto' &&
        !captionData.language.toLowerCase().includes(params.language.toLowerCase()) &&
        getLanguageCode(captionData.language) !== getLanguageCode(params.language)
      ) {
        return await translateTranscriptWithGemini(baseResult, params.language);
      }

      return baseResult;
    }

    if (captionData?.datacenterBlocked && !hasValidGeminiKey()) {
      throw new TranscriptionError(
        'YouTube blocked anonymous caption scraping from this cloud server IP ("Sign in to confirm you’re not a bot"), and GEMINI_API_KEY is not set.',
        422,
        'In Vercel Dashboard → Project Settings → Environment Variables, add GEMINI_API_KEY (from Google AI Studio) and redeploy so Verbatim can extract YouTube transcripts from cloud servers.',
      );
    }

    return await transcribeYouTubeViaGeminiVideo(
      parsed.normalizedUrl,
      params.url,
      params.language,
      params.includeSpeakers,
    );
  }

  // 2. Probe URL (plus platform-specific mobile/embed fallbacks) for direct media or HTML streams
  const fetchCandidates = buildPlatformFetchCandidates(parsed.normalizedUrl, parsed.platform);
  const subtitleQueue: string[] = [];
  const streamQueue: Array<{ url: string; kind: 'audio' | 'video' }> = [];
  let discoveredTitle: string | undefined;
  let discoveredAuthor: string | undefined;

  for (const candidateUrl of fetchCandidates) {
    let pageResp: Response | null = null;
    try {
      const isMobileFb = candidateUrl.includes('://m.facebook.com/');
      const headers = isMobileFb
        ? {
            ...PAGE_NAV_HEADERS,
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
          }
        : PAGE_NAV_HEADERS;
      pageResp = await fetchWithTimeout(candidateUrl, { headers });
    } catch {
      pageResp = null;
    }

    if (!pageResp || !pageResp.ok) continue;

    const contentType = (pageResp.headers.get('content-type') || '').toLowerCase();

    // Direct audio/video URL
    if (contentType.startsWith('audio/') || contentType.startsWith('video/')) {
      const arrayBuf = await pageResp.arrayBuffer();
      if (arrayBuf.byteLength > MAX_MEDIA_BYTES) {
        throw new TranscriptionError(
          'This direct media file is larger than 24 MB.',
          413,
          'Extract the audio track as MP3 and upload it directly.',
        );
      }
      return await transcribeAudioBufferWithGemini(Buffer.from(arrayBuf), contentType, {
        sourceUrl: params.url,
        normalizedUrl: parsed.normalizedUrl,
        platform: parsed.platform,
        title: parsed.displayHost,
        languageHint: params.language,
        includeSpeakers: params.includeSpeakers,
      });
    }

    // HTML page (Facebook, Instagram, TikTok, X, Vimeo, etc.)
    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      const html = await pageResp.text();
      const discovered = discoverMediaUrlsFromHtml(html, parsed.platform);

      if (!discoveredTitle && discovered.title) discoveredTitle = discovered.title;
      if (!discoveredAuthor && discovered.author) discoveredAuthor = discovered.author;

      subtitleQueue.push(...discovered.subtitleUrls);
      for (const au of discovered.audioUrls) {
        streamQueue.push({ url: au, kind: 'audio' });
      }
      for (const mu of discovered.mediaUrls) {
        streamQueue.push({ url: mu, kind: 'video' });
      }

      // Stop probing extra fallback pages once we already have both media and metadata
      if (
        (discovered.subtitleUrls.length > 0 ||
          discovered.audioUrls.length > 0 ||
          discovered.mediaUrls.length > 0) &&
        discoveredTitle
      ) {
        break;
      }
    }
  }

  // 2a. Check discovered VTT/SRT subtitle tracks (works even without GEMINI_API_KEY)
  for (const subUrl of Array.from(new Set(subtitleQueue))) {
    try {
      const subResp = await fetchWithTimeout(subUrl, { headers: BROWSER_HEADERS });
      if (subResp.ok) {
        const subText = await subResp.text();
        const segs = parseVttOrSrtText(subText);
        if (segs.length > 0) {
          const baseResult: TranscriptResult = {
            id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            sourceUrl: params.url,
            normalizedUrl: parsed.normalizedUrl,
            platform: parsed.platform,
            title: discoveredTitle || `${getPlatformLabel(parsed.platform)} Transcript`,
            author: discoveredAuthor,
            language: 'Auto-detected',
            durationSec: segs[segs.length - 1]?.endSec ?? 0,
            extractionMethod: 'caption-track' as ExtractionMethod,
            segments: segs,
            createdAt: new Date().toISOString(),
          };
          if (params.language && params.language !== 'auto') {
            return await translateTranscriptWithGemini(baseResult, params.language);
          }
          return baseResult;
        }
      }
    } catch {
      // Try next subtitle URL
    }
  }

  // 2b. Transcribe the target video's audio-only DASH track first, with progressive MP4 fallback
  const seenStreamUrls = new Set<string>();
  const uniqueAudio = streamQueue
    .filter((item) => item.kind === 'audio')
    .filter((item) => {
      if (seenStreamUrls.has(item.url)) return false;
      seenStreamUrls.add(item.url);
      return true;
    })
    .slice(0, 1);

  const uniqueVideo = streamQueue
    .filter((item) => item.kind === 'video')
    .filter((item) => {
      if (seenStreamUrls.has(item.url)) return false;
      seenStreamUrls.add(item.url);
      return true;
    })
    .slice(0, 2);

  const orderedStreams = [...uniqueAudio, ...uniqueVideo];

  if (orderedStreams.length > 0 && !hasValidGeminiKey()) {
    getGeminiClient(); // Throws clear GEMINI_API_KEY configuration error
  }

  for (const stream of orderedStreams) {
    let downloaded: { buffer: Buffer; contentType: string } | null = null;
    try {
      downloaded = await downloadBoundedBytes(stream.url);
    } catch (err) {
      if (err instanceof TranscriptionError && err.statusCode === 413) throw err;
      continue;
    }

    if (
      !downloaded ||
      downloaded.buffer.length <= 1024 ||
      !(
        downloaded.contentType.startsWith('video/') ||
        downloaded.contentType.startsWith('audio/') ||
        downloaded.contentType.includes('octet-stream')
      )
    ) {
      continue;
    }

    const mimeType =
      stream.kind === 'audio'
        ? 'audio/mp4'
        : downloaded.contentType.includes('audio/')
          ? downloaded.contentType
          : 'video/mp4';

    try {
      return await transcribeAudioBufferWithGemini(downloaded.buffer, mimeType, {
        sourceUrl: params.url,
        normalizedUrl: parsed.normalizedUrl,
        platform: parsed.platform,
        title: discoveredTitle,
        author: discoveredAuthor,
        languageHint: params.language,
        includeSpeakers: params.includeSpeakers,
      });
    } catch (err) {
      // If Gemini successfully inspected the audio and confirmed there is no speech, surface that immediately
      if (err instanceof TranscriptionError && err.statusCode === 422) throw err;
      // Otherwise fall through to the progressive video fallback (e.g., if a DASH audio container wasn't accepted without ffmpeg)
    }
  }

  // 3. Last resort for public web links: check if Gemini URL Context can read an existing public transcript/page
  const ai = getGeminiClient();
  const label = getPlatformLabel(parsed.platform);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: [
        `Inspect the URL: ${parsed.normalizedUrl}.`,
        'If this page directly exposes a real transcript, spoken script, or timed captions, extract them faithfully with startSec/endSec timestamps.',
        'CRITICAL: Do NOT invent, guess, or fabricate dialogue if the video/audio stream is blocked by a login wall, bot protection, or unavailable.',
        'If you cannot access the actual audio or real transcript from the page, set accessible=false and explain clearly in reason.',
      ].join(' '),
      config: {
        tools: [{ urlContext: {} }],
        responseMimeType: 'application/json',
        responseSchema: TRANSCRIPT_RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const parsedJson = JSON.parse((response.text ?? '{}').trim()) as StructuredTranscriptPayload;
    const segments = normalizeSegments(parsedJson.segments ?? []);

    if (parsedJson.accessible === true && segments.length > 0) {
      return {
        id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sourceUrl: params.url,
        normalizedUrl: parsed.normalizedUrl,
        platform: parsed.platform,
        title: parsedJson.title || `${label} Transcript`,
        author: parsedJson.author || undefined,
        language: parsedJson.language || 'English',
        durationSec: parsedJson.durationSec || segments[segments.length - 1]?.endSec || 0,
        extractionMethod: 'web-context',
        segments,
        createdAt: new Date().toISOString(),
      };
    }

    throw new TranscriptionError(
      parsedJson.reason ||
        `${label} blocked direct server-side access to the media stream (login wall or anti-bot protection).`,
      422,
      `Use "Upload media file" to transcribe a saved ${label} video or audio clip with exact timestamps.`,
    );
  } catch (err) {
    if (err instanceof TranscriptionError) throw err;
    throw new TranscriptionError(
      `${label} did not expose a publicly downloadable media stream or caption track from this link.`,
      422,
      `You can upload the saved ${label} video/audio file directly in Verbatim for full timestamped transcription.`,
    );
  }
}

const TRANSLATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Natural translation of the transcript title in the target language.',
    },
    segments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          text: { type: Type.STRING },
        },
        required: ['id', 'text'],
      },
    },
  },
  required: ['title', 'segments'],
};

async function translateSingleChunkKeyless(text: string, targetLangCode: string): Promise<string> {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', targetLangCode);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  const resp = await fetchWithTimeout(url.toString(), { headers: BROWSER_HEADERS }, 10000);
  if (!resp.ok) {
    throw new Error(`Translation endpoint returned ${resp.status}`);
  }
  const data = (await resp.json()) as unknown;
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    return text;
  }
  return (data[0] as Array<unknown>)
    .map((part) => (Array.isArray(part) && typeof part[0] === 'string' ? part[0] : ''))
    .join('');
}

async function translateTranscriptKeyless(
  transcript: TranscriptResult,
  targetLanguage: string,
): Promise<TranscriptResult> {
  const targetCode = getLanguageCode(targetLanguage);
  const delimiter = '\n|||SEG|||\n';

  let translatedTitle = transcript.title;
  try {
    translatedTitle = (await translateSingleChunkKeyless(transcript.title, targetCode)).trim() || transcript.title;
  } catch {
    // Keep original title if title translation fails
  }

  const batchSize = 20;
  const translatedTexts: string[] = [];

  for (let i = 0; i < transcript.segments.length; i += batchSize) {
    const slice = transcript.segments.slice(i, i + batchSize);
    const joined = slice.map((s) => s.text).join(delimiter);
    try {
      const rawTranslated = await translateSingleChunkKeyless(joined, targetCode);
      const parts = rawTranslated.split(/\s*\|\|\|SEG\|\|\|\s*/);
      if (parts.length === slice.length) {
        translatedTexts.push(...parts.map((p) => p.trim()));
      } else {
        for (const seg of slice) {
          const single = await translateSingleChunkKeyless(seg.text, targetCode);
          translatedTexts.push(single.trim() || seg.text);
        }
      }
    } catch {
      throw new TranscriptionError(
        `Could not translate transcript into ${targetLanguage} right now.`,
        502,
        'Check your network connection or try again in a moment.',
      );
    }
  }

  const updatedSegments = normalizeSegments(
    transcript.segments.map((seg, idx) => ({
      ...seg,
      text: translatedTexts[idx] || seg.text,
    })),
  );

  return {
    ...transcript,
    id: `${transcript.id}-${targetCode}`,
    title: translatedTitle,
    language: targetLanguage,
    segments: updatedSegments,
  };
}

export async function translateTranscriptWithGemini(
  transcript: TranscriptResult,
  targetLanguage: string,
): Promise<TranscriptResult> {
  if (!targetLanguage || targetLanguage === 'auto') {
    return transcript;
  }

  if (!hasValidGeminiKey()) {
    return await translateTranscriptKeyless(transcript, targetLanguage);
  }

  try {
    const ai = getGeminiClient();
    const payload = {
      title: transcript.title,
      segments: transcript.segments.map((seg) => ({
        id: seg.id,
        text: seg.text,
      })),
    };

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: [
        `Translate the following transcript title and every segment accurately and naturally into ${targetLanguage}.`,
        'Keep every segment id identical, do not merge or drop segments, and preserve meaning, tone, and technical accuracy.',
        `Input JSON:\n${JSON.stringify(payload)}`,
      ].join('\n\n'),
      config: {
        responseMimeType: 'application/json',
        responseSchema: TRANSLATION_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const translated = JSON.parse((response.text ?? '{}').trim()) as {
      title?: string;
      segments?: Array<{ id: string; text: string }>;
    };

    const textMap = new Map<string, string>();
    for (const item of translated.segments ?? []) {
      if (item.id && item.text) {
        textMap.set(item.id, item.text.trim());
      }
    }

    const updatedSegments = normalizeSegments(
      transcript.segments.map((seg) => ({
        ...seg,
        text: textMap.get(seg.id) || seg.text,
      })),
    );

    return {
      ...transcript,
      id: `${transcript.id}-${getLanguageCode(targetLanguage)}`,
      title: translated.title?.trim() || transcript.title,
      language: targetLanguage,
      segments: updatedSegments,
    };
  } catch {
    return await translateTranscriptKeyless(transcript, targetLanguage);
  }
}

