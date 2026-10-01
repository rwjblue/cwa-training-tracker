import React, { useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({
  title,
  onClose,
  children,
  wide = false,
  initialFocus,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  initialFocus?: React.RefObject<HTMLElement | null> | 'heading';
}) {
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = React.useId();
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const elements = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:enabled, input:enabled, select:enabled, textarea:enabled, a[href], summary, [tabindex]',
        ) ?? [],
      ).filter(
        (element) =>
          element.tabIndex >= 0 &&
          element.getClientRects().length > 0 &&
          getComputedStyle(element).visibility !== 'hidden',
      );
    // Establish focus before the dialog is painted. A delayed autofocus can
    // steal focus from a field the user has already started filling.
    const focusable = elements();
    const requested =
      initialFocus === 'heading'
        ? heading.current
        : (initialFocus?.current ?? panel.current?.querySelector<HTMLElement>('[autofocus]'));
    const target =
      (requested && (requested === heading.current || focusable.includes(requested))
        ? requested
        : undefined) ??
      focusable.find((element) => element.matches('input, select, textarea')) ??
      focusable[0];
    target?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const all = elements();
        const first = all[0];
        const last = all[all.length - 1];
        if (!all.includes(document.activeElement as HTMLElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      document.removeEventListener('keydown', handle);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panel}
      >
        <div className="modal-heading">
          <h2 id={titleId} ref={heading} tabIndex={initialFocus === 'heading' ? -1 : undefined}>
            {title}
          </h2>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
