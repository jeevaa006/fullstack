import { useId } from 'react';
import PropTypes from 'prop-types';
import { Globe } from 'lucide-react';
import useLanguage from './useLanguage';
import { SUPPORTED_LANGUAGES } from './translations';

export default function LanguageSwitcher({ compact = false }) {
  const { lang, setLang, t } = useLanguage();
  const id = useId();

  return (
    <div className={`language-switcher${compact ? ' is-compact' : ''}`}>
      <Globe size={15} aria-hidden="true" />
      <label className="sr-only" htmlFor={id}>{t('language.label')}</label>
      <select
        id={id}
        value={lang}
        onChange={(event) => setLang(event.target.value)}
        aria-label={t('language.label')}
      >
        {SUPPORTED_LANGUAGES.map((code) => (
          <option key={code} value={code}>{code === 'ta' ? 'தமிழ்' : 'English'}</option>
        ))}
      </select>
    </div>
  );
}

LanguageSwitcher.propTypes = { compact: PropTypes.bool };
