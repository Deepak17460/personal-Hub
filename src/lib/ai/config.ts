const env = import.meta.env;

const proxyEnv = (env.VITE_AI_PROXY_URL ?? '').trim().replace(/\/$/, '');
const baseEnv = (env.VITE_AI_BASE_URL ?? '').trim().replace(/\/$/, '');

/**
 * Dev: Vite proxies `/ai-proxy` → CloudFront when no Worker URL is set (browser sends the key).
 * Prod: call the Cloudflare Worker URL directly. Same-origin `/ai-proxy` is unsafe on
 * Firebase Hosting — unmatched paths rewrite to index.html, which breaks installed PWAs.
 */
function resolveBaseUrl(): string {
  if (proxyEnv) return proxyEnv;

  if (env.DEV) {
    if (!baseEnv || baseEnv.includes('cloudfront.net')) return '/ai-proxy/v1';
    return baseEnv;
  }

  return baseEnv;
}

const baseUrl = resolveBaseUrl();
const usingWorkerProxy = Boolean(proxyEnv && (proxyEnv.includes('workers.dev') || /^https:\/\//.test(proxyEnv)));

export const aiConfig = {
  baseUrl,
  /**
   * Only read VITE_AI_API_KEY under `import.meta.env.DEV` so production builds never
   * inline the gateway key (Vite folds DEV to false and drops the secret branch).
   */
  apiKey: import.meta.env.DEV ? (import.meta.env.VITE_AI_API_KEY ?? '') : '',
  model: env.VITE_AI_MODEL ?? 'anthropic.claude-sonnet-4-6',
  maxTokens: Number(env.VITE_AI_MAX_TOKENS ?? 2048) || 2048,
  /** Worker injects the gateway key; browser must not send one. */
  proxyHoldsKey: usingWorkerProxy,
};

export const isAiConfigured = Boolean(aiConfig.baseUrl && (aiConfig.apiKey || usingWorkerProxy));
