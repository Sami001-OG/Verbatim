import { useEffect } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { TranscriptResult } from '../types/transcript';
import { formatTimestamp } from '../utils/transcriptFormatter';
import { getPlatformLabel } from '../utils/urlParser';
import { PlatformGlyph } from './PlatformGlyph';

interface SidebarProps {
  history: TranscriptResult[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onNewTranscript: () => void;
  onSelectHistory: (item: TranscriptResult) => void;
  onDeleteHistory: (id: string) => void;
  onClearHistory: () => void;
}

export function Sidebar({
  history,
  activeId,
  open,
  onClose,
  onNewTranscript,
  onSelectHistory,
  onDeleteHistory,
  onClearHistory,
}: SidebarProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Transcript history"
    >
      <div
        className="fixed inset-0 bg-zinc-950/35 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className="relative z-10 w-[320px] max-w-[88vw] h-full flex flex-col bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl">
        <div className="flex h-14 items-center justify-between px-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Recent Transcripts
            </h2>
            {history.length > 0 && (
              <span className="font-mono text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
                {history.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors whitespace-nowrap"
              >
                Clear all
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close transcript history"
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="p-3 border-b border-zinc-100 dark:border-zinc-800/80 shrink-0">
          <button
            type="button"
            onClick={() => {
              onNewTranscript();
              onClose();
            }}
            className="w-full inline-flex items-center justify-center gap-1.5 h-9 px-3 text-xs font-medium rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>New Transcript</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {history.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              No saved transcripts yet. Paste a link or choose a sample to get started.
            </p>
          ) : (
            <ul className="space-y-1" aria-label="Saved transcripts">
              {history.map((item) => {
                const isActive = item.id === activeId;
                return (
                  <li
                    key={item.id}
                    className={`group flex items-start gap-1 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-zinc-100/80 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700'
                        : 'border border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectHistory(item);
                        onClose();
                      }}
                      className="flex-1 min-w-0 text-left px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg"
                    >
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                        <PlatformGlyph platform={item.platform} className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{getPlatformLabel(item.platform)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums shrink-0">
                          {formatTimestamp(item.durationSec)}
                        </span>
                        {item.language && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{item.language}</span>
                          </>
                        )}
                      </div>
                      <p
                        className={`text-[13px] leading-snug line-clamp-2 ${
                          isActive
                            ? 'font-medium text-zinc-900 dark:text-zinc-50'
                            : 'text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {item.title}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteHistory(item.id)}
                      aria-label={`Delete ${item.title}`}
                      className="mt-2 mr-1.5 p-1.5 rounded-md text-zinc-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
