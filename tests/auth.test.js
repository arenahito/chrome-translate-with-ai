import test from 'node:test';
import assert from 'node:assert/strict';
import { Auth, AUTH_BASE, verifyIdentity } from '../src/auth.js';

function memoryVault(value) {
  return { value, async load() { return structuredClone(this.value); },
    async save(next) { this.value = structuredClone(next); } };
}
const initial = () => ({ hostId: 'urn:uuid:test', generation: 0,
  registration: { clientId: 'issued-client', subject: 'account-1', email: 'test@example.com' },
  tokens: { accessToken: 'old', refreshToken: 'refresh-old', idToken: 'id-old',
    scopes: ['chatgpt.tokens.use.direct'], expiresAt: 1 }, pending: null });
const tokenResponse = () => Response.json({ access_token: 'new',
  refresh_token: 'refresh-new', token_type: 'Bearer', expires_in: 3600 });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; });
  return { promise, resolve }; };

test('auth binds default native fetch and does not assign a receiver to injected fetch', async () => {
  const original = globalThis.fetch;
  try {
    let defaultCalls = 0;
    globalThis.fetch = function () {
      assert.equal(this, globalThis, 'native fetch requires its global receiver');
      defaultCalls++;
      return Promise.resolve(tokenResponse());
    };
    assert.equal(await new Auth(memoryVault(initial())).accessToken(), 'new');
    assert.equal(defaultCalls, 1);
    let injectedCalls = 0;
    const auth = new Auth(memoryVault(initial()), function () {
      assert.equal(this, undefined, 'injected transport must not receive Auth as this');
      injectedCalls++;
      return Promise.resolve(tokenResponse());
    });
    assert.equal(await auth.accessToken(), 'new');
    assert.equal(injectedCalls, 1);
  } finally { globalThis.fetch = original; }
});

test('refresh rotation serializes concurrent consumers and persists atomically', async () => {
  const vault = memoryVault(initial());
  const gate = deferred();
  let calls = 0;
  const auth = new Auth(vault, async (_url, init) => {
    calls++;
    assert.equal(init.body.get('client_id'), 'issued-client');
    assert.equal(init.body.has('scope'), false);
    await gate.promise;
    return tokenResponse();
  });
  await auth.ready;
  const first = auth.accessToken();
  const second = auth.accessToken();
  gate.resolve();
  assert.deepEqual(await Promise.all([first, second]), ['new', 'new']);
  assert.equal(calls, 1);
  assert.equal(vault.value.tokens.refreshToken, 'refresh-new');
  assert.equal(vault.value.tokens.accessToken, 'new');
  const restarted = new Auth(vault, () => { throw new Error('unexpected network'); });
  assert.equal(await restarted.accessToken(), 'new');
});

test('logout generation prevents a late refresh from restoring credentials', async () => {
  const vault = memoryVault(initial());
  const gate = deferred();
  const entered = deferred();
  const auth = new Auth(vault, async url => {
    if (url.endsWith('/oauth/token')) {
      entered.resolve(); await gate.promise; return tokenResponse();
    }
    throw new TypeError('offline');
  });
  await auth.ready;
  const refresh = auth.accessToken();
  await entered.promise;
  const logout = await auth.logout();
  assert.equal(logout.remoteRevocationConfirmed, false);
  gate.resolve();
  await assert.rejects(refresh, { code: 'SIGNED_OUT' });
  assert.equal(vault.value.tokens, null);
  assert.equal(vault.value.registration.clientId, 'issued-client');
  assert.equal(vault.value.generation, 1);
});

test('transient refresh failures retain tokens, terminal invalid_grant clears them', async () => {
  for (const terminal of [false, true]) {
    const vault = memoryVault(initial());
    const auth = new Auth(vault, async () => terminal
      ? Response.json({ error: 'invalid_grant' }, { status: 400 })
      : Response.json({ error: 'server_error' }, { status: 503 }));
    await assert.rejects(auth.accessToken(),
      { code: terminal ? 'REFRESH_INVALID' : 'AUTH_UNAVAILABLE' });
    assert.equal(Boolean(vault.value.tokens), !terminal);
    assert.equal(vault.value.registration.clientId, 'issued-client');
  }
});

test('returning login reuses host and issued registration; logout omits token hints', async () => {
  const auth = new Auth(memoryVault(initial()), async () => { throw new TypeError('offline'); });
  const first = new URL((await auth.begin(4)).url);
  assert.equal(first.searchParams.get('client_id'), 'issued-client');
  assert.equal(first.searchParams.get('ext_agent_host_id'), 'urn:uuid:test');
  assert.equal(first.searchParams.has('agent_name_hint'), false);
  assert.equal(first.searchParams.get('id_token_hint'), 'id-old');
  await auth.logout();
  const second = new URL((await auth.begin(5)).url);
  assert.equal(second.searchParams.get('client_id'), 'issued-client');
  assert.equal(second.searchParams.has('id_token_hint'), false);
  assert.notEqual(first.searchParams.get('state'), second.searchParams.get('state'));
});

