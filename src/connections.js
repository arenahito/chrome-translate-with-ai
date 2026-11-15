export const localEndpoints = Object.freeze({
  lmstudio: 'http://127.0.0.1:1234/v1',
  ollama: 'http://127.0.0.1:11434/v1',
  custom: 'http://127.0.0.1:8317/v1',
});

export function isLocalProvider(provider) {
  return Object.hasOwn(localEndpoints, provider);
}

export function normalizeEndpoint(value) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error('Expected a loopback HTTP(S) URL.');
  }
  const path = url.pathname.replace(/\/+$/, '');
  return url.origin + (path ? path : '/v1');
}
