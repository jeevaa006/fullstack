/**
 * useSmartEnter — consistent, accessible Enter-key navigation for every form.
 *
 * Attach the returned props to a <form>:
 *
 *   const { formProps } = useSmartEnter();
 *   <form {...formProps} onSubmit={save}>…</form>
 *
 * Behaviour (implemented in ./smartEnter.js):
 * - Enter in a text-like input moves focus to the next enabled, visible form field.
 * - Enter in the last field submits the form through the browser's own submit path,
 *   so React's onSubmit, native validation and every server-side check still run.
 * - Textareas keep Enter as a new line.
 * - Selects and buttons keep their native keyboard behaviour.
 * - Enter on a checkbox toggles it and moves on; Space toggles natively. Enter never
 *   submits the form from a checkbox.
 * - Radio buttons keep native arrow-key selection and never submit on Enter.
 * - Disabled, hidden, aria-hidden and fieldset-disabled fields are skipped.
 * - Fields are read from the live DOM on every key press, so dynamically rendered
 *   forms work without re-registering anything.
 * - Repeated submissions are ignored while a submit button is disabled (the app's
 *   "busy" state) or within 1s of the previous Enter submit. Typing clears that guard.
 *
 * `beforeAdvance(element, form)` can validate a field before focus moves; return
 * false to keep focus and let the form show its own message.
 * `autoFocus` focuses the first usable field (Email on the login page) after mount;
 * use `focusKey` to refocus when the same component switches between login/register.
 */
import { useCallback, useEffect, useRef } from 'react';
import { getSmartEnterFields, handleSmartEnterKeyDown, isUsableField } from './smartEnter';

const RESUBMIT_DELAY_MS = 1000;

export const useSmartEnter = ({
  autoFocus = false,
  autoFocusSelector,
  focusKey,
  beforeAdvance,
} = {}) => {
  const formRef = useRef(null);
  const lastSubmitAt = useRef(0);

  // Focus the first usable field (usually Email on the login page) once the form mounts.
  useEffect(() => {
    if (!autoFocus) return undefined;
    const form = formRef.current;
    if (!form) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const target = autoFocusSelector
        ? form.querySelector(autoFocusSelector)
        : getSmartEnterFields(form).find(isUsableField);
      if (isUsableField(target)) target.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, autoFocusSelector, focusKey]);

  const handleKeyDown = useCallback((event) => {
    handleSmartEnterKeyDown(event, {
      beforeAdvance,
      submitGuard: () => {
        if (Date.now() - lastSubmitAt.current < RESUBMIT_DELAY_MS) return false;
        lastSubmitAt.current = Date.now();
        return true;
      },
    });
  }, [beforeAdvance]);

  // Typing again clears the accidental-double-submit guard.
  const handleInput = useCallback(() => { lastSubmitAt.current = 0; }, []);

  return {
    formProps: { ref: formRef, onKeyDown: handleKeyDown, onInput: handleInput },
    formRef,
    handleKeyDown,
  };
};

export default useSmartEnter;
