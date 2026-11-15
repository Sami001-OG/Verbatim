export type PlatformType =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'x'
  | 'vimeo'
  | 'twitch'
  | 'podcast'
  | 'direct-media'
  | 'uploaded-file'
  | 'web';

export type ExtractionMethod =
  | 'caption-track'
  | 'audio-transcription'
  | 'video-analysis'
  | 'web-context'
  | 'sample';

export interface TranscriptSegment {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  speaker?: string;
}

export interface TranscriptResult {
  id: string;
  sourceUrl: string;
  normalizedUrl: string;
  platform: PlatformType;
  title: string;
  author?: string;
  language: string;
  durationSec: number;
  extractionMethod: ExtractionMethod;
  segments: TranscriptSegment[];
  createdAt: string;
}

export type TranscriptViewMode = 'timestamped' | 'plain';

export type TimestampFormat = 'auto' | 'hh:mm:ss';

export type ExportFormat =
  | 'txt-timestamps'
  | 'txt-plain'
  | 'markdown'
  | 'markdown-plain'
  | 'srt'
  | 'vtt'
  | 'csv'
  | 'html'
  | 'json';

export interface ParsedUrlInfo {
  valid: boolean;
  normalizedUrl: string;
  platform: PlatformType;
  videoId?: string;
  displayHost: string;
  error?: string;
}

export interface TranscriptStats {
  wordCount: number;
  segmentCount: number;
  durationSec: number;
  estimatedReadingMin: number;
  speakers: string[];
}
