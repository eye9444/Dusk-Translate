export const LANGUAGES = Object.freeze({
  ja: Object.freeze({ name:'Japanese', nativeName:'日本語' }),
  en: Object.freeze({ name:'English', nativeName:'English' }),
  vi: Object.freeze({ name:'Vietnamese', nativeName:'Tiếng Việt' }),
  ru: Object.freeze({ name:'Russian', nativeName:'Русский' }),
  de: Object.freeze({ name:'German', nativeName:'Deutsch' }),
  es: Object.freeze({ name:'Spanish', nativeName:'Español' }),
  it: Object.freeze({ name:'Italian', nativeName:'Italiano' }),
});

export const TRANSLATION_TARGETS = Object.freeze({
  ja: Object.freeze(['en','vi','ru','de','es','it']),
  en: Object.freeze(['vi','ru','de','es','it']),
});

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
  return TRANSLATION_TARGETS[sourceLanguage]?.includes(targetLanguage) === true;
}
