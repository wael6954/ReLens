/// <reference types="vite/client" />

declare module '*.wgsl?raw' {
  const src: string;
  export default src;
}

/* Custom window events used as a one-way bridge from EditorPage's keyboard
   handler to PreviewCanvas's save/download actions. */
interface WindowEventMap {
  'app:save':     CustomEvent<void>;
  'app:download': CustomEvent<void>;
}
