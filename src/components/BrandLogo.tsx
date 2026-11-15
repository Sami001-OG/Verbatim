interface BrandLogoProps {
  showWordmark?: boolean;
  size?: 'sm' | 'md';
}

export function BrandLogo({ showWordmark = true, size = 'md' }: BrandLogoProps) {
  const iconSize = size === 'sm' ? 'w-6 h-6' : 'w-7 h-7';
  const textSize = size === 'sm' ? 'text-base' : 'text-lg';

  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <svg
        viewBox="0 0 64 64"
        fill="none"
        className={`${iconSize} shrink-0`}
        aria-hidden="true"
      >
        <rect
          width="64"
          height="64"
          rx="16"
          className="fill-zinc-900 dark:fill-zinc-900"
        />
        <rect
          x="2"
          y="2"
          width="60"
          height="60"
          rx="14"
          strokeWidth="2.5"
          className="stroke-zinc-800 dark:stroke-zinc-700"
        />
        <rect x="14" y="18" width="12" height="5" rx="2.5" fill="#3b82f6" />
        <rect x="30" y="18" width="20" height="5" rx="2.5" fill="#fafafa" />
        <rect x="14" y="29.5" width="12" height="5" rx="2.5" fill="#3b82f6" />
        <rect x="30" y="29.5" width="15" height="5" rx="2.5" fill="#a1a1aa" />
        <rect x="14" y="41" width="12" height="5" rx="2.5" fill="#3b82f6" />
        <rect x="30" y="41" width="20" height="5" rx="2.5" fill="#fafafa" />
      </svg>
      {showWordmark && (
        <span
          className={`font-display ${textSize} font-semibold tracking-tight text-zinc-900 dark:text-zinc-50`}
        >
          Verbatim
        </span>
      )}
    </span>
  );
}
