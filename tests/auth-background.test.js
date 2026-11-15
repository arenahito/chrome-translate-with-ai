import test from 'node:test';
import assert from 'node:assert/strict';

const handlers = {};
const session = {};
const local = {};
const rules = new Map();
const engineCalls = [];
let nextTab = 10;
let nextAttempt = 0;
let finishResolve;
let finishEntered;
const entered = new Promise(resolve => { finishEntered = resolve; });
const finish = new Promise(resolve => { finishResolve = resolve; });
const event = name => ({ addListener(listener) { handlers[name] = listener; } });
const origin = 'chrome-extension://test-extension';
globalThis.chrome = {
  i18n: { getUILanguage: () => 'en-US' },
  runtime: { id: 'test-extension', getURL: path => `${origin}/${path}`,
    getContexts: async () => [{}], onMessage: event('message'),
    onInstalled: event('installed'), onStartup: event('startup'),
    async sendMessage(message) {
      engineCalls.push(message);
      if (message.type === 'status') return { ok: true, data: { connected: false } };
      if (message.type === 'authBegin') {
        const attemptId = `attempt-${++nextAttempt}`;
        return { ok: true, data: { url: `https://auth.openai.com/?state=${attemptId}`,
          attemptId, expiresAt: Date.now() + 600000 } };
      }
      if (message.type === 'authFinish') { finishEntered(); return finish; }
      return { ok: true, data: {} };
    } },
  storage: { onChanged: event('storage'), local: {
    get: async key => ({ [key]: structuredClone(local[key]) }),
    set: async values => { Object.assign(local, structuredClone(values)); },
  },
    session: { async get(key) {
      return key === null ? structuredClone(session) : { [key]: structuredClone(session[key]) };
    }, async set(values) { Object.assign(session, structuredClone(values)); },
    async remove(key) { delete session[key]; } } },
  declarativeNetRequest: { async updateSessionRules({ removeRuleIds = [], addRules = [] }) {
    removeRuleIds.forEach(id => rules.delete(id));
    addRules.forEach(rule => rules.set(rule.id, structuredClone(rule)));
  } },
  tabs: { create: async () => ({ id: nextTab++ }), update: async () => ({}),
    get: async id => ({ id }), onRemoved: event('removed'), onUpdated: event('updated'),
  },
  action: { onClicked: event('action') },
  alarms: { onAlarm: event('alarm') },
};
await import('../src/background.js');
const sender = { id: 'test-extension', url: `${origin}/index.html`,
  documentId: 'ui-document', frameId: 0, tab: { id: 1 } };
const rpc = (type, data = {}, source = sender) => new Promise(resolve => {
  handlers.message({ target: 'background', type, ...data }, source, resolve);
});

test('web pages cannot invoke translation or removed page operations', async () => {
  const web = { id: 'test-extension', url: 'https://example.com', frameId: 0, documentId: 'doc', tab: { id: 77 } };
  for (const type of ['translateStart', 'pageSettings', 'pageModels', 'pagePreferences']) {
    assert.equal((await rpc(type, {}, web)).error.code, 'ACCESS_DENIED');
  }
  assert.equal((await rpc('pageSettings')).error.code, 'INVALID_REQUEST');
});

test('late callback cleanup preserves the new login session and redirect rule', async () => {
  assert.equal((await rpc('login')).ok, true);
  const old = structuredClone(session.oauthPending);
  const callback = rpc('oauthCallback', { query: `?state=${old.attemptId}&code=old-code` },
    { ...sender, url: `${origin}/callback.html`, tab: { id: old.tabId } });
  await entered;
  assert.equal((await rpc('logout')).ok, true);
  assert.equal((await rpc('login')).ok, true);
  const current = structuredClone(session.oauthPending);
  const callsBeforeOldFinish = engineCalls.length;
  finishResolve({ ok: false, error: { code: 'SIGNED_OUT', message: '取り消されました。' } });
  assert.equal((await callback).error.code, 'SIGNED_OUT');
  assert.deepEqual(session.oauthPending, current);
  assert.deepEqual(rules.get(1).condition.tabIds, [current.tabId]);
  assert.equal(engineCalls.slice(callsBeforeOldFinish)
    .some(message => message.type === 'authCancel'), false);
});

test('recovery remains restricted to the extension UI', async () => {
  const response = await rpc('recover', {}, { id: 'test-extension',
    url: 'https://example.com', tab: { id: 50 }, frameId: 0, documentId: 'doc' });
  assert.equal(response.error.code, 'ACCESS_DENIED');
});
