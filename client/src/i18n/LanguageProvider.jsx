import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import LanguageContext from './languageContext';
import { DEFAULT_LANGUAGE, dictionaries, translate } from './translations';
import useAuth from '../context/useAuth';
import {
  canChooseLanguage,
  readLanguagePreference,
  resolveLanguage,
  saveLanguagePreference,
} from './languagePreference';

/**
 * Language is resolved from the authenticated role on every render:
 * - patients use their saved English/Tamil preference;
 * - doctors, administrators and signed-out visitors always get English.
 * A patient preference can therefore never change a staff interface.
 */
export function LanguageProvider({ children }) {
  const { user } = useAuth();
  const [preference, setPreference] = useState(DEFAULT_LANGUAGE);

  // Load the saved choice whenever the signed-in account changes. This runs
  // before paint so a patient's Tamil page does not flash English on refresh.
  useLayoutEffect(() => {
    setPreference(readLanguagePreference(user));
  }, [user]);

  const lang = resolveLanguage(user, preference);
  const canSwitch = canChooseLanguage(user);

  useLayoutEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next) => {
    if (!canChooseLanguage(user)) return;
    setPreference(next);
    saveLanguagePreference(user, next);
  }, [user]);

  const t = useCallback((key, params) => translate(lang, key, params), [lang]);

  const value = useMemo(() => ({
    lang,
    setLang,
    t,
    canSwitch,
    dictionary: dictionaries[lang] || dictionaries[DEFAULT_LANGUAGE],
  }), [lang, setLang, t, canSwitch]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

LanguageProvider.propTypes = { children: PropTypes.node.isRequired };
