import { isSupportedLanguagePair, normalizeLanguagePair } from './languages.js';

const key = user => `dusk-language-pair:${user?.id || 'guest'}`;
export function readLanguagePreference(user, storage = localStorage) {
  const account = user?.user_metadata?.translation_language_pair;
  if (account && isSupportedLanguagePair(account.sourceLanguage, account.targetLanguage)) return normalizeLanguagePair(account.sourceLanguage, account.targetLanguage);
  try {
    const saved = JSON.parse(storage.getItem(key(user)));
    if (saved && isSupportedLanguagePair(saved.sourceLanguage, saved.targetLanguage)) return normalizeLanguagePair(saved.sourceLanguage, saved.targetLanguage);
  } catch {}
  return normalizeLanguagePair();
}
export function storeLanguagePreference(user, pair, storage = localStorage) {
  storage.setItem(key(user), JSON.stringify(normalizeLanguagePair(pair.sourceLanguage, pair.targetLanguage)));
}
export function needsLanguageSetup(user) {
  if (!user || user.user_metadata?.translation_language_pair) return false;
  if (user.user_metadata?.dusk_language_setup_pending === true) return true;
  // Google creates its account and first sign-in together; email signup carries a pending flag through confirmation.
  const created = Date.parse(user.created_at), signedIn = Date.parse(user.last_sign_in_at);
  return Number.isFinite(created) && Number.isFinite(signedIn) && Math.abs(signedIn - created) < 60000;
}
