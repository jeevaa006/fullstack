import { useMemo } from 'react';

const readToken = (name, fallback) => {
  if (typeof window === 'undefined') return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

/*
 * Charts read the same custom properties as the rest of the interface, so a palette
 * change (including a future dark theme that redefines the tokens) updates every
 * series, grid line and tooltip without touching chart code.
 */
export const useChartTheme = () => useMemo(() => ({
  series: [
    readToken('--blue-700', '#0f5580'),
    readToken('--blue-400', '#4a91bd'),
    readToken('--success', '#0d6b45'),
    readToken('--warning', '#8a4a12'),
    readToken('--error', '#a33420'),
    readToken('--blue-900', '#0a3550'),
  ],
  grid: readToken('--divider', '#e9f0f5'),
  axis: readToken('--text-secondary', '#4d6172'),
  surface: readToken('--surface', '#ffffff'),
  border: readToken('--border', '#dce6ee'),
  text: readToken('--text-primary', '#102a3c'),
  muted: readToken('--text-secondary', '#4d6172'),
  cursor: readToken('--blue-100', '#e2eff8'),
}), []);

export const TONE_INDEX = {
  primary: 0,
  secondary: 1,
  success: 2,
  warning: 3,
  danger: 4,
  deep: 5,
};
