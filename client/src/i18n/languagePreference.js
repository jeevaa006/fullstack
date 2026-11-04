import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './translations.js';

export const LANGUAGE_STORAGE_KEY = 'carebridge.language';

/* Only patient accounts may choose a language. Doctor and administrator
 * interfaces are always English, regardless of any saved preference. */
export const canChooseLanguage = (user) => user?.role === 'patient';

export const resolveLanguage = (user, preference) => {
  if (!canChooseLanguage(user)) return DEFAULT_LANGUAGE;
  return SUPPORTED_LANGUAGES.includes(preference) ? preference : DEFAULT_LANGUAGE;
};

/* Preferences are stored per account so switching roles/users on the same
 * device cannot carry one person's language choice into another workspace. */
export const languageStorageKey = (user) => {
  const identity = user?.id || user?._id || user?.email;
  return identity ? `${LANGUAGE_STORAGE_KEY}.${identity}` : LANGUAGE_STORAGE_KEY;
};

export const readLanguagePreference = (user) => {
  if (!canChooseLanguage(user)) return DEFAULT_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(languageStorageKey(user));
    return SUPPORTED_LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
};

export const saveLanguagePreference = (user, language) => {
  if (!canChooseLanguage(user) || !SUPPORTED_LANGUAGES.includes(language)) return false;
  try {
    window.localStorage.setItem(languageStorageKey(user), language);
  } catch {
    // Saving is optional; the interface still switches for this session.
  }
  return true;
};
