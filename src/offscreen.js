const worker = new Worker(new URL('./engine-worker.js', import.meta.url),
  { type: 'module' });
const pending = new Map();
worker.onmessage = ({ data }) => {
  const resolve = pending.get(data.id);
  if (resolve) { pending.delete(data.id); resolve(data); }
};
worker.onerror = () => {
  for (const resolve of pending.values()) resolve({ ok: false,
    error: { code: 'ENGINE_UNAVAILABLE', message: '翻訳処理を開始できませんでした。拡張機能を再読み込みしてください。' } });
  pending.clear();
};
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== 'offscreen' || sender.id !== chrome.runtime.id ||
    sender.tab || (sender.url &&
    sender.url !== chrome.runtime.getURL('src/background.js'))) return;
  const id = crypto.randomUUID();
  pending.set(id, respond);
  worker.postMessage({ id, type: message.type, payload: message.payload });
  return true;
});
