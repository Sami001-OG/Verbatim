import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { ArrowRight, Link2, Loader2, Upload, X } from 'lucide-react';
import { getPlatformLabel, parseSourceUrl } from '../utils/urlParser';
import { SAMPLE_PRESETS, type SamplePreset } from '../data/samples';
import { PlatformGlyph } from './PlatformGlyph';

interface UrlInputPanelProps {
  urlInput: string;
  onUrlInputChange: (value: string) => void;
  hasActiveTranscript: boolean;
  isLoading: boolean;
  validationError: string | null;
  onSubmitUrl: (url: string) => void;
  onSelectSample: (preset: SamplePreset) => void;
  onUploadFile: (file: File) => void;
}

export function UrlInputPanel({
  urlInput,
  onUrlInputChange,
  hasActiveTranscript,
  isLoading,
  validationError,
  onSubmitUrl,
  onSelectSample,
  onUploadFile,
}: UrlInputPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const parsedPreview = urlInput.trim() ? parseSourceUrl(urlInput) : null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmitUrl(urlInput);
  };

  const handleDragOver = (e: DragEvent<HTMLElement>) => {
    if (isLoading) return;
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingFile(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (isLoading) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      onUploadFile(file);
    }
  };

  return (
    <section
      aria-label="Link input"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`max-w-4xl mx-auto px-4 sm:px-6 ${
        hasActiveTranscript ? 'pt-6 pb-2' : 'pt-12 sm:pt-20 pb-8'
      }`}
    >
      {!hasActiveTranscript && (
        <div className="mb-6">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 text-balance">
            Verbatim transcripts from any link
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            Paste a YouTube, TikTok, Instagram, Facebook, X, Vimeo, or media URL to extract timestamped lines or clean plain text.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="source-url-input" className="sr-only">
          Video, social, or media link
        </label>
        <div
          className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-1.5 rounded-xl bg-white dark:bg-zinc-900 border transition-all ${
            isDraggingFile
              ? 'border-blue-500 ring-2 ring-blue-500/20'
              : 'border-zinc-200/90 dark:border-zinc-800 shadow-2xs focus-within:border-zinc-400 dark:focus-within:border-zinc-600'
          }`}
        >
          <div className="relative flex-1 flex items-center">
            <div className="pointer-events-none absolute left-3 flex items-center text-zinc-400 dark:text-zinc-500">
              {parsedPreview?.valid ? (
                <PlatformGlyph
                  platform={parsedPreview.platform}
                  className="w-4 h-4 text-blue-600 dark:text-blue-400"
                />
              ) : (
                <Link2 className="w-4 h-4" aria-hidden="true" />
              )}
            </div>

            <input
              id="source-url-input"
              type="url"
              value={urlInput}
              onChange={(e) => onUrlInputChange(e.target.value)}
              placeholder="Paste a YouTube, TikTok, Instagram, Facebook, or media link..."
              disabled={isLoading}
              className="w-full h-10 pl-9 pr-9 md:pr-24 rounded-lg bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none disabled:opacity-60"
            />

            <div className="absolute right-1.5 flex items-center gap-1">
              {parsedPreview?.valid && (
                <span className="hidden md:inline text-xs font-medium text-zinc-400 dark:text-zinc-500 pr-1 whitespace-nowrap">
                  {getPlatformLabel(parsedPreview.platform)}
                </span>
              )}
              {urlInput && !isLoading && (
                <button
                  type="button"
                  onClick={() => onUrlInputChange('')}
                  aria-label="Clear link input"
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="h-10 px-4 rounded-lg bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-60 text-white dark:text-zinc-900 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                <span>Extracting...</span>
              </>
            ) : (
              <>
                <span>Get Transcript</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </>
            )}
          </button>
        </div>

        {validationError && (
          <p
            role="alert"
            className="mt-2 text-xs font-medium text-red-600 dark:text-red-400"
          >
            {validationError}
          </p>
        )}
      </form>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onUploadFile(file);
            e.target.value = '';
          }
        }}
      />

      {!hasActiveTranscript && (
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400 px-1">
          <div className="flex flex-wrap items-center gap-2">
            <span>Try a sample:</span>
            {SAMPLE_PRESETS.map((preset, idx) => (
              <span key={preset.id} className="inline-flex items-center gap-2">
                {idx > 0 && <span aria-hidden="true">·</span>}
                <button
                  type="button"
                  onClick={() => onSelectSample(preset)}
                  disabled={isLoading}
                  className="font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap"
                >
                  {preset.label}
                </button>
              </span>
            ))}
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Upload audio/video</span>
          </button>
        </div>
      )}
    </section>
  );
}
