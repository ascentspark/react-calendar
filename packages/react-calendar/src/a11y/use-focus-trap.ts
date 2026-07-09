import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Keeps keyboard focus inside `ref`'s element while `enabled` (the modal-dialog
 * focus-trap pattern) — dependency-free. On activation it moves focus to the first
 * focusable descendant (or the element itself) and remembers what was focused
 * before, restoring it on deactivation/unmount. <kbd>Tab</kbd> /
 * <kbd>Shift</kbd>+<kbd>Tab</kbd> wrap around the element's focusable descendants
 * instead of escaping to the page behind.
 *
 * Apply to a container that carries `role="dialog"` (or similar) and is only
 * mounted while open:
 * ```tsx
 * const dialogRef = useRef<HTMLDivElement>(null);
 * useFocusTrap(dialogRef, open);
 * return open ? <div role="dialog" tabIndex={-1} ref={dialogRef}>…</div> : null;
 * ```
 *
 * Effect-based, so it is SSR-safe (no focus work on the server) and idempotent
 * under StrictMode's double invoke: each setup snapshots the previously focused
 * element and its cleanup restores it.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    const host = ref.current;
    if (!enabled || host === null) {
      return;
    }

    const doc = host.ownerDocument;
    const previouslyFocused = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;

    const focusable = (): HTMLElement[] =>
      Array.from(host.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    (focusable()[0] ?? host).focus();

    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') {
        return;
      }
      const els = focusable();
      const first = els[0];
      const last = els[els.length - 1];
      if (!first || !last) {
        event.preventDefault();
        host.focus();
        return;
      }
      const active = doc.activeElement;
      if (event.shiftKey && (active === first || active === host)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    host.addEventListener('keydown', onKeydown);
    return () => {
      host.removeEventListener('keydown', onKeydown);
      previouslyFocused?.focus();
    };
  }, [ref, enabled]);
}
