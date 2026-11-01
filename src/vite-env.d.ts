/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_USE_EMULATORS?: string;
  /** Cloudflare Worker proxy base URL ending in /v1 (preferred for production). */
  readonly VITE_AI_PROXY_URL?: string;
  /** Direct gateway URL — local/dev only; production should use VITE_AI_PROXY_URL. */
  readonly VITE_AI_BASE_URL?: string;
  /** Gateway API key for local Vite proxy only; never required when using the Worker. */
  readonly VITE_AI_API_KEY?: string;
  /** Model id forwarded to /chat/completions (gateway may remap). */
  readonly VITE_AI_MODEL?: string;
  readonly VITE_AI_MAX_TOKENS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
