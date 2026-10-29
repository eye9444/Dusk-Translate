export const LANGUAGES = Object.freeze({
  ja: Object.freeze({ name:'Japanese', nativeName:'日本語' }),
  en: Object.freeze({ name:'English', nativeName:'English' }),
  vi: Object.freeze({ name:'Vietnamese', nativeName:'Tiếng Việt' }),
  ru: Object.freeze({ name:'Russian', nativeName:'Русский' }),
  de: Object.freeze({ name:'German', nativeName:'Deutsch' }),
  es: Object.freeze({ name:'Spanish', nativeName:'Español' }),
  it: Object.freeze({ name:'Italian', nativeName:'Italiano' }),
  pt: Object.freeze({ name:'Portuguese', nativeName:'Português' }),
  ko: Object.freeze({ name:'Korean', nativeName:'한국어' }),
  'zh-Hans': Object.freeze({ name:'Simplified Chinese', nativeName:'简体中文' }),
});

export const TRANSLATION_TARGETS = Object.freeze({
  ja: Object.freeze(['en','vi','ru','de','es','it','pt','ko','zh-Hans']),
  en: Object.freeze(['vi','ru','de','es','it','pt','ko','zh-Hans']),
  vi: Object.freeze(['en']),
  ru: Object.freeze(['en']),
  de: Object.freeze(['en']),
  es: Object.freeze(['en']),
  it: Object.freeze(['en']),
  pt: Object.freeze(['en']),
  ko: Object.freeze(['en']),
  'zh-Hans': Object.freeze(['en']),
});

export function epubLanguageCode(value = '') {
  const code = value.trim().replaceAll('_', '-').toLowerCase();
  if (/^zh(?:$|-hans(?:-|$)|-(?:cn|sg)$)/.test(code)) return 'zh-Hans';
  if (code.startsWith('zh-')) return code;
  return code.split('-')[0];
}

export function languageName(code) {
  return LANGUAGES[code]?.name || code;
}

export function normalizeLanguagePair(sourceLanguage = 'ja', targetLanguage = 'en') {
  const source = Object.hasOwn(TRANSLATION_TARGETS, sourceLanguage) ? sourceLanguage : 'ja';
  const targets = TRANSLATION_TARGETS[source];
  return {
    sourceLanguage:source,
    targetLanguage:targets.includes(targetLanguage) ? targetLanguage : targets[0],
  };
}

export function isSupportedLanguagePair(sourceLanguage, targetLanguage) {
  return typeof sourceLanguage==='string' && typeof targetLanguage==='string' && Object.hasOwn(TRANSLATION_TARGETS,sourceLanguage) && TRANSLATION_TARGETS[sourceLanguage].includes(targetLanguage);
}
