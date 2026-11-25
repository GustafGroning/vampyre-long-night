import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { MapCity } from '../screen/model';

/** Placeholder copy until region descriptions and status values exist in game data. */
const PLACEHOLDER_DESCRIPTION = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vitae neque non augue fermentum tincidunt. Nulla facilisi.';
const PLACEHOLDER_STATUSES = ['Status 1', 'Status 2', 'Status 3'] as const;

export function RegionModal({ city, onClose }: { city: MapCity; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | SVGElement | null;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      // Keep keyboard focus inside the modal, including when it has only one button.
      if (event.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && 'focus' in previouslyFocused) previouslyFocused.focus();
    };
  }, [onClose]);

  return createPortal(
    <div className="region-dialog-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="region-dialog" role="dialog" aria-modal="true" aria-labelledby="region-dialog-title" aria-describedby="region-dialog-description" ref={dialogRef}>
        <div className="region-dialog-header">
          <div>
            <span className="region-dialog-kicker">Regioninformation</span>
            <h2 id="region-dialog-title">{city.name}</h2>
          </div>
          <button className="region-dialog-close" ref={closeRef} type="button" aria-label="Stäng regioninformation" onClick={onClose}>×</button>
        </div>
        <p id="region-dialog-description">{PLACEHOLDER_DESCRIPTION}</p>
        <h3>Regionstatus</h3>
        <ul className="region-status-list">
          {PLACEHOLDER_STATUSES.map(status => <li key={status}>{status}</li>)}
        </ul>
      </section>
    </div>,
    document.body,
  );
}