test('callback rejects wrong state, tab and returning client before code exchange', async () => {
  let exchanges = 0;
  const auth = new Auth(memoryVault(initial()), async () => { exchanges++; throw new Error(); });
  const query = new URL((await auth.begin(4)).url).searchParams;
  await assert.rejects(auth.finish('?state=wrong&code=abc', 4), { code: 'CALLBACK_INVALID' });
  await assert.rejects(auth.finish(`?state=${query.get('state')}&code=abc`, 5), { code: 'CALLBACK_INVALID' });
  await assert.rejects(auth.finish(`?state=${query.get('state')}&code=abc&client_id=other`, 4),
    { code: 'CALLBACK_INVALID' });
  assert.equal(exchanges, 0);
});

test('first registration retains issued client after a rejected one-time code', async () => {
  const vault = memoryVault(null);
  const auth = new Auth(vault, async (_url, init) => {
    assert.equal(init.body.get('client_id'), 'new-issued-client');
    assert.equal(init.body.get('grant_type'), 'authorization_code');
    return Response.json({ error: 'invalid_grant' }, { status: 400 });
  });
  const first = new URL((await auth.begin(6)).url);
  assert.equal(first.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(first.searchParams.get('agent_name_hint'), 'Translate with AI');
  await assert.rejects(auth.finish(`?state=${first.searchParams.get('state')}&code=code&client_id=new-issued-client`, 6),
    { code: 'REFRESH_INVALID' });
  const next = new URL((await auth.begin(7)).url);
  assert.equal(next.searchParams.get('client_id'), 'new-issued-client');
  assert.equal(next.searchParams.get('ext_agent_host_id'), first.searchParams.get('ext_agent_host_id'));
  assert.equal(vault.value.tokens, null);
});

test('network diagnostics identify safe phases without exposing request data', async () => {
  for (const name of ['TypeError', 'TimeoutError', 'UnexpectedPrivateName']) {
    const vault = memoryVault(null);
    const auth = new Auth(vault, async () => {
      const error = new Error('request secret-code secret-token https://private.invalid');
      error.name = name;
      throw error;
    });
    const authorization = new URL((await auth.begin(4)).url);
    await assert.rejects(auth.finish(`?state=${authorization.searchParams.get('state')}&code=secret-code&client_id=issued-client`, 4),
      error => {
        assert.equal(error.code, name === 'TimeoutError' ? 'AUTH_TIMEOUT' : 'AUTH_NETWORK');
        assert.ok(error.message.includes('認証コード交換'));
        assert.ok(error.message.includes(name === 'UnexpectedPrivateName' ? 'NetworkError' : name));
        assert.equal(/secret|private|UnexpectedPrivateName/.test(error.message), false);
        return true;
      });
    assert.equal(vault.value.registration.clientId, 'issued-client');
    assert.equal(vault.value.tokens, null);
  }
});

test('unusable vault stays untouched until explicit recovery and can then sign in', async () => {
  for (const code of ['VAULT_KEY_MISSING', 'VAULT_CORRUPT']) {
    let resets = 0;
    let saves = 0;
    const vault = { async load() { throw Object.assign(new Error('unusable'), { code }); },
      async save() { saves++; }, async reset(value) { resets++; this.value = value; } };
    const auth = new Auth(vault);
    const status = await auth.status();
    assert.equal(status.needsRecovery, true);
    assert.equal(status.recoveryCode, code);
    assert.equal(status.connected, false);
    await assert.rejects(auth.begin(4), { code: 'RECOVERY_REQUIRED' });
    await assert.rejects(auth.logout(), { code: 'RECOVERY_REQUIRED' });
    assert.equal(saves, 0);
    assert.equal(resets, 0);
    const recovered = await auth.recover();
    assert.equal(resets, 1);
    assert.equal(recovered.connected, false);
    assert.equal(recovered.needsRecovery, undefined);
    assert.equal(vault.value.tokens, null);
    assert.equal(vault.value.registration, null);
    assert.equal(new URL((await auth.begin(4)).url).searchParams.get('client_id'),
      'dynamic_agent_client');
    await assert.rejects(auth.recover(), { code: 'RECOVERY_NOT_REQUIRED' });
    assert.equal(resets, 1);
  }
});

test('malformed decrypted state requires recovery instead of being overwritten', async () => {
  const vault = memoryVault({ unexpected: true });
  const auth = new Auth(vault);
  assert.equal((await auth.status()).recoveryCode, 'VAULT_CORRUPT');
  assert.deepEqual(vault.value, { unexpected: true });
});

test('cancellation of an old authorization attempt preserves a newer pending login', async () => {
  const auth = new Auth(memoryVault(initial()));
  const old = await auth.begin(4);
  await auth.cancelLogin(4, old.attemptId);
  const next = await auth.begin(4);
  await auth.cancelLogin(4, old.attemptId);
  assert.equal(auth.state.pending.state, next.attemptId);
  assert.equal((await auth.status()).loginPending, true);
});

test('authorization cancellation and reauthorization prevent late credential writes', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256' }, true, ['sign', 'verify']);
  const key = await crypto.subtle.exportKey('jwk', pair.publicKey);
  key.kid = 'test';
  const gate = deferred();
  const entered = deferred();
  const vault = memoryVault(initial());
  let signedToken;
  const auth = new Auth(vault, async url => {
    if (url.endsWith('/jwks.json')) return Response.json({ keys: [key] });
    entered.resolve(); await gate.promise;
    return Response.json({ access_token: 'new', refresh_token: 'new-refresh',
      id_token: signedToken, scope: 'chatgpt.tokens.use.direct', expires_in: 3600 });
  });
  const pending = new URL((await auth.begin(8)).url).searchParams;
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: AUTH_BASE, aud: 'issued-client',
    sub: 'account-1', nonce: pending.get('nonce'), exp: Date.now() / 1000 + 3600 })).toString('base64url');
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey,
    new TextEncoder().encode(`${header}.${payload}`));
  signedToken = `${header}.${payload}.${Buffer.from(signature).toString('base64url')}`;
  const finishing = auth.finish(`?state=${pending.get('state')}&code=code`, 8);
  await entered.promise;
  await auth.cancelLogin(8);
  gate.resolve();
  await assert.rejects(finishing, { code: 'SIGNED_OUT' });
  assert.equal(vault.value.tokens.accessToken, 'old');
  assert.equal(vault.value.pending, null);

  const next = new URL((await auth.begin(9)).url).searchParams;
  const nextPayload = Buffer.from(JSON.stringify({ iss: AUTH_BASE, aud: 'issued-client',
    sub: 'account-1', nonce: next.get('nonce'), exp: Date.now() / 1000 + 3600 })).toString('base64url');
  const nextSignature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey,
    new TextEncoder().encode(`${header}.${nextPayload}`));
  signedToken = `${header}.${nextPayload}.${Buffer.from(nextSignature).toString('base64url')}`;
  const refreshGate = deferred();
  const refreshEntered = deferred();
  auth.fetcher = async (url, init) => {
    if (url.endsWith('/jwks.json')) return Response.json({ keys: [key] });
    if (init.body.get('grant_type') === 'refresh_token') {
      refreshEntered.resolve(); await refreshGate.promise;
      return tokenResponse();
    }
    return Response.json({ access_token: 'reauthorized', refresh_token: 'reauthorized-refresh',
      id_token: signedToken, scope: 'chatgpt.tokens.use.direct', expires_in: 3600 });
  };
  const oldRefresh = auth.accessToken();
  await refreshEntered.promise;
  await auth.finish(`?state=${next.get('state')}&code=next-code`, 9);
  refreshGate.resolve();
  await assert.rejects(oldRefresh, { code: 'SIGNED_OUT' });
  assert.equal(vault.value.tokens.accessToken, 'reauthorized');
  assert.equal(vault.value.tokens.refreshToken, 'reauthorized-refresh');
  assert.equal(vault.value.generation, 1);
});

