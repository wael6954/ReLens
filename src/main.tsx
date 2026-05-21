import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';

import '@fontsource/dm-serif-display/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/dotgothic16/400.css';
import './index.css';

import WelcomePage from './components/welcome/WelcomePage';
import EditorPage  from './components/editor/EditorPage';
import GalleryPage from './components/gallery/GalleryPage';
import { loadAllPhotos } from './utils/storage';

async function bootstrap() {
  // Best-effort: hydrate the Zustand store with any saved photo metadata
  // before the first render. Failures (browser dev mode without Tauri,
  // first-run with no files yet, etc.) are non-fatal — the gallery just
  // starts empty.
  try {
    await loadAllPhotos();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[bootstrap] loadAllPhotos failed', err);
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <HashRouter>
        <Routes>
          <Route path="/"        element={<WelcomePage />} />
          <Route path="/editor"  element={<EditorPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="*"        element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </React.StrictMode>,
  );
}

void bootstrap();
