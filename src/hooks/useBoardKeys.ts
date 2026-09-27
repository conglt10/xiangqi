import { useEffect, useRef } from 'react';

/** Arrow-key navigation (ignored while typing in inputs). */
export function useBoardKeys(h: { back: () => void; forward: () => void; start?: () => void; end?: () => void }) {
  const ref = useRef(h);
  ref.current = h;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
      if (e.key === 'ArrowLeft') ref.current.back();
      else if (e.key === 'ArrowRight') ref.current.forward();
      else if (e.key === 'ArrowUp' || e.key === 'Home') ref.current.start?.();
      else if (e.key === 'ArrowDown' || e.key === 'End') ref.current.end?.();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
