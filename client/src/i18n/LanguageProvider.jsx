import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import LanguageContext from './languageContext';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, dictionaries, translate } from './translations';

const STORAGE_KEY = 'carebridge.language';

function initialLanguage() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED_LANGUAGES.includes(stored)) return stored;
  } catch {
    // Private browsing can block local storage; fall back to the browser preference.
  }
  const browserLanguage = typeof navigator !== 'undefined' ? String(navigator.language || '') : '';
  return browserLanguage.toLowerCase().startsWith('ta') ? 'ta' : DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }) {
  const [lang, setLanguage] = useState(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Saving the preference is optional; the interface still switches for this session.
    }
  }, [lang]);

  const setLang = useCallback((next) => {
    setLanguage(SUPPORTED_LANGUAGES.includes(next) ? next : DEFAULT_LANGUAGE);
  }, []);

  const t = useCallback((key, params) => translate(lang, key, params), [lang]);

  const value = useMemo(() => ({ lang, setLang, t, dictionary: dictionaries[lang] || dictionaries[DEFAULT_LANGUAGE] }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

LanguageProvider.propTypes = { children: PropTypes.node.isRequired };
