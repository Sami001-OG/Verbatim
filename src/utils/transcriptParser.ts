import type { TranscriptResult, TranscriptSegment } from '../types/transcript.ts';

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&#x27;': "'",
  '&#x2F;': '/',
};

const GENERIC_SPEAKER_REGEX =
  /^(?:the\s+)?(?:narrator|voice[- ]?over|announcer|commentator|storyteller|unknown(?:\s+speaker)?|unidentified|off[- ]?screen(?:\s+voice)?|speaker)(?:\s*#?\d+)?$/i;

const LEADING_NARRATOR_PREFIX_REGEX =
  /^(?:\[\s*(?:the\s+)?(?:narrator|voice[- ]?over|announcer)\s*\]|\(\s*(?:the\s+)?(?:narrator|voice[- ]?over|announcer)\s*\)|(?:the\s+)?(?:narrator|voice[- ]?over|announcer))(?:\s*[:\-–—]\s*|\s+(?=[A-Z0-9"“'‘]))/i;

const INLINE_NARRATOR_TAG_REGEX =
  /(?:\[\s*(?:the\s+)?(?:narrator|voice[- ]?over|announcer)\s*\]|\(\s*(?:the\s+)?(?:narrator|voice[- ]?over|announcer)\s*\))\s*:?\s*/gi;

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp|#x27|#x2F);/g, (match) => HTML_ENTITIES[match] ?? match)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function sanitizeSpeakerLabel(speaker?: string): string | undefined {
  if (!speaker) return undefined;
  const cleaned = speaker.replace(/[:\s]+$/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  // Preserve multi-speaker numbered labels like "Speaker 1" / "Speaker 2",
  // but strip "Narrator", "Narrator 1", "Voiceover", "Announcer", "Unknown", bare "Speaker".
  if (/^(?:the\s+)?(?:narrator|voice[- ]?over|announcer|commentator|storyteller|unknown(?:\s+speaker)?|unidentified|off[- ]?screen(?:\s+voice)?)(?:\s*#?\d+)?$/i.test(cleaned)) {
    return undefined;
  }
  if (/^speaker$/i.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

export function stripNarratorPrefix(text: string): string {
  let out = text.replace(INLINE_NARRATOR_TAG_REGEX, ' ');
  while (LEADING_NARRATOR_PREFIX_REGEX.test(out)) {
    out = out.replace(LEADING_NARRATOR_PREFIX_REGEX, '');
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function cleanSegmentText(text: string): string {
  const withoutTags = decodeHtmlEntities(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripNarratorPrefix(withoutTags);
}

export function normalizeSegments(
  rawSegments: Array<{
    startSec: number;
    endSec?: number;
    text: string;
    speaker?: string;
  }>,
): TranscriptSegment[] {
  const cleaned = rawSegments
    .map((seg, idx) => {
      const startSec = Number.isFinite(seg.startSec) ? Math.max(0, seg.startSec) : 0;
      const rawEnd = seg.endSec !== undefined && Number.isFinite(seg.endSec) ? seg.endSec : startSec + 3;
      const endSec = Math.max(startSec, rawEnd);
      const text = cleanSegmentText(seg.text || '');
      const speaker = sanitizeSpeakerLabel(seg.speaker);
      return {
        id: `seg-${idx + 1}`,
        startSec: Math.round(startSec * 100) / 100,
        endSec: Math.round(endSec * 100) / 100,
        text,
        speaker,
      };
    })
    .filter((seg) => seg.text.length > 0)
    .sort((a, b) => a.startSec - b.startSec);

  const uniqueSpeakers = new Set(
    cleaned.map((s) => s.speaker).filter((s): s is string => Boolean(s)),
  );
  const onlySpeaker = uniqueSpeakers.size === 1 ? Array.from(uniqueSpeakers)[0] : undefined;
  const dropSingleGenericSpeaker = Boolean(
    onlySpeaker && GENERIC_SPEAKER_REGEX.test(onlySpeaker),
  );

  return cleaned.map((seg, idx) => ({
    ...seg,
    id: `seg-${idx + 1}`,
    speaker: dropSingleGenericSpeaker ? undefined : seg.speaker,
  }));
}

export function sanitizeTranscriptResult(result: TranscriptResult): TranscriptResult {
  return {
    ...result,
    segments: normalizeSegments(result.segments),
  };
}

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8?: string }>;
}

export function parseYouTubeJson3(payload: { events?: Json3Event[] }): TranscriptSegment[] {
  if (!payload || !Array.isArray(payload.events)) return [];

  const raw: Array<{ startSec: number; endSec: number; text: string }> = [];
  for (const event of payload.events) {
    if (!Array.isArray(event.segs) || event.tStartMs === undefined) continue;
    const joined = event.segs.map((s) => s.utf8 ?? '').join('');
    const text = cleanSegmentText(joined);
    if (!text) continue;

    const startSec = event.tStartMs / 1000;
    const durationSec = event.dDurationMs ? event.dDurationMs / 1000 : 3;
    raw.push({
      startSec,
      endSec: startSec + durationSec,
      text,
    });
  }

  return normalizeSegments(raw);
}

export function parseYouTubeTimedTextXml(xml: string): TranscriptSegment[] {
  if (!xml) return [];
  const raw: Array<{ startSec: number; endSec: number; text: string }> = [];
  const regex = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null) {
    const attrs = match[1] ?? '';
    const inner = match[2] ?? '';
    const startMatch = /\bstart="([^"]+)"/.exec(attrs);
    const durMatch = /\bdur="([^"]+)"/.exec(attrs);
    const startSec = startMatch ? parseFloat(startMatch[1]) : 0;
    const durSec = durMatch ? parseFloat(durMatch[1]) : 3;
    const text = cleanSegmentText(inner);

    if (text) {
      raw.push({
        startSec,
        endSec: startSec + (Number.isFinite(durSec) ? durSec : 3),
        text,
      });
    }
  }

  return normalizeSegments(raw);
}

export function parseTimecodeToSeconds(timecode: string): number {
  const cleaned = timecode.trim().replace(',', '.');
  const parts = cleaned.split(':').map((p) => parseFloat(p));
  if (parts.some((n) => Number.isNaN(n))) return 0;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] ?? 0;
}
