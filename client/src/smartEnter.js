/**
 * Pure Enter-key navigation logic shared by useSmartEnter.
 *
 * Kept free of React so it can be unit-tested without a browser; the only browser
 * globals it touches are `window.getComputedStyle` and `HTMLElement`, both guarded.
 */
const FIELD_TAGS = ['INPUT', 'SELECT', 'TEXTAREA'];
const UNNAVIGABLE_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file', 'range', 'color']);
const TEXT_ENTRY_TYPES = new Set([
  'text', 'email', 'tel', 'url', 'search', 'password', 'number',
  'date', 'time', 'datetime-local', 'month', 'week',
]);

/** All navigable form fields in DOM order (disabled/hidden ones included for index lookup). */
export const getSmartEnterFields = (form) => {
  if (!form || !form.elements) return [];
  return Array.from(form.elements).filter((element) => (
    FIELD_TAGS.includes(element.tagName)
    && !UNNAVIGABLE_INPUT_TYPES.has((element.type || '').toLowerCase())
    && !element.closest('[data-smart-enter="ignore"]')
  ));
};

export const isUsableField = (element) => {
  if (!element || element.disabled) return false;
  if (element.closest('fieldset[disabled]')) return false;
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
  if (typeof window === 'undefined') return true;
  const style = window.getComputedStyle(element);
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && style.visibility !== 'collapse'
    && element.getClientRects().length > 0;
};

const focusNextField = (form, current) => {
  const fields = getSmartEnterFields(form);
  const index = fields.indexOf(current);
  if (index === -1) return false;
  for (let next = index + 1; next < fields.length; next += 1) {
    if (isUsableField(fields[next])) {
      fields[next].focus();
      return true;
    }
  }
  return false;
};

const findSubmitter = (form) => Array.from(form.elements).find((element) => (
  (element.tagName === 'BUTTON' && element.type === 'submit')
  || (element.tagName === 'INPUT' && element.type === 'submit')
));

const submitForm = (form, submitter) => {
  if (typeof form.requestSubmit === 'function') form.requestSubmit(submitter || undefined);
  else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
};

/**
 * Handle one keydown event from a <form>.
 *
 * Options:
 * - beforeAdvance(element, form): return false to keep focus (e.g. invalid email).
 * - submitGuard(): return false to swallow the submission (double-submit protection).
 */
export const handleSmartEnterKeyDown = (event, { beforeAdvance, submitGuard } = {}) => {
  if (!event || event.key !== 'Enter' || event.defaultPrevented) return;
  // Never interfere with an input-method editor (Tamil, Japanese, …).
  if (event.nativeEvent?.isComposing || event.keyCode === 229) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const form = event.currentTarget;
  const target = event.target;
  const ElementType = typeof HTMLElement === 'undefined' ? null : HTMLElement;
  if (!form || !target || (ElementType && !(target instanceof ElementType))) return;
  if (target.isContentEditable) return;

  // Textareas: Enter inserts a new line.
  if (target.tagName === 'TEXTAREA') return;
  // Selects, buttons, links and disclosure widgets keep their native Enter behaviour.
  if (['SELECT', 'BUTTON', 'A', 'SUMMARY'].includes(target.tagName)) return;
  if (target.tagName !== 'INPUT') return;

  const type = (target.type || 'text').toLowerCase();

  if (type === 'checkbox') {
    event.preventDefault();
    // click() runs the native toggle and fires React's onChange.
    target.click();
    focusNextField(form, target);
    return;
  }

  // Radio groups use native arrow keys/Space; Enter must not submit the form.
  if (type === 'radio') return;
  if (!TEXT_ENTRY_TYPES.has(type)) return;

  event.preventDefault();
  if (typeof beforeAdvance === 'function' && beforeAdvance(target, form) === false) return;
  if (focusNextField(form, target)) return;

  const submitter = findSubmitter(form);
  // A disabled submit button means the component is already saving/sending.
  if (submitter && submitter.disabled) return;
  if (typeof submitGuard === 'function' && submitGuard() === false) return;
  submitForm(form, submitter);
};
