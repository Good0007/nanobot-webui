export const LANGUAGE_STORAGE_KEY = "nanobot-lang";

export const LANGUAGE_OPTIONS = [
  { code: "zh", label: "中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "pt", label: "Português" },
  { code: "es", label: "Español" },
] as const;

export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export const SUPPORTED_LANGS: LanguageCode[] = LANGUAGE_OPTIONS.map(
  (option) => option.code,
);

const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  zh: "中文",
  "zh-TW": "繁體中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  de: "Deutsch",
  fr: "Français",
  pt: "Português",
  es: "Español",
};

const supportedLangSet = new Set<string>(SUPPORTED_LANGS);

export function isSupportedLanguage(value: string): value is LanguageCode {
  return supportedLangSet.has(value);
}

export function getLanguageLabel(value: string): string {
  if (isSupportedLanguage(value)) {
    return LANGUAGE_LABELS[value];
  }
  return LANGUAGE_LABELS[DEFAULT_LANGUAGE];
}
