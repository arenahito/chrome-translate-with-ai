export const AUTH_BASE = 'https://auth.openai.com';
export const API_BASE = 'https://api.openai.com/v1';
export const REDIRECT_URI = 'http://127.0.0.1:54329/auth/callback';
const encoder = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...bytes))
  .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const random = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const decode = value => Uint8Array.from(atob(value.replaceAll('-', '+')
  .replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')),
char => char.charCodeAt(0));
export const failure = (code, message) => Object.assign(new Error(message), { code });
const emptyState = () => ({
  hostId: `urn:uuid:${crypto.randomUUID()}`, generation: 0,
  registration: null, tokens: null, pending: null,
});

function validState(state) {
  return state && typeof state.hostId === 'string' &&
    state.hostId.startsWith('urn:uuid:') &&
    Number.isSafeInteger(state.generation) && state.generation >= 0 &&
    (state.registration === null || (state.registration &&
      typeof state.registration.clientId === 'string' && state.registration.clientId)) &&
    (state.tokens === null || (state.tokens && state.registration?.subject &&
      typeof state.tokens.accessToken === 'string' &&
      Number.isFinite(state.tokens.expiresAt) && Array.isArray(state.tokens.scopes))) &&
    (state.pending === null || (state.pending &&
      typeof state.pending.state === 'string' && typeof state.pending.verifier === 'string' &&
      typeof state.pending.nonce === 'string' && Number.isFinite(state.pending.expiresAt)));
}

export async function verifyIdentity(token, clientId, nonce,
  fetcher = globalThis.fetch.bind(globalThis),
  expectedSubject) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error();
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error();
    const response = await fetcher(`${AUTH_BASE}/.well-known/jwks.json`,
      { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error();
    const jwk = (await response.json()).keys.find(key =>
      key.kid === header.kid && key.kty === 'RSA' &&
      (!key.use || key.use === 'sig') && (!key.alg || key.alg === 'RS256'));
    if (!jwk) throw new Error();
    const key = await crypto.subtle.importKey('jwk', jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key,
      decode(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!valid || claims.iss !== AUTH_BASE || !audience.includes(clientId) ||
      !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000 ||
      (nonce !== undefined && claims.nonce !== nonce) ||
      typeof claims.sub !== 'string' || !claims.sub ||
      (expectedSubject && claims.sub !== expectedSubject) ||
      (claims.azp && claims.azp !== clientId) ||
      (audience.length > 1 && claims.azp !== clientId)) throw new Error();
    return claims;
  } catch {
    throw failure('IDENTITY_INVALID', 'ChatGPTアカウントの検証に失敗しました。');
  }
}

export class Auth {
  constructor(vault, fetcher = globalThis.fetch.bind(globalThis)) {
    this.vault = vault;
    this.fetcher = (...args) => fetcher(...args);
    this.lock = Promise.resolve();
    this.refreshing = null;
    this.ready = this.initialize();
  }

  async initialize() {
    try {
      const saved = await this.vault.load();
      if (saved !== null && !validState(saved)) {
        throw failure('VAULT_CORRUPT', '保存済み接続情報の形式が不正です。');
      }
      this.state = saved || emptyState();
      await this.vault.save(this.state);
    } catch (error) {
      if (!['VAULT_KEY_MISSING', 'VAULT_CORRUPT'].includes(error.code)) throw error;
      this.recoveryCode = error.code;
      this.state = null;
    }
  }

  async mutate(callback) {
    const operation = this.lock.then(async () => {
      await this.ready;
      if (this.recoveryCode) throw failure('RECOVERY_REQUIRED', '保存済み接続情報の初期化が必要です。');
      const next = structuredClone(this.state);
      const result = await callback(next);
      await this.vault.save(next);
      this.state = next;
      return result;
    });
    this.lock = operation.catch(() => {});
    return operation;
  }

  async status() {
    await this.ready;
    if (this.recoveryCode) return { connected: false, needsLogin: true,
      needsRecovery: true, accountLabel: '', loginPending: false,
      recoveryCode: this.recoveryCode };
    const { registration, tokens, pending } = this.state;
    const connected = Boolean(tokens &&
      (tokens.refreshToken || tokens.expiresAt > Date.now()));
    return { connected, needsLogin: !connected,
      accountLabel: registration?.email || '',
      loginPending: Boolean(pending && pending.expiresAt > Date.now()) };
  }

  async recover() {
    await this.ready;
    if (!this.recoveryCode) throw failure('RECOVERY_NOT_REQUIRED', '保存済み接続情報の初期化は不要です。');
    const operation = this.lock.then(async () => {
      if (!this.recoveryCode) throw failure('RECOVERY_NOT_REQUIRED', '保存済み接続情報の初期化は不要です。');
      const state = emptyState();
      await this.vault.reset(state);
      this.state = state;
      this.recoveryCode = null;
    });
    this.lock = operation.catch(() => {});
    await operation;
    return this.status();
  }

  async begin(tabId) {
    return this.mutate(async state => {
      if (state.pending?.expiresAt > Date.now()) {
        throw failure('LOGIN_PENDING', '接続操作が進行中です。');
      }
      const verifier = random();
      const challenge = b64url(new Uint8Array(await crypto.subtle.digest(
        'SHA-256', encoder.encode(verifier))));
      const pending = { tabId, state: random(), nonce: random(), verifier,
        generation: state.generation, expiresAt: Date.now() + 600000,
        clientId: state.registration?.clientId || 'dynamic_agent_client' };
      state.pending = pending;
      const query = new URLSearchParams({ client_id: pending.clientId,
        ext_agent_host_id: state.hostId, response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
        resource: API_BASE, state: pending.state, nonce: pending.nonce,
        code_challenge_method: 'S256', code_challenge: challenge });
      if (pending.clientId === 'dynamic_agent_client') {
        query.set('agent_name_hint', 'Translate with AI');
      } else if (state.tokens?.idToken) {
        query.set('id_token_hint', state.tokens.idToken);
      }
      return { url: `${AUTH_BASE}/api/accounts/authorize?${query}`,
        expiresAt: pending.expiresAt, attemptId: pending.state };
    });
  }

  async cancelLogin(tabId, attemptId) {
    return this.mutate(state => {
      if ((tabId === undefined || state.pending?.tabId === tabId) &&
        (attemptId === undefined || state.pending?.state === attemptId)) state.pending = null;
    });
  }

  async finish(queryString, tabId) {
    await this.ready;
    const query = new URLSearchParams(queryString);
    const pending = this.state.pending;
    if (!pending || pending.tabId !== tabId ||
      query.getAll('state').length !== 1 || query.get('state') !== pending.state ||
      pending.expiresAt <= Date.now()) {
      throw failure('CALLBACK_INVALID', '接続操作のタブ・state・有効期限を確認できませんでした。');
    }
    const isNew = pending.clientId === 'dynamic_agent_client';
    const clientId = query.get('client_id') || (!isNew && pending.clientId);
    await this.mutate(state => {
      if (!state.pending || state.pending.state !== pending.state || state.pending.exchanging) {
        throw failure('CALLBACK_INVALID', 'この接続操作はすでに処理されています。');
      }
      state.pending.exchanging = true;
    });
    if (query.has('error')) {
      await this.cancelLogin(tabId);
      throw failure('LOGIN_DENIED', '接続が許可されませんでした。');
    }
    if (!clientId || clientId === 'dynamic_agent_client' ||
      (!isNew && clientId !== pending.clientId) ||
      query.getAll('code').length !== 1 || !query.get('code') ||
      query.getAll('client_id').length > 1) {
      await this.cancelLogin(tabId);
      throw failure('CALLBACK_INVALID', '認証コードまたはクライアントIDが一致しません。');
    }
    await this.mutate(state => {
      if (state.generation !== pending.generation) throw failure('SIGNED_OUT', '接続操作が取り消されました。');
      if (isNew) state.registration = { clientId };
    });
    try {
      const tokens = await this.exchange({ grant_type: 'authorization_code',
        client_id: clientId, code: query.get('code'), code_verifier: pending.verifier,
        redirect_uri: REDIRECT_URI, resource: API_BASE });
      const claims = await verifyIdentity(tokens.id_token, clientId,
        pending.nonce, this.fetcher, this.state.registration?.subject);
      const normalized = this.normalize(tokens);
      await this.mutate(state => {
        if (state.generation !== pending.generation ||
          state.pending?.state !== pending.state) {
          throw failure('SIGNED_OUT', '接続操作が取り消されました。');
        }
        state.registration = { clientId, subject: claims.sub,
          email: typeof claims.email === 'string' ? claims.email : '' };
        state.tokens = normalized;
        state.generation++;
        state.pending = null;
      });
    } catch (error) {
      await this.mutate(state => {
        if (state.pending?.state === pending.state) state.pending = null;
      });
      throw error;
    }
    return this.status();
  }

  normalize(tokens, previous) {
    const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(' ')
      : previous?.scopes;
    if (typeof tokens.access_token !== 'string' || !tokens.access_token ||
      (tokens.refresh_token !== undefined && typeof tokens.refresh_token !== 'string') ||
      (tokens.id_token !== undefined && typeof tokens.id_token !== 'string') ||
      typeof (tokens.token_type || 'Bearer') !== 'string' ||
      (tokens.token_type || 'Bearer').toLowerCase() !== 'bearer' ||
      !scopes?.includes('chatgpt.tokens.use.direct') ||
      !Number.isFinite(Number(tokens.expires_in)) || Number(tokens.expires_in) <= 0) {
      throw failure('GRANT_INVALID', 'ChatGPT利用枠の許可または接続情報を確認できませんでした。');
    }
    return { accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || previous?.refreshToken,
      idToken: tokens.id_token || previous?.idToken, scopes,
      expiresAt: Date.now() + Number(tokens.expires_in) * 1000 };
  }

  async exchange(body) {
    let response;
    try {
      response = await this.fetcher(`${AUTH_BASE}/api/accounts/oauth/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body), signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      const kind = ['TimeoutError', 'AbortError', 'TypeError'].includes(error?.name)
        ? error.name : 'NetworkError';
      const phase = body.grant_type === 'authorization_code' ? '認証コード交換' : '接続情報の更新';
      throw failure(kind === 'TimeoutError' ? 'AUTH_TIMEOUT' : 'AUTH_NETWORK',
        `ChatGPTへの接続を確認できませんでした。再度お試しください。（${phase}: ${kind}）`);
    }
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      const terminal = response.status >= 400 && response.status < 500 &&
        ['invalid_grant', 'invalid_client'].includes(details.error);
      throw failure(terminal ? 'REFRESH_INVALID' : 'AUTH_UNAVAILABLE',
        terminal ? 'ChatGPTへの再接続が必要です。' : '接続情報を更新できませんでした。再度お試しください。');
    }
    return response.json();
  }

  async accessToken() {
    await this.ready;
    if (this.recoveryCode) throw failure('RECOVERY_REQUIRED', '保存済み接続情報の初期化が必要です。');
    if (!this.state.tokens) throw failure('LOGIN_REQUIRED', 'ChatGPTに接続してください。');
    if (this.state.tokens.expiresAt > Date.now() + 60000) return this.state.tokens.accessToken;
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.refresh().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async refresh() {
    const snapshot = structuredClone(this.state);
    if (!snapshot.tokens.refreshToken) throw failure('LOGIN_REQUIRED', 'ChatGPTに再接続してください。');
    try {
      const raw = await this.exchange({ grant_type: 'refresh_token',
        client_id: snapshot.registration.clientId,
        refresh_token: snapshot.tokens.refreshToken, resource: API_BASE });
      if (raw.id_token) await verifyIdentity(raw.id_token,
        snapshot.registration.clientId, undefined, this.fetcher,
        snapshot.registration.subject);
      const tokens = this.normalize(raw, snapshot.tokens);
      await this.mutate(state => {
        if (state.generation !== snapshot.generation || !state.tokens) {
          throw failure('SIGNED_OUT', '接続が解除されました。');
        }
        state.tokens = tokens;
      });
      return tokens.accessToken;
    } catch (error) {
      if (error.code === 'REFRESH_INVALID') await this.mutate(state => {
        if (state.generation === snapshot.generation) state.tokens = null;
      });
      throw error;
    }
  }

  async logout() {
    let snapshot;
    const refreshInFlight = Boolean(this.refreshing);
    await this.mutate(state => {
      snapshot = structuredClone(state);
      state.generation++;
      state.tokens = null;
      state.pending = null;
    });
    let remoteRevocationConfirmed = !snapshot.tokens?.refreshToken;
    if (snapshot.tokens?.refreshToken) {
      try {
        const discovery = await this.fetcher(`${AUTH_BASE}/.well-known/openid-configuration`,
          { signal: AbortSignal.timeout(10000) });
        if (!discovery.ok) throw new Error();
        const endpoint = new URL((await discovery.json()).revocation_endpoint);
        if (endpoint.origin !== AUTH_BASE) throw new Error();
        const response = await this.fetcher(endpoint.href, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: snapshot.tokens.refreshToken,
            token_type_hint: 'refresh_token', client_id: snapshot.registration.clientId }),
          signal: AbortSignal.timeout(10000),
        });
        remoteRevocationConfirmed = response.status === 200 && !refreshInFlight;
      } catch { remoteRevocationConfirmed = false; }
    }
    return { ...(await this.status()), remoteRevocationConfirmed };
  }
}
