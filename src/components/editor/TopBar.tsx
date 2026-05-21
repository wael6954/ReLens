import { Link, useNavigate } from 'react-router-dom';
import { useAppStore, useAppActions } from '../../stores/appStore';

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

export default function TopBar() {
  const navigate    = useNavigate();
  const { setPhoto } = useAppActions();

  async function pickPhoto() {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const bmp = await createImageBitmap(file);
      setPhoto({ blob: file, filename: file.name, width: bmp.width, height: bmp.height });
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
        <HintsToggle />
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
