import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSourceUrl, getPlatformLabel } from './urlParser';
import {
  parseYouTubeJson3,
  parseYouTubeTimedTextXml,
  parseTimecodeToSeconds,
  normalizeSegments,
  sanitizeSpeakerLabel,
  stripNarratorPrefix,
  sanitizeTranscriptResult,
} from './transcriptParser';
import {
  formatTimestamp,
  formatSrtTimestamp,
  formatVttTimestamp,
  buildTimestampedText,
  buildPlainText,
  buildSrt,
  buildVtt,
  buildCsv,
  buildHtmlDocument,
  buildExportContent,
  computeTranscriptStats,
  filterSegments,
} from './transcriptFormatter';
import { getLanguageCode, isRtlLanguage, LANGUAGE_OPTIONS } from './languages';
import type { TranscriptResult, TranscriptSegment } from '../types/transcript';

test('parseSourceUrl detects YouTube variants and normalizes watch URL', () => {
  const shortUrl = parseSourceUrl('https://youtu.be/dQw4w9WgXcQ?t=42');
  assert.equal(shortUrl.valid, true);
  assert.equal(shortUrl.platform, 'youtube');
  assert.equal(shortUrl.videoId, 'dQw4w9WgXcQ');
  assert.equal(shortUrl.normalizedUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

  const shortsUrl = parseSourceUrl('youtube.com/shorts/abcDEF12345');
  assert.equal(shortsUrl.valid, true);
  assert.equal(shortsUrl.platform, 'youtube');
  assert.equal(shortsUrl.videoId, 'abcDEF12345');
});

test('parseSourceUrl detects TikTok, Instagram, Facebook, X, Vimeo, and direct media', () => {
  assert.equal(parseSourceUrl('https://www.tiktok.com/@creator/video/7123456789').platform, 'tiktok');
  assert.equal(parseSourceUrl('https://www.instagram.com/reel/CxYz12345/').platform, 'instagram');
  assert.equal(parseSourceUrl('https://fb.watch/abc123xyz/').platform, 'facebook');
  assert.equal(parseSourceUrl('https://x.com/user/status/123456789').platform, 'x');
  assert.equal(parseSourceUrl('https://vimeo.com/12345678').platform, 'vimeo');
  assert.equal(parseSourceUrl('https://cdn.example.com/audio/episode-1.mp3').platform, 'direct-media');
  assert.equal(getPlatformLabel('tiktok'), 'TikTok');
});

test('parseSourceUrl rejects empty, whitespace, and non-http links', () => {
  assert.equal(parseSourceUrl('').valid, false);
  assert.equal(parseSourceUrl('not a url').valid, false);
  assert.equal(parseSourceUrl('ftp://example.com/video.mp4').valid, false);
  assert.equal(parseSourceUrl('justtext').valid, false);
});

test('parseYouTubeJson3 and parseYouTubeTimedTextXml extract accurate segments', () => {
  const json3Segs = parseYouTubeJson3({
    events: [
      { tStartMs: 1200, dDurationMs: 2400, segs: [{ utf8: 'Hello ' }, { utf8: 'world &amp; friends.' }] },
      { tStartMs: 4000, dDurationMs: 1800, segs: [{ utf8: '\n' }] },
      { tStartMs: 5500, dDurationMs: 3000, segs: [{ utf8: 'Welcome back!' }] },
    ],
  });
  assert.equal(json3Segs.length, 2);
  assert.equal(json3Segs[0].startSec, 1.2);
  assert.equal(json3Segs[0].text, 'Hello world & friends.');
  assert.equal(json3Segs[1].startSec, 5.5);

  const xmlSegs = parseYouTubeTimedTextXml(
    '<transcript><text start="0.5" dur="2.2">First &quot;line&quot;</text><text start="3.1" dur="1.9">Second line</text></transcript>',
  );
  assert.equal(xmlSegs.length, 2);
  assert.equal(xmlSegs[0].text, 'First "line"');
  assert.equal(xmlSegs[1].endSec, 5);
});

test('normalizeSegments sorts chronologically and clamps invalid bounds', () => {
  const normalized = normalizeSegments([
    { startSec: 12, endSec: 10, text: '  Later line  ' },
    { startSec: -4, endSec: 2, text: '<b>Intro</b>' },
  ]);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].startSec, 0);
  assert.equal(normalized[0].text, 'Intro');
  assert.equal(normalized[1].startSec, 12);
  assert.equal(normalized[1].endSec, 12);
});

