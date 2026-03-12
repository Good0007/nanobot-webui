import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import zh from "./locales/zh.json";
import en from "./locales/en.json";
import ja from "./locales/ja.json";

// 根据浏览器语言或时区自动检测语言
const detectLanguage = (): string => {
  // 首先检查localStorage中是否有保存的语言设置
  const savedLang = localStorage.getItem("nanobot-lang");
  if (savedLang && ["zh", "en", "ja"].includes(savedLang)) {
    return savedLang;
  }

  // 获取浏览器语言
  const browserLang = navigator.language.toLowerCase();
  
  // 根据浏览器语言判断
  if (browserLang.startsWith("zh")) {
    return "zh";
  } else if (browserLang.startsWith("ja")) {
    return "ja";
  } else if (browserLang.startsWith("en")) {
    return "en";
  }

  // 根据时区判断（作为备用方案）
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timezone.includes("Asia/Shanghai") || timezone.includes("Asia/Hong_Kong") || timezone.includes("Asia/Taipei")) {
    return "zh";
  } else if (timezone.includes("Asia/Tokyo")) {
    return "ja";
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
      en: { translation: en },
      ja: { translation: ja },
    },
    lng: detectLanguage(),
    fallbackLng: "en",
    supportedLngs: ["zh", "en", "ja"],
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
