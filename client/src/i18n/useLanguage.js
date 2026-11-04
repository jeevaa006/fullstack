import { useContext } from 'react';
import LanguageContext from './languageContext';
import { dictionaries, translate } from './translations';

const fallback = {
  lang: 'en',
  setLang: () => {},
  t: (key, params) => translate('en', key, params),
  dictionary: dictionaries.en,
};

export default function useLanguage() {
  return useContext(LanguageContext) || fallback;
}