test('timestamp formatters and multi-format exports produce accurate output', () => {
  assert.equal(formatTimestamp(14), '00:14');
  assert.equal(formatTimestamp(3665), '01:01:05');
  assert.equal(formatTimestamp(65, 'hh:mm:ss'), '00:01:05');
  assert.equal(formatSrtTimestamp(14.25), '00:00:14,250');
  assert.equal(formatVttTimestamp(14.25), '00:00:14.250');
  assert.equal(parseTimecodeToSeconds('01:02:03.5'), 3723.5);

  const segments: TranscriptSegment[] = [
    { id: '1', startSec: 0, endSec: 4, text: 'Good morning everyone.', speaker: 'Host' },
    { id: '2', startSec: 4.5, endSec: 8, text: 'Today we ship "faster".', speaker: 'Host' },
    { id: '3', startSec: 14, endSec: 19, text: 'Thanks for having me.', speaker: 'Guest' },
  ];

  const withTs = buildTimestampedText(segments);
  assert.match(withTs, /^\[00:00\] Host: Good morning everyone\./m);
  assert.match(withTs, /^\[00:14\] Guest: Thanks for having me\./m);

  const plainNoSpeakers = buildPlainText(segments, { includeSpeakers: false });
  assert.equal(plainNoSpeakers.includes('[00:00]'), false);
  assert.equal(plainNoSpeakers.includes('Host:'), false);
  assert.match(plainNoSpeakers, /Good morning everyone\. Today we ship "faster"\./);

  const srt = buildSrt(segments, false);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:04,000\nGood morning everyone\./);

  const vtt = buildVtt(segments, true);
  assert.match(vtt, /^WEBVTT\n\n00:00:00\.000 --> 00:00:04\.000\n<v Host>Good morning everyone\./);

  const csv = buildCsv(segments);
  assert.match(csv, /^Start,End,Speaker,Text\n00:00,00:04,Host,Good morning everyone\./);
  assert.match(csv, /"Today we ship ""faster""\."/);

  const sampleResult: TranscriptResult = {
    id: 'demo-1',
    sourceUrl: 'https://www.youtube.com/watch?v=demo',
    normalizedUrl: 'https://www.youtube.com/watch?v=demo',
    platform: 'youtube',
    title: 'Design Systems at Scale',
    language: 'English',
    durationSec: 19,
    extractionMethod: 'caption-track',
    segments,
    createdAt: '2026-11-14T20:00:00Z',
  };

  const mdExport = buildExportContent(sampleResult, 'markdown');
  assert.equal(mdExport.filename, 'design-systems-at-scale.md');
  assert.match(mdExport.content, /# Design Systems at Scale/);

  const mdPlainExport = buildExportContent(sampleResult, 'markdown-plain');
  assert.equal(mdPlainExport.filename, 'design-systems-at-scale-plain.md');
  assert.equal(mdPlainExport.content.includes('`00:00`'), false);

  const csvExport = buildExportContent(sampleResult, 'csv');
  assert.equal(csvExport.filename, 'design-systems-at-scale.csv');

  const htmlExport = buildHtmlDocument({ ...sampleResult, language: 'Urdu' });
  assert.match(htmlExport, /dir="rtl"/);

  const stats = computeTranscriptStats(segments);
  assert.equal(stats.wordCount, 11);
  assert.deepEqual(stats.speakers, ['Host', 'Guest']);

  assert.equal(filterSegments(segments, 'ship').length, 1);
  assert.equal(filterSegments(segments, '', 'Guest').length, 1);
});

