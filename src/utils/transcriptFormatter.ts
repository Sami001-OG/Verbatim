import type {
  ExportFormat,
  TimestampFormat,
  TranscriptResult,
  TranscriptSegment,
  TranscriptStats,
} from '../types/transcript.ts';
import { isRtlLanguage } from './languages.ts';

export function formatTimestamp(
  seconds: number,
  format: TimestampFormat = 'auto',
): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  if (format === 'hh:mm:ss' || (format === 'auto' && hrs > 0)) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

function formatSubRipTime(seconds: number, decimalSep: ',' | '.'): string {
  const safeMs = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * 1000));
  const hrs = Math.floor(safeMs / 3600000);
  const mins = Math.floor((safeMs % 3600000) / 60000);
  const secs = Math.floor((safeMs % 60000) / 1000);
  const ms = safeMs % 1000;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');

  return `${pad2(hrs)}:${pad2(mins)}:${pad2(secs)}${decimalSep}${pad3(ms)}`;
}

export function formatSrtTimestamp(seconds: number): string {
  return formatSubRipTime(seconds, ',');
}

export function formatVttTimestamp(seconds: number): string {
  return formatSubRipTime(seconds, '.');
}

export function buildTimestampedText(
  segments: TranscriptSegment[],
  options: {
    timestampFormat?: TimestampFormat;
    includeSpeakers?: boolean;
  } = {},
): string {
  const { timestampFormat = 'auto', includeSpeakers = true } = options;
  return segments
    .map((seg) => {
      const ts = `[${formatTimestamp(seg.startSec, timestampFormat)}]`;
      const speakerPrefix = includeSpeakers && seg.speaker ? `${seg.speaker}: ` : '';
      return `${ts} ${speakerPrefix}${seg.text}`;
    })
    .join('\n');
}

