import { Clock, Moon, Plus, Sun } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface TopBarProps {
  hasActiveTranscript: boolean;
  historyCount: number;
  historyOpen: boolean;
  darkMode: boolean;
  onNewTranscript: () => void;
  onToggleHistory: () => void;
  onToggleDarkMode: () => void;
}

export function TopBar({
  hasActiveTranscript,
  historyCount,
  historyOpen,
  darkMode,
  onNewTranscript,
  onToggleHistory,
  onToggleDarkMode,
}: TopBarProps) {
  return (
    <header className="h-14 shrink-0 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur-xs">
      <div className="max-w-4xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-6">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNewTranscript();
          }}
          className="whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-md"
        >
          <BrandLogo size="sm" />
        </a>

        <div className="flex items-center gap-2 shrink-0">
          {hasActiveTranscript && (
            <button
              type="button"
              onClick={onNewTranscript}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/70 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>New</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleHistory}
            aria-expanded={historyOpen}
            aria-label="Open transcript history"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap"
          >
            <Clock className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
            <span>History</span>
            {historyCount > 0 && (
              <span className="font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                ({historyCount})
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            className="inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
          >
            {darkMode ? (
              <>
                <Sun className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Dark</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
