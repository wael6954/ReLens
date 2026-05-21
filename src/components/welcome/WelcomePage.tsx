import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import GrainBackground from '../shared/GrainBackground';

const STORAGE_KEY = 'hasVisited';

interface WelcomeLocationState {
  fromHome?: boolean;
}

export default function WelcomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state    = (location.state ?? null) as WelcomeLocationState | null;
  const fromHome = state?.fromHome === true;

  useEffect(() => {
    // Coming back from the Editor/Gallery via the Home link — render Welcome,
    // do not auto-redirect, do not touch the visited flag.
    if (fromHome) return;

    const hasVisited = typeof window !== 'undefined'
      ? window.localStorage.getItem(STORAGE_KEY)
      : null;

    if (hasVisited) {
      // Subsequent visit — bounce straight to the editor on the next tick.
      const t = window.setTimeout(() => navigate('/editor', { replace: true }), 0);
      return () => window.clearTimeout(t);
    }

    // First visit — record it; the welcome stays on screen until the user
    // clicks one of the two buttons.
    try { window.localStorage.setItem(STORAGE_KEY, '1'); } catch { /* private mode */ }
  }, [fromHome, navigate]);

  return (
    <>
      <GrainBackground />
      <main className="relative z-10 min-h-screen w-full flex flex-col items-center justify-center px-6">
        <h1
          className="font-serif text-film-text leading-none"
          style={{ fontSize: 'clamp(48px, 12vw, 96px)', letterSpacing: '0.04em' }}
        >
          ReLens
        </h1>
        <p className="font-sans italic text-film-text-dim mt-5 text-sm tracking-[0.32em] uppercase">
          Light &middot; Silver &middot; Memory
        </p>

        <div className="mt-14 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => navigate('/editor')}
            className="px-7 py-3 bg-film-amber text-film-black font-sans font-medium text-xs tracking-[0.18em] uppercase rounded-sm transition-colors duration-200 hover:bg-film-amber-dim"
          >
            Start Developing
          </button>
          <button
            type="button"
            onClick={() => navigate('/gallery')}
            className="px-7 py-3 border border-film-border text-film-text font-sans text-xs tracking-[0.18em] uppercase rounded-sm transition-colors duration-200 hover:border-film-amber hover:text-film-amber"
          >
            My Photos
          </button>
        </div>
      </main>
    </>
  );
}
