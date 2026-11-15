const RULE_ID = 1;
let creatingOffscreen;
let startingLogin = false;
let pendingMutation = Promise.resolve();

function mutatePending(operation) {
  const result = pendingMutation.then(operation);
  pendingMutation = result.catch(() => {});
  return result;
}

const fail = (code, message) => Object.assign(new Error(message), { code });
const safeError = error => ({ code: typeof error.code === 'string'
  ? error.code : 'OPERATION_FAILED',
message: typeof error.code === 'string' ? error.message
  : '操作を完了できませんでした。再度お試しください。' });

async function engine(type, payload = {}) {
  const url = chrome.runtime.getURL('src/offscreen.html');
  if (!(await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url] })).length) {
    if (!creatingOffscreen) {
      creatingOffscreen = chrome.offscreen.createDocument({
        url: 'src/offscreen.html', reasons: ['WORKERS'],
        justification: '翻訳リクエストと接続情報を管理するWorkerを実行するため',
      }).finally(() => { creatingOffscreen = null; });
    }
    await creatingOffscreen;
  }
  const response = await chrome.runtime.sendMessage({ target: 'offscreen', type, payload });
  if (!response?.ok) throw fail(response?.error?.code || 'ENGINE_UNAVAILABLE',
    response?.error?.message || '翻訳エンジンに接続できませんでした。');
  return response.data;
}

function extensionPage(sender, file) {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  const url = new URL(sender.url);
  return url.protocol === 'chrome-extension:' && url.hostname === chrome.runtime.id &&
    url.pathname === `/${file}`;
}

async function clearPendingUnlocked(cancel = true, expected) {
  const pending = (await chrome.storage.session.get('oauthPending')).oauthPending;
  if (expected === null && pending) return;
  if (expected && (!pending || pending.attemptId !== expected.attemptId ||
    pending.tabId !== expected.tabId || pending.expiresAt !== expected.expiresAt)) return;
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE_ID] });
  await chrome.storage.session.remove('oauthPending');
  if (cancel) await engine('authCancel', {
    tabId: pending?.tabId, attemptId: pending?.attemptId,
  });
}

async function clearPending(cancel = true, expected) {
  return mutatePending(() => clearPendingUnlocked(cancel, expected));
}

async function cleanupPending(force = false) {
  const pending = (await chrome.storage.session.get('oauthPending')).oauthPending;
  if (!pending || force || pending.expiresAt <= Date.now()) {
    await clearPending(true, pending || null);
    return;
  }
  try { await chrome.tabs.get(pending.tabId); } catch { await clearPending(true, pending); }
}

async function login() {
  if (startingLogin) throw fail('LOGIN_PENDING', '接続操作が進行中です。');
  startingLogin = true;
  try {
    if ((await engine('status')).needsRecovery) {
      throw fail('RECOVERY_REQUIRED', '保存済み接続情報の初期化が必要です。');
    }
    await cleanupPending();
    return await mutatePending(async () => {
      let tab;
      let authorization;
      try {
        const pending = (await chrome.storage.session.get('oauthPending')).oauthPending;
        if (pending) {
          await chrome.tabs.update(pending.tabId, { active: true });
          return { loginPending: true };
        }
        tab = await chrome.tabs.create({ url: chrome.runtime.getURL('waiting.html'), active: true });
        authorization = await engine('authBegin', { tabId: tab.id });
        await chrome.storage.session.set({ oauthPending: {
          tabId: tab.id, expiresAt: authorization.expiresAt, attemptId: authorization.attemptId,
        } });
        await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE_ID],
          addRules: [{ id: RULE_ID, priority: 1,
            action: { type: 'redirect', redirect: { transform: {
              scheme: 'chrome-extension', host: chrome.runtime.id,
              port: '', path: '/callback.html',
            } } },
            condition: { regexFilter: '^http://127\\.0\\.0\\.1:54329/auth/callback\\?',
              resourceTypes: ['main_frame'], tabIds: [tab.id] },
          }],
        });
        await chrome.tabs.update(tab.id, { url: authorization.url });
        return { loginPending: true };
      } catch (error) {
        if (tab) {
          await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE_ID] });
          await chrome.storage.session.remove('oauthPending');
          await engine('authCancel', { tabId: tab.id,
            attemptId: authorization?.attemptId }).catch(() => {});
        }
        throw error;
      }
    });
  } finally { startingLogin = false; }
}

