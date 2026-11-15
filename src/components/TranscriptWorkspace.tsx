import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Languages,
  Loader2,
  RotateCcw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import type {
  ExportFormat,
  TimestampFormat,
  TranscriptResult,
  TranscriptViewMode,
} from '../types/transcript';
import { isRtlLanguage, TRANSLATE_LANGUAGE_OPTIONS } from '../utils/languages';
import {
  buildExportContent,
  buildPlainText,
  buildPlainTextParagraphs,
  buildTimestampedText,
  computeTranscriptStats,
  filterSegments,
  formatTimestamp,
} from '../utils/transcriptFormatter';
import { getPlatformLabel } from '../utils/urlParser';
import { sanitizeSpeakerLabel } from '../utils/transcriptParser';
import { type SamplePreset } from '../data/samples';
import { PlatformGlyph } from './PlatformGlyph';
import { ThemedSelect } from './ThemedSelect';

interface TranscriptWorkspaceProps {
  transcript: TranscriptResult | null;
  isLoading: boolean;
  loadingLabel: string;
  errorState: { message: string; suggestion?: string } | null;
  isTranslating: boolean;
  translationError: string | null;
  viewMode: TranscriptViewMode;
  onViewModeChange: (mode: TranscriptViewMode) => void;
  onTranslateLanguage: (targetLanguage: string) => void;
  onRetry: () => void;
  onSelectSample: (preset: SamplePreset) => void;
  onRequestUpload: () => void;
}

const EXPORT_OPTIONS: Array<{
  format: ExportFormat;
  label: string;
  detail: string;
  ext: string;
}> = [
  { format: 'txt-timestamps', label: 'Text (With Timestamps)', detail: '[00:14] Line by line', ext: '.TXT' },
  { format: 'txt-plain', label: 'Text (Plain Prose)', detail: 'Clean readable paragraphs', ext: '.TXT' },
  { format: 'markdown', label: 'Markdown (Timestamped)', detail: 'Bullet timecodes & metadata', ext: '.MD' },
  { format: 'markdown-plain', label: 'Markdown (Plain Prose)', detail: 'Prose notes & metadata', ext: '.MD' },
  { format: 'srt', label: 'SubRip Subtitles', detail: 'Video editor caption track', ext: '.SRT' },
  { format: 'vtt', label: 'WebVTT Captions', detail: 'HTML5 web captions', ext: '.VTT' },
  { format: 'csv', label: 'CSV Spreadsheet', detail: 'Start, end, speaker & text', ext: '.CSV' },
  { format: 'html', label: 'HTML Document', detail: 'Formatted standalone page', ext: '.HTML' },
  { format: 'json', label: 'Structured JSON', detail: 'Full segment metadata', ext: '.JSON' },
];

