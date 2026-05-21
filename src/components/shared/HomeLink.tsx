import { Link } from 'react-router-dom';

/**
 * Small "← Home" link rendered in the top-left of the Editor and Gallery
 * pages. Passes `state.fromHome=true` so the Welcome page recognises an
 * intentional return-trip and skips its first-visit auto-redirect.
 */
export default function HomeLink() {
  return (
    <Link
      to="/"
      state={{ fromHome: true }}
      className="absolute top-4 left-4 z-20 text-film-text-dim text-sm font-sans tracking-wide hover:text-film-text transition-colors"
    >
      ← Home
    </Link>
  );
}
