export interface LanguageOption {
  value: string;
  label: string;
  code: string;
  rtl?: boolean;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: 'auto', label: 'Auto-detect language', code: 'auto' },
  { value: 'English', label: 'English', code: 'en' },
  { value: 'Bangla', label: 'Bangla (বাংলা)', code: 'bn' },
  { value: 'Hindi', label: 'Hindi (हिन्दी)', code: 'hi' },
  { value: 'Urdu', label: 'Urdu (اردو)', code: 'ur', rtl: true },
  { value: 'Spanish', label: 'Spanish (Español)', code: 'es' },
  { value: 'Arabic', label: 'Arabic (العربية)', code: 'ar', rtl: true },
  { value: 'French', label: 'French (Français)', code: 'fr' },
  { value: 'German', label: 'German (Deutsch)', code: 'de' },
  { value: 'Portuguese', label: 'Portuguese (Português)', code: 'pt' },
  { value: 'Japanese', label: 'Japanese (日本語)', code: 'ja' },
];

export const TRANSLATE_LANGUAGE_OPTIONS = LANGUAGE_OPTIONS.filter(
  (opt) => opt.value !== 'auto',
);

export function getLanguageCode(language?: string): string {
  if (!language || language === 'auto') return 'en';
  const normalized = language.trim().toLowerCase();
  const match = LANGUAGE_OPTIONS.find(
    (opt) =>
      opt.value.toLowerCase() === normalized ||
      opt.code.toLowerCase() === normalized,
  );
  if (match) return match.code;
  if (normalized.includes('bengali') || normalized.includes('bangla')) return 'bn';
  return normalized.slice(0, 2);
}

export function isRtlLanguage(language?: string): boolean {
  if (!language) return false;
  const normalized = language.trim().toLowerCase();
  return (
    normalized === 'urdu' ||
    normalized === 'arabic' ||
    normalized === 'ur' ||
    normalized === 'ar' ||
    normalized.includes('urdu') ||
    normalized.includes('arabic')
  );
}