async function copyTextWithFallback(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to execCommand fallback
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function highlightMatch(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark
        key={i}
        className="bg-blue-100 dark:bg-blue-900/60 text-zinc-900 dark:text-zinc-50 rounded-xs px-0.5"
      >
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function TranscriptWorkspace({
  transcript,
  isLoading,
  loadingLabel,
  errorState,
  isTranslating,
  translationError,
  viewMode,
  onViewModeChange,
  onTranslateLanguage,
  onRetry,
  onRequestUpload,
}: TranscriptWorkspaceProps) {
  const [timestampFormat, setTimestampFormat] = useState<TimestampFormat>('auto');
  const [showSpeakers, setShowSpeakers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [speakerFilter, setSpeakerFilter] = useState('all');
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedSegmentId, setCopiedSegmentId] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchQuery('');
    setSpeakerFilter('all');
    setCopiedAll(false);
    setCopiedSegmentId(null);
  }, [transcript?.id]);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [exportMenuOpen]);

  const stats = useMemo(() => {
    if (!transcript) return null;
    return computeTranscriptStats(transcript.segments, transcript.durationSec);
  }, [transcript]);

  const filteredSegments = useMemo(() => {
    if (!transcript) return [];
    return filterSegments(transcript.segments, searchQuery, speakerFilter);
  }, [transcript, searchQuery, speakerFilter]);

  const plainParagraphs = useMemo(() => {
    return buildPlainTextParagraphs(filteredSegments, {
      includeSpeakers: showSpeakers,
    });
  }, [filteredSegments, showSpeakers]);

  const handleCopyTranscript = async () => {
    if (!transcript) return;
    const fullTranscriptText =
      viewMode === 'timestamped'
        ? buildTimestampedText(transcript.segments, {
            timestampFormat,
            includeSpeakers: showSpeakers,
          })
        : buildPlainText(transcript.segments, {
            includeSpeakers: showSpeakers,
          });

    const ok = await copyTextWithFallback(fullTranscriptText);
    if (ok) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  const handleCopySegment = async (
    segId: string,
    startSec: number,
    text: string,
    speaker?: string,
  ) => {
    const ts = formatTimestamp(startSec, timestampFormat);
    const speakerPrefix = showSpeakers && speaker ? `${speaker}: ` : '';
    const line = `[${ts}] ${speakerPrefix}${text}`;
    const ok = await copyTextWithFallback(line);
    if (ok) {
      setCopiedSegmentId(segId);
      setTimeout(() => setCopiedSegmentId((prev) => (prev === segId ? null : prev)), 1500);
    }
  };

  const handleExport = (format: ExportFormat) => {
    if (!transcript) return;
    const { content, filename, mimeType } = buildExportContent(transcript, format, {
      includeSpeakers: showSpeakers,
      timestampFormat,
      includeTimestamps: viewMode === 'timestamped',
    });
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setExportMenuOpen(false);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4" aria-busy="true" aria-live="polite">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 space-y-5">
          <div className="space-y-1 pb-4 border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {loadingLabel}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Retrieving captions or transcribing spoken audio with exact timestamps.
            </p>
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-start gap-4 py-1">
              <div className="h-4 w-14 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-full rounded bg-zinc-100 dark:bg-zinc-800/80 animate-pulse" />
                {i % 2 === 0 && (
                  <div className="h-4 w-4/5 rounded bg-zinc-100 dark:bg-zinc-800/60 animate-pulse" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (errorState) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
        <div
          role="alert"
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Could not extract transcript from this link
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {errorState.message}
              </p>
              {errorState.suggestion && (
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {errorState.suggestion}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-medium transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Try Again</span>
                </button>
                <button
                  type="button"
                  onClick={onRequestUpload}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-medium transition-colors whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Upload Audio / Video File</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!transcript || !stats) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 border-t border-zinc-200/80 dark:border-zinc-800/80">
          <div>
            <p className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
              01
            </p>
            <h2 className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Any Link or Media
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              YouTube, TikTok, Instagram, Facebook, X, Vimeo, podcasts, and direct MP3 or MP4 files.
            </p>
          </div>
          <div>
            <p className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
              02
            </p>
            <h2 className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Timestamps &amp; Languages
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Toggle between timecoded lines and clean prose, or translate into English, Bangla, Hindi, Urdu, Spanish, and Arabic.
            </p>
          </div>
          <div>
            <p className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
              03
            </p>
            <h2 className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Copy &amp; 9 Export Formats
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Copy to clipboard in one click or download as TXT, Markdown, SRT, VTT, CSV, HTML, or JSON.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isRtl = isRtlLanguage(transcript.language);
  const currentLangOption = TRANSLATE_LANGUAGE_OPTIONS.find(
    (opt) => opt.value.toLowerCase() === transcript.language.toLowerCase(),
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-3 pb-16">
      <article className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
        {/* Transcript Header & Unboxed Metadata */}
        <div className="px-5 sm:px-6 py-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0 flex-1" dir={isRtl ? 'rtl' : 'ltr'}>
              <h1 className="font-display text-lg sm:text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 text-balance">
                {transcript.title}
              </h1>
              <div
                dir="ltr"
                className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400"
              >
                <span className="inline-flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
                  <PlatformGlyph platform={transcript.platform} className="w-3.5 h-3.5" />
                  <span>{getPlatformLabel(transcript.platform)}</span>
                </span>
                {transcript.author && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{transcript.author}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {formatTimestamp(stats.durationSec)}
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{stats.wordCount.toLocaleString()} words</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{stats.estimatedReadingMin} min read</span>
                <span aria-hidden="true">·</span>
                <span>{transcript.language}</span>
              </div>
            </div>

            {transcript.normalizedUrl.startsWith('http') && (
              <a
                href={transcript.normalizedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
              >
                <span>Source</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>

        {/* Sticky Minimal Reader Toolbar */}
        <div className="lg:sticky lg:top-0 z-20 px-5 sm:px-6 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/95 dark:bg-zinc-950/90 backdrop-blur-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="tablist"
                aria-label="Transcript timestamp mode"
                className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/70 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'timestamped'}
                  onClick={() => onViewModeChange('timestamped')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    viewMode === 'timestamped'
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>With Timestamps</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'plain'}
                  onClick={() => onViewModeChange('plain')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    viewMode === 'plain'
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Without Timestamps</span>
                </button>
              </div>

              {viewMode === 'timestamped' && (
                <ThemedSelect
                  id="timestamp-format-select"
                  ariaLabel="Timestamp format"
                  value={timestampFormat}
                  onChange={(val) => setTimestampFormat(val as TimestampFormat)}
                  mono
                  minWidthClass="min-w-[124px]"
                  options={[
                    { value: 'auto', label: '00:00' },
                    { value: 'hh:mm:ss', label: '00:00:00' },
                  ]}
                />
              )}

              <ThemedSelect
                id="workspace-translate-select"
                ariaLabel="Transcript language"
                value={currentLangOption?.value ?? ''}
                placeholderLabel={transcript.language}
                disabled={isTranslating}
                minWidthClass="min-w-[200px]"
                icon={
                  isTranslating ? (
                    <Loader2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-spin" aria-hidden="true" />
                  ) : (
                    <Languages className="w-3.5 h-3.5" aria-hidden="true" />
                  )
                }
                options={TRANSLATE_LANGUAGE_OPTIONS}
                onChange={(val) => {
                  if (val) onTranslateLanguage(val);
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyTranscript}
                className="h-8 px-3 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {copiedAll ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copy to Clipboard</span>
                  </>
                )}
              </button>

              <div className="relative" ref={exportMenuRef}>
                <button
                  type="button"
                  aria-expanded={exportMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setExportMenuOpen((open) => !open)}
                  className="h-8 px-3 rounded-md bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Export</span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>

                {exportMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Export transcript formats"
                    className="absolute right-0 mt-1.5 w-[320px] sm:w-[400px] max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl shadow-zinc-950/10 dark:shadow-black/50 overflow-hidden z-40"
                  >
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-zinc-950/80 border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                          <th scope="col" className="px-3.5 py-2 font-medium">
                            Format
                          </th>
                          <th scope="col" className="hidden sm:table-cell px-2 py-2 font-medium">
                            Structure
                          </th>
                          <th scope="col" className="px-3.5 py-2 text-right font-medium">
                            File
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                        {EXPORT_OPTIONS.map((opt) => (
                          <tr
                            key={opt.format}
                            onClick={() => handleExport(opt.format)}
                            className="group cursor-pointer hover:bg-blue-50/70 dark:hover:bg-blue-950/30 transition-colors"
                          >
                            <td className="px-3.5 py-2">
                              <button
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExport(opt.format);
                                }}
                                className="w-full text-left text-xs font-medium text-zinc-900 dark:text-zinc-100 group-hover:text-blue-700 dark:group-hover:text-blue-300 focus-visible:outline-none focus-visible:underline"
                              >
                                {opt.label}
                              </button>
                            </td>
                            <td className="hidden sm:table-cell px-2 py-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                              {opt.detail}
                            </td>
                            <td className="px-3.5 py-2 text-right">
                              <span className="font-mono text-[11px] font-medium text-blue-600 dark:text-blue-400">
                                {opt.ext}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-200/70 dark:border-zinc-800/80">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex items-center">
                <Search
                  className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute left-2.5 pointer-events-none"
                  aria-hidden="true"
                />
                <label htmlFor="transcript-search-input" className="sr-only">
                  Search transcript
                </label>
                <input
                  id="transcript-search-input"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search transcript..."
                  className="h-8 w-44 sm:w-56 pl-8 pr-7 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear transcript search"
                    className="absolute right-1.5 p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    <X className="w-3 h-3" aria-hidden="true" />
                  </button>
                )}
              </div>

              {stats.speakers.length > 0 && (
                <>
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showSpeakers}
                      onChange={(e) => setShowSpeakers(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-zinc-300 dark:border-zinc-700 text-blue-600 focus:ring-blue-600"
                    />
                    <span className="whitespace-nowrap">Show speakers</span>
                  </label>

                  {stats.speakers.length > 1 && (
                    <ThemedSelect
                      id="speaker-filter-select"
                      ariaLabel="Filter by speaker"
                      value={speakerFilter}
                      onChange={setSpeakerFilter}
                      minWidthClass="min-w-[160px]"
                      options={[
                        { value: 'all', label: `All speakers (${stats.speakers.length})` },
                        ...stats.speakers.map((speaker) => ({ value: speaker, label: speaker })),
                      ]}
                    />
                  )}
                </>
              )}
            </div>

            {isTranslating && (
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                Translating transcript...
              </span>
            )}
          </div>
        </div>

        {translationError && (
          <div
            role="alert"
            className="px-5 sm:px-6 py-2.5 border-b border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-xs font-medium text-red-700 dark:text-red-300"
          >
            {translationError}
          </div>
        )}

        {(searchQuery || speakerFilter !== 'all') && (
          <div className="px-5 sm:px-6 py-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/30 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span className="tabular-nums">
              Showing {filteredSegments.length} of {transcript.segments.length} segments
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSpeakerFilter('all');
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Reset filters
            </button>
          </div>
        )}

        {/* Transcript Content Area */}
        <div className="px-5 sm:px-6 py-6" dir={isRtl ? 'rtl' : 'ltr'}>
          {filteredSegments.length === 0 ? (
            <div className="py-10 text-center" dir="ltr">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                No transcript segments match &ldquo;{searchQuery}&rdquo;
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSpeakerFilter('all');
                }}
                className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear search filter
              </button>
            </div>
          ) : viewMode === 'timestamped' ? (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80" data-testid="timestamped-list">
              {filteredSegments.map((seg) => {
                const formattedTs = formatTimestamp(seg.startSec, timestampFormat);
                const isSegCopied = copiedSegmentId === seg.id;
                const cleanSpeaker = sanitizeSpeakerLabel(seg.speaker);
                return (
                  <div
                    key={seg.id}
                    className="group py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-4 hover:bg-zinc-50/90 dark:hover:bg-zinc-800/35 -mx-2.5 px-2.5 rounded-lg transition-colors"
                  >
                    <button
                      type="button"
                      dir="ltr"
                      onClick={() =>
                        handleCopySegment(seg.id, seg.startSec, seg.text, cleanSpeaker)
                      }
                      aria-label={`Copy segment at ${formattedTs}`}
                      title="Click to copy timestamped line"
                      className="w-16 shrink-0 text-left font-mono text-xs tabular-nums text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded px-1 py-0.5"
                    >
                      {isSegCopied ? 'Copied' : formattedTs}
                    </button>

                    <p className="flex-1 text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200 dark:tracking-[0.005em]">
                      {showSpeakers && cleanSpeaker && (
                        <span className="font-semibold text-zinc-900 dark:text-zinc-50 me-2">
                          {cleanSpeaker}:
                        </span>
                      )}
                      {highlightMatch(seg.text, searchQuery)}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-5" data-testid="plain-text-view">
              {plainParagraphs.map((paragraph, idx) => (
                <p
                  key={idx}
                  className="text-[15.5px] leading-[1.75] text-zinc-800 dark:text-zinc-200"
                >
                  {highlightMatch(paragraph, searchQuery)}
                </p>
              ))}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