export function buildPlainTextParagraphs(
  segments: TranscriptSegment[],
  options: {
    paragraphGapSec?: number;
    maxSentencesPerParagraph?: number;
    includeSpeakers?: boolean;
  } = {},
): string[] {
  if (segments.length === 0) return [];

  const {
    paragraphGapSec = 3.5,
    maxSentencesPerParagraph = 4,
    includeSpeakers = true,
  } = options;

  const paragraphs: string[] = [];
  let currentPieces: string[] = [];
  let currentSpeaker: string | undefined = segments[0]?.speaker;
  let sentenceCount = 0;

  const flush = () => {
    if (currentPieces.length === 0) return;
    const joined = currentPieces.join(' ').replace(/\s+/g, ' ').trim();
    if (includeSpeakers && currentSpeaker) {
      paragraphs.push(`${currentSpeaker}: ${joined}`);
    } else {
      paragraphs.push(joined);
    }
    currentPieces = [];
    sentenceCount = 0;
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prev = i > 0 ? segments[i - 1] : undefined;
    const gap = prev ? seg.startSec - prev.endSec : 0;
    const speakerChanged =
      includeSpeakers &&
      seg.speaker !== undefined &&
      currentSpeaker !== undefined &&
      seg.speaker !== currentSpeaker;

    if (
      prev &&
      (speakerChanged || gap >= paragraphGapSec || sentenceCount >= maxSentencesPerParagraph)
    ) {
      flush();
      currentSpeaker = seg.speaker;
    } else if (currentSpeaker === undefined && seg.speaker) {
      currentSpeaker = seg.speaker;
    }

    currentPieces.push(seg.text.trim());
    if (/[.!?।۔]["')\]]?$/.test(seg.text.trim())) {
      sentenceCount += 1;
    }
  }

  flush();
  return paragraphs;
}

export function buildPlainText(
  segments: TranscriptSegment[],
  options: {
    includeSpeakers?: boolean;
  } = {},
): string {
  return buildPlainTextParagraphs(segments, options).join('\n\n');
}

export function buildSrt(
  segments: TranscriptSegment[],
  includeSpeakers = true,
): string {
  return segments
    .map((seg, idx) => {
      const start = formatSrtTimestamp(seg.startSec);
      const end = formatSrtTimestamp(
        seg.endSec > seg.startSec ? seg.endSec : seg.startSec + 2,
      );
      const speakerPrefix = includeSpeakers && seg.speaker ? `${seg.speaker}: ` : '';
      return `${idx + 1}\n${start} --> ${end}\n${speakerPrefix}${seg.text}`;
    })
    .join('\n\n');
}

export function buildVtt(
  segments: TranscriptSegment[],
  includeSpeakers = true,
): string {
  const body = segments
    .map((seg) => {
      const start = formatVttTimestamp(seg.startSec);
      const end = formatVttTimestamp(
        seg.endSec > seg.startSec ? seg.endSec : seg.startSec + 2,
      );
      const speakerPrefix = includeSpeakers && seg.speaker ? `<v ${seg.speaker}>` : '';
      return `${start} --> ${end}\n${speakerPrefix}${seg.text}`;
    })
    .join('\n\n');

  return body ? `WEBVTT\n\n${body}` : 'WEBVTT\n';
}

export function buildMarkdown(
  result: TranscriptResult,
  options: {
    includeTimestamps: boolean;
    includeSpeakers?: boolean;
    timestampFormat?: TimestampFormat;
  },
): string {
  const lines = [
    `# ${result.title}`,
    '',
    `- Source: ${result.normalizedUrl}`,
    `- Platform: ${result.platform}`,
    ...(result.author ? [`- Creator: ${result.author}`] : []),
    `- Language: ${result.language}`,
    `- Duration: ${formatTimestamp(result.durationSec)}`,
    '',
    '## Transcript',
    '',
  ];

  if (options.includeTimestamps) {
    for (const seg of result.segments) {
      const ts = formatTimestamp(seg.startSec, options.timestampFormat ?? 'auto');
      const speaker =
        (options.includeSpeakers ?? true) && seg.speaker ? `**${seg.speaker}:** ` : '';
      lines.push(`- \`${ts}\` ${speaker}${seg.text}`);
    }
  } else {
    lines.push(
      buildPlainText(result.segments, {
        includeSpeakers: options.includeSpeakers ?? true,
      }),
    );
  }

  return lines.join('\n');
}

function escapeCsvCell(value: string): string {
  const needsQuotes = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export function buildCsv(
  segments: TranscriptSegment[],
  options: { includeSpeakers?: boolean; timestampFormat?: TimestampFormat } = {},
): string {
  const includeSpeakers = options.includeSpeakers ?? true;
  const timestampFormat = options.timestampFormat ?? 'auto';
  const rows = ['Start,End,Speaker,Text'];

  for (const seg of segments) {
    const start = formatTimestamp(seg.startSec, timestampFormat);
    const end = formatTimestamp(seg.endSec, timestampFormat);
    const speaker = includeSpeakers ? seg.speaker ?? '' : '';
    rows.push(
      [
        escapeCsvCell(start),
        escapeCsvCell(end),
        escapeCsvCell(speaker),
        escapeCsvCell(seg.text),
      ].join(','),
    );
  }

  return rows.join('\n');
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildHtmlDocument(
  result: TranscriptResult,
  options: {
    includeTimestamps?: boolean;
    includeSpeakers?: boolean;
    timestampFormat?: TimestampFormat;
  } = {},
): string {
  const includeTimestamps = options.includeTimestamps ?? true;
  const includeSpeakers = options.includeSpeakers ?? true;
  const timestampFormat = options.timestampFormat ?? 'auto';
  const dir = isRtlLanguage(result.language) ? 'rtl' : 'ltr';

  const bodyHtml = includeTimestamps
    ? result.segments
        .map((seg) => {
          const ts = formatTimestamp(seg.startSec, timestampFormat);
          const speaker =
            includeSpeakers && seg.speaker
              ? `<strong>${escapeHtml(seg.speaker)}:</strong> `
              : '';
          return `<div class="row"><span class="ts">${escapeHtml(ts)}</span><p>${speaker}${escapeHtml(seg.text)}</p></div>`;
        })
        .join('\n')
    : buildPlainTextParagraphs(result.segments, { includeSpeakers })
        .map((p) => `<p class="para">${escapeHtml(p)}</p>`)
        .join('\n');

  return `<!doctype html>
<html lang="en" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(result.title)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 780px; margin: 40px auto; padding: 0 20px; color: #18181b; line-height: 1.65; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .meta { color: #52525b; font-size: 0.875rem; margin-bottom: 1.75rem; border-bottom: 1px solid #e4e4e7; padding-bottom: 1rem; }
    .row { display: flex; gap: 1.25rem; padding: 0.65rem 0; border-bottom: 1px solid #f4f4f5; }
    .ts { font-family: ui-monospace, monospace; font-size: 0.8rem; color: #2563eb; min-width: 64px; padding-top: 0.15rem; }
    .row p, .para { margin: 0 0 1rem; }
  </style>
</head>
<body>
  <h1>${escapeHtml(result.title)}</h1>
  <div class="meta">${escapeHtml(result.platform)} · ${escapeHtml(result.language)} · ${escapeHtml(formatTimestamp(result.durationSec))}</div>
  ${bodyHtml}
</body>
</html>`;
}

export function sanitizeFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'transcript';
}

export function buildExportContent(
  result: TranscriptResult,
  format: ExportFormat,
  options: {
    includeSpeakers?: boolean;
    timestampFormat?: TimestampFormat;
    includeTimestamps?: boolean;
  } = {},
): { content: string; filename: string; mimeType: string } {
  const base = sanitizeFilename(result.title);
  const includeSpeakers = options.includeSpeakers ?? true;
  const timestampFormat = options.timestampFormat ?? 'auto';
  const includeTimestamps = options.includeTimestamps ?? true;

  switch (format) {
    case 'txt-timestamps':
      return {
        content: buildTimestampedText(result.segments, {
          includeSpeakers,
          timestampFormat,
        }),
        filename: `${base}-timestamps.txt`,
        mimeType: 'text/plain;charset=utf-8',
      };
    case 'txt-plain':
      return {
        content: buildPlainText(result.segments, { includeSpeakers }),
        filename: `${base}-plain.txt`,
        mimeType: 'text/plain;charset=utf-8',
      };
    case 'srt':
      return {
        content: buildSrt(result.segments, includeSpeakers),
        filename: `${base}.srt`,
        mimeType: 'application/x-subrip;charset=utf-8',
      };
    case 'vtt':
      return {
        content: buildVtt(result.segments, includeSpeakers),
        filename: `${base}.vtt`,
        mimeType: 'text/vtt;charset=utf-8',
      };
    case 'markdown':
      return {
        content: buildMarkdown(result, {
          includeTimestamps: true,
          includeSpeakers,
          timestampFormat,
        }),
        filename: `${base}.md`,
        mimeType: 'text/markdown;charset=utf-8',
      };
    case 'markdown-plain':
      return {
        content: buildMarkdown(result, {
          includeTimestamps: false,
          includeSpeakers,
          timestampFormat,
        }),
        filename: `${base}-plain.md`,
        mimeType: 'text/markdown;charset=utf-8',
      };
    case 'csv':
      return {
        content: buildCsv(result.segments, { includeSpeakers, timestampFormat }),
        filename: `${base}.csv`,
        mimeType: 'text/csv;charset=utf-8',
      };
    case 'html':
      return {
        content: buildHtmlDocument(result, {
          includeTimestamps,
          includeSpeakers,
          timestampFormat,
        }),
        filename: `${base}.html`,
        mimeType: 'text/html;charset=utf-8',
      };
    case 'json':
      return {
        content: JSON.stringify(result, null, 2),
        filename: `${base}.json`,
        mimeType: 'application/json;charset=utf-8',
      };
  }
}

export function computeTranscriptStats(
  segments: TranscriptSegment[],
  explicitDurationSec?: number,
): TranscriptStats {
  let wordCount = 0;
  let maxEndSec = 0;
  const speakerSet = new Set<string>();

  for (const seg of segments) {
    const words = seg.text.trim().split(/\s+/).filter(Boolean);
    wordCount += words.length;
    if (seg.endSec > maxEndSec) {
      maxEndSec = seg.endSec;
    }
    if (seg.speaker) {
      speakerSet.add(seg.speaker);
    }
  }

  const durationSec = Math.max(explicitDurationSec ?? 0, maxEndSec);
  const estimatedReadingMin = wordCount === 0 ? 0 : Math.max(1, Math.ceil(wordCount / 200));

  return {
    wordCount,
    segmentCount: segments.length,
    durationSec,
    estimatedReadingMin,
    speakers: Array.from(speakerSet),
  };
}

export function filterSegments(
  segments: TranscriptSegment[],
  query: string,
  speakerFilter = 'all',
): TranscriptSegment[] {
  const q = query.trim().toLowerCase();
  return segments.filter((seg) => {
    if (speakerFilter !== 'all' && seg.speaker !== speakerFilter) {
      return false;
    }
    if (!q) return true;
    const textMatch = seg.text.toLowerCase().includes(q);
    const speakerMatch = seg.speaker ? seg.speaker.toLowerCase().includes(q) : false;
    const tsMatch = formatTimestamp(seg.startSec).includes(q);
    return textMatch || speakerMatch || tsMatch;
  });
}
