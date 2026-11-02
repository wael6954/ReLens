import { Link, useNavigate } from 'react-router-dom';
import { useAppStore, useAppActions, loadFreshPhoto, useTemporalAvailability, undo, redo } from '../../stores/appStore';

function UndoRedoButtons() {
  const { canUndo, canRedo } = useTemporalAvailability();
  const cls = (enabled: boolean) => [
    'w-7 h-7 inline-flex items-center justify-center rounded-sm border transition-colors',
    enabled
      ? 'border-film-border text-film-text hover:border-film-amber hover:text-film-amber'
      : 'border-film-border text-film-text-dim opacity-40 cursor-not-allowed',
  ].join(' ');
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" className={cls(canUndo)}>
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2.5 5.5h7.5a3 3 0 0 1 0 6H6" />
          <path d="M5 3 2.5 5.5 5 8" />
        </svg>
      </button>
      <button type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" className={cls(canRedo)}>
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M13.5 5.5H6a3 3 0 0 0 0 6h4" />
          <path d="M11 3l2.5 2.5L11 8" />
        </svg>
      </button>
    </div>
  );
}

function HintsToggle() {
  const enabled     = useAppStore((s) => s.hintsEnabled);
  const { toggleHints } = useAppActions();
  return (
    <button
      type="button"
      onClick={toggleHints}
      className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-film-text-dim hover:text-film-text transition-colors"
      aria-pressed={enabled}
    >
      <span
        className={[
          'relative w-8 h-[18px] rounded-full transition-colors',
          enabled ? 'bg-film-amber-dim' : 'bg-film-border',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-[2px] w-[14px] h-[14px] rounded-full transition-all',
            enabled ? 'left-[16px] bg-film-amber' : 'left-[2px] bg-film-text-dim',
          ].join(' ')}
        />
      </span>
      Hints
    </button>
  );
}

interface TopBarProps {
  onBatchClick?: () => void;
}

export default function TopBar({ onBatchClick }: TopBarProps = {}) {
  const navigate    = useNavigate();

  async function pickPhoto() {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const bmp = await createImageBitmap(file);
      loadFreshPhoto({ blob: file, filename: file.name, width: bmp.width, height: bmp.height });
      bmp.close?.();
    };
    input.click();
  }

  return (
    <header className="h-[52px] flex-shrink-0 flex items-center justify-between px-5 bg-film-surface border-b border-film-border">
      <Link
        to="/"
        state={{ fromHome: true }}
        className="font-serif text-[20px] leading-none text-film-text hover:text-film-amber transition-colors"
      >
        ReLens
      </Link>

      <div className="flex items-center gap-5">
        <UndoRedoButtons />
        <HintsToggle />
        {onBatchClick && (
          <button
            type="button"
            onClick={onBatchClick}
            className="px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] font-sans font-medium text-film-text border border-film-border rounded-sm hover:border-film-amber hover:text-film-amber transition-colors"
          >
            Batch
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/gallery')}
          className="px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] font-sans font-medium text-film-text border border-film-border rounded-sm hover:border-film-amber hover:text-film-amber transition-colors"
        >
          My Photos
        </button>
        <button
          type="button"
          onClick={pickPhoto}
          className="px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] font-sans font-medium bg-film-amber text-film-black rounded-sm hover:bg-film-amber-dim transition-colors"
        >
          New Photo
        </button>
      </div>
    </header>
  );
}
