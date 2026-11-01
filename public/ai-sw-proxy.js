/**
 * Same-origin AI bridge for the installed PWA.
 * Page calls /ai-proxy/* (allowed by CSP 'self'); this SW forwards to the Cloudflare Worker.
 * Upstream holds the gateway key — never put it in the browser bundle.
 */
/* eslint-disable no-restricted-globals */
const AI_UPSTREAM = 'https://personal-hub-ai-proxy.csedeepak123-342.workers.dev';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/ai-proxy/')) return;

  const dest = `${AI_UPSTREAM}${url.pathname.slice('/ai-proxy'.length)}${url.search}`;
  event.respondWith(relay(event.request, dest));
});

async function relay(request, dest) {
  const headers = new Headers();
  const contentType = request.headers.get('Content-Type');
  if (contentType) headers.set('Content-Type', contentType);

  /** @type {RequestInit} */
  const init = {
    method: request.method,
    headers,
    credentials: 'omit',
    mode: 'cors',
    redirect: 'follow',
    cache: 'no-store',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(dest, init);
  const out = new Headers();
  out.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json; charset=utf-8');
  out.set('Cache-Control', 'no-store');
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}
