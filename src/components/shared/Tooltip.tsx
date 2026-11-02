import { useEffect, useRef, useState, type ReactNode } from 'react';

interface TooltipProps {
  children: ReactNode;
  content:  string;
  className?: string;
}

/**
 * Hover / tap tooltip positioned above its trigger. The bubble appears on
 * pointer-enter (desktop) or tap (touch), and dismisses on pointer-leave,
 * tap outside, or Escape.
 */
export default function Tooltip({ children, content, className = '' }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={`relative inline-flex ${className}`}>
      <span
        className="inline-flex cursor-help"
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(true); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(false); }}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        {children}
      </span>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none whitespace-normal text-[11px] leading-snug text-film-text bg-film-surface border border-film-border rounded-[1px] px-2.5 py-1.5 shadow-md font-sans"
          style={{ maxWidth: 220, width: 'max-content' }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