test('RS256 identity verification rejects changed signature, nonce, audience and subject', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256' }, true, ['sign', 'verify']);
  const key = await crypto.subtle.exportKey('jwk', pair.publicKey);
  key.kid = 'test';
  const fetcher = async () => Response.json({ keys: [key] });
  const sign = async claims => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey,
      new TextEncoder().encode(`${header}.${payload}`));
    return `${header}.${payload}.${Buffer.from(signature).toString('base64url')}`;
  };
  const claims = { iss: AUTH_BASE, aud: 'issued-client', sub: 'account-1',
    exp: Date.now() / 1000 + 3600, nonce: 'nonce' };
  const token = await sign(claims);
  assert.equal((await verifyIdentity(token, 'issued-client', 'nonce', fetcher, 'account-1')).sub, 'account-1');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = function () {
      assert.equal(this, globalThis, 'JWKS native fetch requires its global receiver');
      return fetcher();
    };
    assert.equal((await verifyIdentity(token, 'issued-client', 'nonce')).sub, 'account-1');
  } finally { globalThis.fetch = originalFetch; }
  for (const [client, nonce, subject] of [['wrong', 'nonce', 'account-1'],
    ['issued-client', 'wrong', 'account-1'], ['issued-client', 'nonce', 'other']]) {
    await assert.rejects(verifyIdentity(token, client, nonce, fetcher, subject), { code: 'IDENTITY_INVALID' });
  }
  const parts = token.split('.');
  const signature = Buffer.from(parts[2], 'base64url'); signature[0] ^= 1;
  await assert.rejects(verifyIdentity(`${parts[0]}.${parts[1]}.${signature.toString('base64url')}`,
    'issued-client', 'nonce', fetcher), { code: 'IDENTITY_INVALID' });
  await assert.rejects(verifyIdentity(await sign({ ...claims, aud: ['issued-client', 'other'] }),
    'issued-client', 'nonce', fetcher), { code: 'IDENTITY_INVALID' });
});
