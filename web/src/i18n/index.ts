import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import zh from "./locales/zh.json";
import zhTW from "./locales/zh-TW.json";
import en from "./locales/en.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import pt from "./locales/pt.json";
import es from "./locales/es.json";
import vi from "./locales/vi.json";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGS,
  isSupportedLanguage,
} from "./languages";

const detectLanguage = (): string => {
  const savedLang = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (savedLang && isSupportedLanguage(savedLang)) {
    return savedLang;
  }

  const browserLang = navigator.language.toLowerCase();

  if (browserLang.startsWith("zh-tw") || browserLang.startsWith("zh-hk") || browserLang.startsWith("zh-hant")) {
    return "zh-TW";
  } else if (browserLang.startsWith("zh")) {
    return "zh";
  } else if (browserLang.startsWith("ja")) {
    return "ja";
  } else if (browserLang.startsWith("ko")) {
    return "ko";
  } else if (browserLang.startsWith("de")) {
    return "de";
  } else if (browserLang.startsWith("fr")) {
    return "fr";
  } else if (browserLang.startsWith("pt")) {
    return "pt";
  } else if (browserLang.startsWith("es")) {
    return "es";
  } else if (browserLang.startsWith("en")) {
    return "en";
  } else if (browserLang.startsWith("vi")) {
    return "vi";
  }  

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timezone.includes("Asia/Shanghai")) {
    return "zh";
  } else if (timezone.includes("Asia/Hong_Kong") || timezone.includes("Asia/Taipei")) {
    return "zh-TW";
  } else if (timezone.includes("Asia/Tokyo")) {
    return "ja";
  } else if (timezone.includes("Asia/Seoul")) {
    return "ko";
  } else if (timezone.includes("Europe/Berlin") || timezone.includes("Europe/Vienna") || timezone.includes("Europe/Zurich")) {
    return "de";
  } else if (timezone.includes("Europe/Paris") || timezone.includes("Europe/Brussels") || timezone.includes("America/Montreal")) {
    return "fr";
  } else if (
    timezone.includes("America/Sao_Paulo") ||
    timezone.includes("America/Fortaleza") ||
    timezone.includes("America/Recife") ||
    timezone.includes("Europe/Lisbon")
  ) {
    return "pt";
  } else if (
    timezone.includes("Europe/Madrid") ||
    timezone.includes("America/Mexico_City") ||
    timezone.includes("America/Bogota") ||
    timezone.includes("America/Lima") ||
    timezone.includes("America/Santiago") ||
    timezone.includes("America/Buenos_Aires")
  ) {
    return "es";
  } else if (
    timezone.includes("Asia/Ho_Chi_Minh") ||
    timezone.includes("Asia/Hanoi")
  ) {
    return "vi";
  }

  return DEFAULT_LANGUAGE;
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zh },
      "zh-TW": { translation: zhTW },
      en: { translation: en },
      ja: { translation: ja },
      ko: { translation: ko },
      de: { translation: de },
      fr: { translation: fr },
      pt: { translation: pt },
      es: { translation: es },
	  vi: { translation: vi },
    },
    lng: detectLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGS],
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