test('language helpers include Bangla, Hindi, Urdu, Spanish, Arabic, English and detect RTL', () => {
  const values = LANGUAGE_OPTIONS.map((o) => o.value);
  for (const required of ['English', 'Bangla', 'Hindi', 'Urdu', 'Spanish', 'Arabic']) {
    assert.ok(values.includes(required), `Expected language ${required}`);
  }
  assert.equal(getLanguageCode('Bangla'), 'bn');
  assert.equal(getLanguageCode('Hindi'), 'hi');
  assert.equal(getLanguageCode('Urdu'), 'ur');
  assert.equal(getLanguageCode('Spanish'), 'es');
  assert.equal(getLanguageCode('Arabic'), 'ar');
  assert.equal(isRtlLanguage('Urdu'), true);
  assert.equal(isRtlLanguage('Arabic'), true);
  assert.equal(isRtlLanguage('Bangla'), false);
});

test('narrator and voiceover labels or prefixes are stripped while multi-speaker names stay intact', () => {
  assert.equal(sanitizeSpeakerLabel('Narrator'), undefined);
  assert.equal(sanitizeSpeakerLabel('The Narrator:'), undefined);
  assert.equal(sanitizeSpeakerLabel('Voiceover'), undefined);
  assert.equal(sanitizeSpeakerLabel('Announcer'), undefined);
  assert.equal(sanitizeSpeakerLabel('Elena Vance'), 'Elena Vance');
  assert.equal(sanitizeSpeakerLabel('Speaker 1'), 'Speaker 1');

  assert.equal(stripNarratorPrefix('Narrator: Welcome to the channel.'), 'Welcome to the channel.');
  assert.equal(stripNarratorPrefix('[Narrator] Today we test audio.'), 'Today we test audio.');
  assert.equal(stripNarratorPrefix('(Voiceover): Let us begin.'), 'Let us begin.');

  const singleNarratorSegments = normalizeSegments([
    { startSec: 0, endSec: 4, speaker: 'Narrator', text: 'Narrator: First sentence.' },
    { startSec: 4, endSec: 8, speaker: 'Narrator', text: '[Narrator] Second sentence.' },
  ]);
  assert.equal(singleNarratorSegments[0].speaker, undefined);
  assert.equal(singleNarratorSegments[0].text, 'First sentence.');
  assert.equal(singleNarratorSegments[1].speaker, undefined);
  assert.equal(singleNarratorSegments[1].text, 'Second sentence.');

  const singleGenericSpeaker = normalizeSegments([
    { startSec: 0, endSec: 4, speaker: 'Speaker 1', text: 'Solo monologue line one.' },
    { startSec: 4, endSec: 8, speaker: 'Speaker 1', text: 'Solo monologue line two.' },
  ]);
  assert.equal(singleGenericSpeaker[0].speaker, undefined);

  const twoSpeakers = normalizeSegments([
    { startSec: 0, endSec: 4, speaker: 'Speaker 1', text: 'Question one.' },
    { startSec: 4, endSec: 8, speaker: 'Speaker 2', text: 'Answer two.' },
  ]);
  assert.equal(twoSpeakers[0].speaker, 'Speaker 1');
  assert.equal(twoSpeakers[1].speaker, 'Speaker 2');

  const cleanedResult = sanitizeTranscriptResult({
    id: 'test-1',
    sourceUrl: 'https://www.youtube.com/watch?v=abc12345678',
    normalizedUrl: 'https://www.youtube.com/watch?v=abc12345678',
    platform: 'youtube',
    title: 'Test',
    language: 'English',
    durationSec: 8,
    extractionMethod: 'video-analysis',
    createdAt: '2026-11-14T20:00:00Z',
    segments: [
      { id: '1', startSec: 0, endSec: 4, speaker: 'Narrator', text: 'Narrator: Hello world.' },
    ],
  });
  assert.equal(cleanedResult.segments[0].speaker, undefined);
  assert.equal(cleanedResult.segments[0].text, 'Hello world.');
});
