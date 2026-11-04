/**
 * Unit tests for the shared Enter-navigation logic.
 * A tiny fake DOM keeps these tests browser-free and dependency-free.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getSmartEnterFields, handleSmartEnterKeyDown } from '../client/src/smartEnter.js';

class FakeElement {
  constructor(tagName, props = {}) {
    this.tagName = tagName.toUpperCase();
    this.type = props.type ?? (this.tagName === 'INPUT' ? 'text' : undefined);
    this.disabled = Boolean(props.disabled);
    this.hidden = Boolean(props.hidden);
    this.ariaHidden = props.ariaHidden ?? null;
    this.ignore = Boolean(props.ignore);
    this.fieldsetDisabled = Boolean(props.fieldsetDisabled);
    this.isContentEditable = Boolean(props.isContentEditable);
    this.checked = Boolean(props.checked);
    this.focusCount = 0;
  }

  getAttribute(name) { return name === 'aria-hidden' ? this.ariaHidden : null; }

  closest(selector) {
    if (selector === 'fieldset[disabled]') return this.fieldsetDisabled ? this : null;
    if (selector === '[data-smart-enter="ignore"]') return this.ignore ? this : null;
    return null;
  }

  getClientRects() { return this.hidden ? [] : [{}]; }

  focus() { this.focusCount += 1; }

  click() { if (this.type === 'checkbox') this.checked = !this.checked; }
}

globalThis.HTMLElement = FakeElement;
globalThis.window = { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) };

const makeForm = (...fields) => {
  const submitter = new FakeElement('button', { type: 'submit' });
  const form = {
    elements: [...fields, submitter],
    submitted: 0,
    lastSubmitter: null,
    requestSubmit(element) { this.submitted += 1; this.lastSubmitter = element; },
  };
  return { form, submitter, fields };
};

const makeEvent = (target, form, overrides = {}) => ({
  key: 'Enter',
  target,
  currentTarget: form,
  defaultPrevented: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  keyCode: 13,
  nativeEvent: { isComposing: false },
  ...overrides,
  preventDefault() { this.defaultPrevented = true; },
});

const pressEnter = (target, form, options = {}) => {
  const event = makeEvent(target, form);
  handleSmartEnterKeyDown(event, options);
  return event;
};

test('Enter in Email validates, focuses Password and never submits', () => {
  const email = new FakeElement('input', { type: 'email' });
  const password = new FakeElement('input', { type: 'password' });
  const { form } = makeForm(email, password);
  const validations = [];
  const event = pressEnter(email, form, { beforeAdvance: (element) => { validations.push(element); return true; } });

  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(validations, [email]);
  assert.equal(password.focusCount, 1);
  assert.equal(form.submitted, 0);
});

test('Enter in the final Password field submits the form once', () => {
  const email = new FakeElement('input', { type: 'email' });
  const password = new FakeElement('input', { type: 'password' });
  const { form, submitter } = makeForm(email, password);

  const event = pressEnter(password, form);

  assert.equal(event.defaultPrevented, true);
  assert.equal(form.submitted, 1);
  assert.equal(form.lastSubmitter, submitter);
});

test('Enter steps through first, intermediate and final inputs', () => {
  const first = new FakeElement('input');
  const second = new FakeElement('input');
  const third = new FakeElement('input');
  const { form } = makeForm(first, second, third);

  pressEnter(first, form);
  assert.equal(second.focusCount, 1);
  assert.equal(form.submitted, 0);

  pressEnter(second, form);
  assert.equal(third.focusCount, 1);
  assert.equal(form.submitted, 0);

  pressEnter(third, form);
  assert.equal(form.submitted, 1);
});

test('Enter keeps focus when beforeAdvance rejects an invalid email', () => {
  const email = new FakeElement('input', { type: 'email' });
  const password = new FakeElement('input', { type: 'password' });
  const { form } = makeForm(email, password);

  const event = pressEnter(email, form, { beforeAdvance: () => false });

  assert.equal(event.defaultPrevented, true);
  assert.equal(password.focusCount, 0);
  assert.equal(form.submitted, 0);
});

test('Enter toggles a checkbox, moves on and never submits', () => {
  const checkbox = new FakeElement('input', { type: 'checkbox' });
  const next = new FakeElement('input');
  const { form } = makeForm(checkbox, next);

  const event = pressEnter(checkbox, form);

  assert.equal(event.defaultPrevented, true);
  assert.equal(checkbox.checked, true);
  assert.equal(next.focusCount, 1);
  assert.equal(form.submitted, 0);

  const last = new FakeElement('input', { type: 'checkbox' });
  const single = makeForm(last);
  pressEnter(last, single.form);
  assert.equal(last.checked, true);
  assert.equal(single.form.submitted, 0);
});

test('Enter in a textarea keeps the newline and does not move focus', () => {
  const textarea = new FakeElement('textarea');
  const next = new FakeElement('input');
  const { form } = makeForm(textarea, next);

  const event = pressEnter(textarea, form);

  assert.equal(event.defaultPrevented, false);
  assert.equal(next.focusCount, 0);
  assert.equal(form.submitted, 0);
});

test('Disabled, hidden and aria-hidden fields are skipped', () => {
  const first = new FakeElement('input');
  const disabled = new FakeElement('input', { disabled: true });
  const hidden = new FakeElement('input', { hidden: true });
  const ariaHidden = new FakeElement('input', { ariaHidden: 'true' });
  const optOut = new FakeElement('input', { ignore: true });
  const last = new FakeElement('input');
  const { form } = makeForm(first, disabled, hidden, ariaHidden, optOut, last);

  pressEnter(first, form);

  assert.equal(last.focusCount, 1);
  assert.equal(disabled.focusCount + hidden.focusCount + ariaHidden.focusCount + optOut.focusCount, 0);
});

test('Selects and radios keep native Enter behaviour', () => {
  const select = new FakeElement('select');
  const radio = new FakeElement('input', { type: 'radio' });
  const next = new FakeElement('input');
  const { form } = makeForm(select, radio, next);

  const selectEvent = pressEnter(select, form);
  const radioEvent = pressEnter(radio, form);

  assert.equal(selectEvent.defaultPrevented, false);
  assert.equal(radioEvent.defaultPrevented, false);
  assert.equal(form.submitted, 0);
});

test('A disabled submit button or an active submit guard blocks duplicate submissions', () => {
  const field = new FakeElement('input');
  const { form, submitter } = makeForm(field);

  submitter.disabled = true;
  pressEnter(field, form);
  assert.equal(form.submitted, 0);

  submitter.disabled = false;
  pressEnter(field, form, { submitGuard: () => false });
  assert.equal(form.submitted, 0);

  pressEnter(field, form, { submitGuard: () => true });
  assert.equal(form.submitted, 1);
});

test('IME composition and modifier keys are left alone', () => {
  const field = new FakeElement('input');
  const { form } = makeForm(field);

  const composing = makeEvent(field, form, { nativeEvent: { isComposing: true } });
  handleSmartEnterKeyDown(composing, {});
  assert.equal(composing.defaultPrevented, false);
  assert.equal(form.submitted, 0);

  const modified = makeEvent(field, form, { ctrlKey: true });
  handleSmartEnterKeyDown(modified, {});
  assert.equal(modified.defaultPrevented, false);
  assert.equal(form.submitted, 0);
});

test('Field discovery ignores hidden/submit inputs and includes checkboxes', () => {
  const text = new FakeElement('input');
  const hidden = new FakeElement('input', { type: 'hidden' });
  const checkbox = new FakeElement('input', { type: 'checkbox' });
  const { form } = makeForm(text, hidden, checkbox);

  const fields = getSmartEnterFields(form);

  assert.deepEqual(fields, [text, checkbox]);
  assert.equal(fields.includes(hidden), false);
});
