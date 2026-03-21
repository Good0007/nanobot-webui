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

const SUPPORTED_LANGS = ["zh", "zh-TW", "en", "ja", "ko", "de", "fr"] as const;

// 根据浏览器语言或时区自动检测语言
const detectLanguage = (): string => {
  // 首先检查localStorage中是否有保存的语言设置
  const savedLang = localStorage.getItem("nanobot-lang");
  if (savedLang && (SUPPORTED_LANGS as readonly string[]).includes(savedLang)) {
    return savedLang;
  }

  // 获取浏览器语言
  const browserLang = navigator.language.toLowerCase();

  // 根据浏览器语言判断
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
  } else if (browserLang.startsWith("en")) {
    return "en";
  }

  // 根据时区判断（作为备用方案）
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
  }

  // 默认返回英语
  return "en";
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
    },
    lng: detectLanguage(),
    fallbackLng: "en",
    supportedLngs: [...SUPPORTED_LANGS],
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "nanobot-lang",
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