async function callback(message, sender) {
  if (!extensionPage(sender, 'callback.html') || sender.frameId !== 0 ||
    !sender.tab || typeof message.query !== 'string' || message.query.length > 20000) {
    throw fail('ACCESS_DENIED', 'この画面から接続操作を完了できません。');
  }
  const pending = (await chrome.storage.session.get('oauthPending')).oauthPending;
  if (!pending || pending.tabId !== sender.tab.id || pending.expiresAt <= Date.now()) {
    throw fail('CALLBACK_INVALID', '接続操作の有効期限が切れたか、タブが一致しません。');
  }
  try {
    return await engine('authFinish', { query: message.query, tabId: sender.tab.id });
  } finally { await clearPending(true, pending); }
}

async function ownerFor(sender) {
  if (extensionPage(sender, 'index.html')) {
    return `ui:${sender.tab?.id ?? 'window'}:${sender.documentId || sender.url}`;
  }
  throw fail('ACCESS_DENIED', '拡張機能の画面から操作してください。');
}

async function dispatch(message, sender) {
  if (message.type === 'oauthCallback') return callback(message, sender);
  const ownPage = extensionPage(sender, 'index.html');
  if (['status', 'login', 'logout', 'models', 'localModels', 'recover'].includes(message.type)) {
    if (!ownPage) throw fail('ACCESS_DENIED', '拡張機能の画面から操作してください。');
    if (message.type === 'localModels') return engine('localModels', { provider: message.provider, endpoint: message.endpoint });
    if (message.type === 'login') return login();
    if (message.type === 'logout') {
      return mutatePending(async () => {
        await clearPendingUnlocked();
        return engine('logout');
      });
    }
    if (message.type === 'recover') {
      return mutatePending(async () => {
        await clearPendingUnlocked(false);
        return engine('recover');
      });
    }
    return engine(message.type);
  }
  const owner = await ownerFor(sender);
  switch (message.type) {
    case 'translateStart': return engine('translateStart', { request: message, owner });
    case 'translateGet':
    case 'translateCancel':
      if (typeof message.jobId !== 'string' || message.jobId.length > 100) {
        throw fail('INVALID_REQUEST', '翻訳処理の識別子が不正です。');
      }
      return engine(message.type, { jobId: message.jobId, owner });
    default: throw fail('INVALID_REQUEST', '未対応の操作です。');
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== 'background') return;
  dispatch(message, sender).then(data => respond({ ok: true, data }),
    error => respond({ ok: false, error: safeError(error) }));
  return true;
});

async function openApp() {
  const url = chrome.runtime.getURL('index.html');
  const tabs = await chrome.tabs.query({ url });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else await chrome.tabs.create({ url });
}

async function cleanupLegacyPageData() {
  await chrome.storage.local.remove('pageTranslationSettings');
  const entries = await chrome.storage.session.get(null);
  const keys = Object.keys(entries).filter(key => key.startsWith('pageSession:') || ['selectedText', 'lastPageError'].includes(key));
  if (keys.length) await chrome.storage.session.remove(keys);
}

chrome.action.onClicked.addListener(() => { openApp().catch(() => {}); });
chrome.tabs.onRemoved.addListener(tabId => {
  (async () => {
    await engine('cancelTab', { tabId });
    const pending = (await chrome.storage.session.get('oauthPending')).oauthPending;
    if (pending?.tabId === tabId) await clearPending(true, pending);
  })().catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading') {
    engine('cancelTab', { tabId })
      .catch(() => {});
  }
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'translation-cleanup') {
    Promise.all([cleanupPending(), engine('cleanup')]).catch(() => {});
  }
});
chrome.runtime.onInstalled.addListener(() => {
  Promise.all([cleanupLegacyPageData(), cleanupPending(true),
    chrome.alarms.create('translation-cleanup', { periodInMinutes: 1 }),
    chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  ]).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  Promise.all([cleanupPending(true), cleanupLegacyPageData(),
    chrome.alarms.create('translation-cleanup', { periodInMinutes: 1 }),
  ]).catch(() => {});
});
