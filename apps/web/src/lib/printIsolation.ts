'use client';
import { useEffect } from 'react';

const KEEP = 'data-print-keep';
const HIDE = 'data-print-hide';

/**
 * Make one element the only thing in the printed document.
 *
 * Receipts print onto a continuous roll with `@page { size: 80mm auto }`, so the
 * paper is cut at whatever height the document turns out to be. Hiding the app
 * with `visibility: hidden` doesn't shrink that: hidden boxes keep their space,
 * and an absolutely positioned slip adds none of its own — so every slip came
 * out the height of the POS layout. Measured on a real order: a 1-item slip is
 * 606px of content inside a 1556px page, i.e. ~25cm of blank roll after every
 * ticket, and a 10-item slip printed 985px of content in 1935px.
 *
 * CSS can't reach an element's ancestors, so the tree is marked on `beforeprint`
 * (fired for both window.print() and Ctrl+P) and unmarked on `afterprint`:
 * everything off the element's own branch gets `data-print-hide` and leaves the
 * flow, and the branch itself gets `data-print-keep` so the print rules can undo
 * the dialog's fixed/transformed/clipping box. The document then ends where the
 * slip ends, and its length follows the order.
 *
 * Both print stylesheets keep their old visibility-based rules as a fallback, so
 * a browser that never fires `beforeprint` still prints a correct (if padded)
 * slip rather than the whole screen.
 */
export function usePrintIsolation(elementId: string) {
  useEffect(() => {
    const clear = () => {
      document.querySelectorAll(`[${KEEP}], [${HIDE}]`).forEach((node) => {
        node.removeAttribute(KEEP);
        node.removeAttribute(HIDE);
      });
    };

    const mark = () => {
      const el = document.getElementById(elementId);
      if (!el) return;
      clear();
      // Walk up marking the branch, hiding each ancestor's other children. A
      // sibling is never itself an ancestor, so nothing needed gets hidden.
      for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
        node.setAttribute(KEEP, '');
        for (const sibling of Array.from(node.parentElement?.children ?? [])) {
          if (sibling !== node && sibling instanceof HTMLElement && !sibling.hasAttribute(KEEP)) {
            sibling.setAttribute(HIDE, '');
          }
        }
      }
    };

    window.addEventListener('beforeprint', mark);
    window.addEventListener('afterprint', clear);
    return () => {
      window.removeEventListener('beforeprint', mark);
      window.removeEventListener('afterprint', clear);
      clear();
    };
  }, [elementId]);
}
