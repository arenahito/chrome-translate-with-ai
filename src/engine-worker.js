import { Vault } from './vault.js';
import { Auth, failure } from './auth.js';
import { TranslationAPI, JobQueue } from './api.js';

const auth = new Auth(new Vault());
const api = new TranslationAPI(auth);
const queue = new JobQueue(api);

async function dispatch(type, payload) {
  switch (type) {
    case 'status': return auth.status();
    case 'authBegin': return auth.begin(payload.tabId);
    case 'authFinish': {
      const result = await auth.finish(payload.query, payload.tabId);
      api.catalog = null;
      return result;
    }
    case 'authCancel': return auth.cancelLogin(payload.tabId, payload.attemptId);
    case 'recover':
      queue.cancelOwner('*');
      api.catalog = null;
      return auth.recover();
    case 'logout':
      queue.cancelOwner('*');
      api.catalog = null;
      return auth.logout();
    case 'models': return { models: await api.models(true) };
    case 'translateStart':
      if (!(await auth.status()).connected) throw failure('LOGIN_REQUIRED', 'ChatGPTに接続してください。');
      return queue.start(payload.request, payload.owner);
    case 'translateGet': return queue.get(payload.jobId, payload.owner);
    case 'translateCancel': return queue.cancel(payload.jobId, payload.owner);
    case 'cancelOwner': return queue.cancelOwner(payload.owner);
    case 'cancelTab': return queue.cancelTab(payload.tabId);
    case 'cleanup': queue.cleanup(); return {};
    default: throw failure('INVALID_REQUEST', '未対応の操作です。');
  }
}

self.onmessage = async ({ data }) => {
  try {
    const result = await dispatch(data.type, data.payload || {});
    self.postMessage({ id: data.id, ok: true, data: result ?? {} });
  } catch (error) {
    self.postMessage({ id: data.id, ok: false, error: {
      code: typeof error.code === 'string' ? error.code : 'ENGINE_ERROR',
      message: typeof error.code === 'string' ? error.message
        : '処理を完了できませんでした。再度お試しください。',
    } });
  }
};
