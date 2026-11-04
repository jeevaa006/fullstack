/**
 * Role-based language rules and translation completeness.
 * No browser required: localStorage is stubbed and the pure rule module is used.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dictionaries } from '../client/src/i18n/translations.js';
import {
  canChooseLanguage,
  languageStorageKey,
  readLanguagePreference,
  resolveLanguage,
  saveLanguagePreference,
} from '../client/src/i18n/languagePreference.js';

const patient = { id: 'p1', email: 'asha@example.com', role: 'patient' };
const otherPatient = { id: 'p2', email: 'ravi@example.com', role: 'patient' };
const doctor = { id: 'd1', email: 'dr@example.com', role: 'doctor' };
const admin = { id: 'a1', email: 'admin@example.com', role: 'admin' };

test('patients may choose a language; staff and visitors may not', () => {
  assert.equal(canChooseLanguage(patient), true);
  assert.equal(canChooseLanguage(doctor), false);
  assert.equal(canChooseLanguage(admin), false);
  assert.equal(canChooseLanguage(null), false);
  assert.equal(canChooseLanguage(undefined), false);
});

test('language resolves to Tamil only for a patient who saved Tamil', () => {
  assert.equal(resolveLanguage(patient, 'ta'), 'ta');
  assert.equal(resolveLanguage(patient, 'en'), 'en');
  assert.equal(resolveLanguage(patient, 'fr'), 'en');
  assert.equal(resolveLanguage(patient, undefined), 'en');
  assert.equal(resolveLanguage(doctor, 'ta'), 'en');
  assert.equal(resolveLanguage(admin, 'ta'), 'en');
  assert.equal(resolveLanguage(null, 'ta'), 'en');
});

test('saved preferences are isolated per patient account and never set for staff', () => {
  const store = new Map();
  globalThis.window = { localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) } };

  assert.equal(saveLanguagePreference(patient, 'ta'), true);
  assert.equal(readLanguagePreference(patient), 'ta');
  assert.equal(readLanguagePreference(otherPatient), 'en');
  assert.equal(languageStorageKey(patient) === languageStorageKey(otherPatient), false);

  assert.equal(saveLanguagePreference(doctor, 'ta'), false);
  assert.equal(saveLanguagePreference(admin, 'ta'), false);
  assert.equal(readLanguagePreference(doctor), 'en');
  assert.equal(readLanguagePreference(admin), 'en');
  assert.equal(store.has(languageStorageKey(doctor)), false);

  delete globalThis.window;
});

const leafKeys = (value, prefix = '') => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leafKeys(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
};

const placeholders = (value) => [...String(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

test('English and Tamil dictionaries expose exactly the same keys', () => {
  const english = leafKeys(dictionaries.en);
  const tamil = leafKeys(dictionaries.ta);
  const missingInTamil = english.filter((key) => !tamil.includes(key));
  const extraInTamil = tamil.filter((key) => !english.includes(key));

  assert.deepEqual(missingInTamil, []);
  assert.deepEqual(extraInTamil, []);
});

test('every Tamil string is non-empty and keeps the English placeholders', () => {
  const english = leafKeys(dictionaries.en);
  for (const key of english) {
    const lookup = (dictionary) => key
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .reduce((value, part) => value?.[part], dictionary);
    const en = lookup(dictionaries.en);
    const ta = lookup(dictionaries.ta);

    assert.equal(typeof en, 'string', `English value missing for ${key}`);
    assert.equal(typeof ta, 'string', `Tamil value missing for ${key}`);
    assert.ok(ta.trim().length > 0, `Tamil value empty for ${key}`);
    assert.deepEqual(placeholders(ta), placeholders(en), `Placeholder mismatch for ${key}`);
  }
});
