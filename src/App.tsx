import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { UrlInputPanel } from './components/UrlInputPanel';
import { TranscriptWorkspace } from './components/TranscriptWorkspace';
import type { TranscriptResult, TranscriptViewMode } from './types/transcript';
import { sanitizeTranscriptResult } from './utils/transcriptParser';
import { getPlatformLabel, parseSourceUrl } from './utils/urlParser';
import { SAMPLE_PRESETS, type SamplePreset } from './data/samples';

const HISTORY_STORAGE_KEY = 'verbatim_transcript_history_v1';
const THEME_STORAGE_KEY = 'verbatim_theme_v1';

function loadInitialHistory(): TranscriptResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as TranscriptResult[]).map((item) => sanitizeTranscriptResult(item))
      : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [history, setHistory] = useState<TranscriptResult[]>(loadInitialHistory);
  const [activeTranscript, setActiveTranscript] = useState<TranscriptResult | null>(() => {
    const initial = loadInitialHistory();
    return initial[0] ?? null;
  });

  const [urlInput, setUrlInput] = useState('');
  const [viewMode, setViewMode] = useState<TranscriptViewMode>('timestamped');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('Extracting transcript...');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{ message: string; suggestion?: string } | null>(
    null,
  );
  const [historyOpen, setHistoryOpen] = useState(false);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  const fallbackFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // Ignore storage error
    }
  }, [darkMode]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 25)));
    } catch {
      // Ignore storage error
    }
  }, [history]);

  const saveTranscript = (result: TranscriptResult) => {
    const sanitized = sanitizeTranscriptResult(result);
    setActiveTranscript(sanitized);
    setErrorState(null);
    setValidationError(null);
    setTranslationError(null);
    setHistory((prev) => {
      const filtered = prev.filter(
        (item) => item.id !== sanitized.id && item.normalizedUrl !== sanitized.normalizedUrl,
      );
      return [sanitized, ...filtered].slice(0, 25);
    });
  };

  const handleTranslateLanguage = async (targetLanguage: string) => {
    if (!activeTranscript) return;
    setIsTranslating(true);
    setTranslationError(null);

    try {
      const resp = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: activeTranscript,
          targetLanguage,
        }),
      });

      const payload = (await resp.json()) as TranscriptResult & {
        error?: string;
      };

      if (!resp.ok) {
        setTranslationError(payload.error || `Could not translate transcript to ${targetLanguage}.`);
        return;
      }

      const sanitized = sanitizeTranscriptResult(payload);
      setActiveTranscript(sanitized);
      setHistory((prev) => {
        const filtered = prev.filter((item) => item.id !== sanitized.id);
        return [sanitized, ...filtered].slice(0, 25);
      });
    } catch {
      setTranslationError(`Network error while translating to ${targetLanguage}.`);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSubmitUrl = async (rawUrl: string) => {
    const parsed = parseSourceUrl(rawUrl);
    if (!parsed.valid) {
      setValidationError(parsed.error || 'Enter a valid link.');
      return;
    }

    setValidationError(null);
    setErrorState(null);
    setTranslationError(null);

    const matchingSample = SAMPLE_PRESETS.find(
      (preset) =>
        preset.url.toLowerCase() === parsed.normalizedUrl.toLowerCase() ||
        preset.url.toLowerCase() === rawUrl.trim().toLowerCase(),
    );
    if (matchingSample) {
      saveTranscript(matchingSample.result);
      return;
    }

    setIsLoading(true);
    setLoadingLabel(`Extracting transcript from ${getPlatformLabel(parsed.platform)}...`);

    try {
      const resp = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: parsed.normalizedUrl,
          language: 'auto',
          includeSpeakers: true,
        }),
      });

      const payload = (await resp.json()) as TranscriptResult & {
        error?: string;
        suggestion?: string;
      };

      if (!resp.ok) {
        setErrorState({
          message: payload.error || 'Unable to extract transcript from this link.',
          suggestion: payload.suggestion,
        });
        setActiveTranscript(null);
        return;
      }

      saveTranscript(payload);
    } catch {
      setErrorState({
        message: 'Network error while contacting the transcription server.',
        suggestion: 'Check your connection and try again.',
      });
      setActiveTranscript(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadFile = async (file: File) => {
    if (file.size > 24 * 1024 * 1024) {
      setErrorState({
        message: 'Selected file exceeds the 24 MB size limit.',
        suggestion: 'Export or compress the audio track as MP3 before uploading.',
      });
      return;
    }

    setValidationError(null);
    setErrorState(null);
    setTranslationError(null);
    setIsLoading(true);
    setLoadingLabel(`Transcribing ${file.name}...`);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const dataBase64 = btoa(binary);

      const resp = await fetch('/api/transcribe-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || 'audio/mp3',
          dataBase64,
          language: 'auto',
          includeSpeakers: true,
        }),
      });

      const payload = (await resp.json()) as TranscriptResult & {
        error?: string;
        suggestion?: string;
      };

      if (!resp.ok) {
        setErrorState({
          message: payload.error || 'Failed to transcribe uploaded file.',
          suggestion: payload.suggestion,
        });
        return;
      }

      saveTranscript(payload);
    } catch {
      setErrorState({
        message: 'Could not upload or transcribe this file.',
        suggestion: 'Try converting the clip to MP3 or WAV and upload again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSample = (preset: SamplePreset) => {
    setUrlInput(preset.url);
    setValidationError(null);
    saveTranscript({
      ...preset.result,
      createdAt: new Date().toISOString(),
    });
  };

  const handleNewTranscript = () => {
    setUrlInput('');
    setValidationError(null);
    setErrorState(null);
    setTranslationError(null);
    setActiveTranscript(null);
  };

  const handleDeleteHistory = (id: string) => {
    setHistory((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (activeTranscript?.id === id) {
        setActiveTranscript(next[0] ?? null);
      }
      return next;
    });
  };

  const handleClearHistory = () => {
    setHistory([]);
    setActiveTranscript(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <TopBar
        hasActiveTranscript={Boolean(activeTranscript)}
        historyCount={history.length}
        historyOpen={historyOpen}
        darkMode={darkMode}
        onNewTranscript={handleNewTranscript}
        onToggleHistory={() => setHistoryOpen((open) => !open)}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
      />

      <Sidebar
        history={history}
        activeId={activeTranscript?.id ?? null}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onNewTranscript={handleNewTranscript}
        onSelectHistory={(item) => {
          setActiveTranscript(item);
          setUrlInput(item.sourceUrl.startsWith('http') ? item.sourceUrl : '');
          setErrorState(null);
          setValidationError(null);
          setTranslationError(null);
        }}
        onDeleteHistory={handleDeleteHistory}
        onClearHistory={handleClearHistory}
      />

      <main className="flex-1 min-w-0">
        <UrlInputPanel
          urlInput={urlInput}
          onUrlInputChange={(val) => {
            setUrlInput(val);
            if (validationError) setValidationError(null);
          }}
          hasActiveTranscript={Boolean(activeTranscript)}
          isLoading={isLoading}
          validationError={validationError}
          onSubmitUrl={handleSubmitUrl}
          onSelectSample={handleSelectSample}
          onUploadFile={handleUploadFile}
        />

        <input
          ref={fallbackFileInputRef}
          type="file"
          accept="audio/*,video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleUploadFile(file);
              e.target.value = '';
            }
          }}
        />

        <TranscriptWorkspace
          transcript={activeTranscript}
          isLoading={isLoading}
          loadingLabel={loadingLabel}
          errorState={errorState}
          isTranslating={isTranslating}
          translationError={translationError}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onTranslateLanguage={handleTranslateLanguage}
          onRetry={() => handleSubmitUrl(urlInput)}
          onSelectSample={handleSelectSample}
          onRequestUpload={() => fallbackFileInputRef.current?.click()}
        />
      </main>
    </div>
  );
}
