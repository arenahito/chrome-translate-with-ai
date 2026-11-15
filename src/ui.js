import { languages, targetLanguages, normalizeLanguage, normalizeTargetLanguage } from './languages.js';
import { resolveModel } from './models.js';
import { applyTranslations, errorText, languageName, preferredLanguage, setLanguage, t } from './localization.js';

const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(['ui-language', 'source-language', 'target-language', 'source-text', 'model', 'effort', 'theme', 'result', 'result-empty', 'status', 'translate', 'stop', 'copy', 'clear', 'swap', 'swap-control', 'outdated', 'character-count', 'detected-language', 'login', 'logout', 'account-status', 'settings-toggle', 'settings-panel', 'recovery', 'recover'].map(id => [id, $(id)]));
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
let settings = { uiLanguage: preferredLanguage(), theme: 'system', sourceLanguage: 'auto', targetLanguage: normalizeLanguage(globalThis.chrome?.i18n?.getUILanguage() ?? navigator.language) ?? 'en', model: 'latest-terra', effort: 'low' };
let connected = false;
let busy = false;
let generation = 0;
let activeJob = null;
let models = [];
let saveQueue = Promise.resolve();
let pollTimer;
let statusGeneration = 0;
let persistentStatus = false;
let initialized = false;
let currentMessage = null;
let detectedLanguage = null;
let account = null;
let accountFailed = false;

function renderMessage() {
  if (!currentMessage) return;
  const { value, error } = currentMessage;
  ui.status.textContent = typeof value === 'string' ? t(value) : errorText(value);
  ui.status.dataset.error = String(error);
  if (value === 'revocationUnconfirmed') {
    const link = document.createElement('a');
    link.href = document.querySelector('.usage-link').href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = t('chatgptSettings');
    ui.status.append(' ', link);
  }
}

function message(value, error = false, persistent = false) {
  currentMessage = { value, error };
  persistentStatus = persistent;
  renderMessage();
}

function renderAccount() {
  const label = account?.accountLabel;
  ui['account-status'].textContent = accountFailed ? t('connectionFailed') : connected ? (label || t('connected')) : account ? t('disconnected') : t('checkingConnection');
  ui['account-status'].title = ui['account-status'].textContent;
}

function renderLanguage() {
  setLanguage(settings.uiLanguage);
  applyTranslations();
  ui['ui-language'].value = settings.uiLanguage;
  ui['source-language'].replaceChildren(new Option(t('autoDetect'), 'auto'), ...languages.map(([code]) => new Option(languageName(code), code)));
  ui['target-language'].replaceChildren(...targetLanguages.map(([code]) => new Option(languageName(code, true), code)));
  ui['source-language'].value = settings.sourceLanguage;
  ui['target-language'].value = settings.targetLanguage;
  ui['detected-language'].textContent = detectedLanguage ? t('detected', { language: languageName(detectedLanguage) }) : '';
  fillModelOptions();
  fillEfforts();
  renderAccount();
  renderMessage();
}

async function request(type, payload = {}) {
  if (!globalThis.chrome?.runtime?.sendMessage) throw Object.assign(new Error(), { code: 'EXTENSION_UNAVAILABLE' });
  let response;
  try { response = await chrome.runtime.sendMessage({ target: 'background', type, ...payload }); }
  catch { throw Object.assign(new Error(), { code: 'EXTENSION_DISCONNECTED' }); }
  if (!response?.ok) throw Object.assign(new Error(), response?.error || { code: 'OPERATION_FAILED' });
  return response.data;
}

function persist(patch) {
  Object.assign(settings, patch);
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    const stored = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...stored.settings, ...patch } });
  });
  saveQueue.catch(() => message('settingsSaveFailed', true));
}

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : settings.theme;
}
systemTheme.addEventListener('change', applyTheme);

function refreshControls() {
  const length = ui['source-text'].value.length;
  ui['character-count'].textContent = `${length.toLocaleString('en-US')} / 50,000`;
  ui['character-count'].style.color = length > 50000 ? 'var(--warning)' : '';
  ui.translate.disabled = !connected || !ui.model.value || busy || !ui['source-text'].value.trim() || length > 50000;
  ui.stop.hidden = !busy;
  ui.copy.disabled = !ui.result.textContent;
  const cannotSwap = settings.sourceLanguage === 'auto';
  ui.swap.setAttribute('aria-disabled', String(cannotSwap));
  ui['swap-control'].dataset.unavailable = String(cannotSwap);
  if (cannotSwap) ui.swap.setAttribute('aria-describedby', 'swap-reason');
  else ui.swap.removeAttribute('aria-describedby');
}

function showOutput(text) {
  ui.result.textContent = text || '';
  ui.result.hidden = !text;
  ui['result-empty'].hidden = Boolean(text);
  refreshControls();
}

function invalidate({ clear = false } = {}) {
  generation++;
  clearTimeout(pollTimer);
  if (activeJob) request('translateCancel', { jobId: activeJob }).catch(() => {});
  activeJob = null;
  busy = false;
  detectedLanguage = null;
  ui['detected-language'].textContent = '';
  if (clear) showOutput('');
  ui.outdated.hidden = clear || !ui.result.textContent;
  message(ui.result.textContent ? 'changed' : '');
  refreshControls();
}

async function detectSource(text, result, token) {
  let language = normalizeLanguage(result?.detectedSourceLanguage ?? result?.sourceLanguage ?? result?.detectedLanguage);
  if (settings.sourceLanguage !== 'auto') language = settings.sourceLanguage;
  if (!language && chrome.i18n?.detectLanguage) {
    try {
      const detection = await chrome.i18n.detectLanguage(text);
      if (detection.isReliable && detection.languages?.[0]?.percentage >= 70) language = normalizeLanguage(detection.languages[0].language);
    } catch { /* Language detection is optional. */ }
  }
  if (generation !== token) return;
  detectedLanguage = settings.sourceLanguage === 'auto' ? language : null;
  ui['detected-language'].textContent = detectedLanguage ? t('detected', { language: languageName(detectedLanguage) }) : '';
  refreshControls();
}

async function poll(jobId, token, original) {
  if (token !== generation) return;
  try {
    const job = await request('translateGet', { jobId });
    if (token !== generation) return;
    const text = typeof job.text === 'string' ? job.text : (typeof job.result === 'string' ? job.result : job.result?.text);
    if (typeof text === 'string') showOutput(text);
    if (job.status === 'completed') {
      busy = false;
      activeJob = null;
      message('completed');
      refreshControls();
      void detectSource(original, job.result && typeof job.result === 'object' ? job.result : job, token);
    } else if (job.status === 'failed' || job.status === 'cancelled') {
      busy = false;
      activeJob = null;
      message(job.status === 'cancelled' ? 'stopped' : (job.error || 'translationFailed'), job.status === 'failed');
      refreshControls();
    } else pollTimer = setTimeout(() => void poll(jobId, token, original), 300);
  } catch (error) {
    if (token !== generation) return;
    busy = false;
    activeJob = null;
    request('translateCancel', { jobId }).catch(() => {});
    message(error, true);
    refreshControls();
  }
}

async function translate() {
  const original = ui['source-text'].value;
  if (busy) return;
  if (!connected) return message('signInFirst');
  if (!original.trim()) return message('enterText');
  if (original.length > 50000) return message('inputLimit', true);
  const token = ++generation;
  busy = true;
  ui.outdated.hidden = true;
  detectedLanguage = null;
  ui['detected-language'].textContent = '';
  showOutput('');
  message('translating');
  try {
    const job = await request('translateStart', { mode: 'text', text: original, sourceLanguage: settings.sourceLanguage, targetLanguage: settings.targetLanguage, model: settings.model, effort: settings.effort });
    if (token !== generation) {
      if (job?.jobId) request('translateCancel', { jobId: job.jobId }).catch(() => {});
      return;
    }
    if (!job?.jobId) throw Object.assign(new Error(), { code: 'TRANSLATION_FAILED' });
    activeJob = job.jobId;
    void poll(job.jobId, token, original);
  } catch (error) {
    if (token !== generation) return;
    busy = false;
    message(error, true);
    refreshControls();
  }
}

function fillEfforts() {
  const available = models.find(model => model.slug === ui.model.value)?.efforts;
  const efforts = available?.length ? available : ['low', 'medium', 'high'];
  ui.effort.replaceChildren(...efforts.map(value => new Option(value[0].toUpperCase() + value.slice(1), value)));
  if (!efforts.includes(settings.effort)) ui.effort.add(new Option(t('selectedEffort', { effort: settings.effort }), settings.effort));
  ui.effort.value = settings.effort;
}

function fillModelOptions() {
  if (!models.length) {
    ui.model.replaceChildren(new Option(t(connected ? 'loading' : 'loginToSelect'), ''));
    ui.model.disabled = true;
    return;
  }
  const list = models.filter(model => !model.slug.startsWith('latest-'));
  const selected = resolveModel(list, settings.model);
  ui.model.replaceChildren(...list.map(model => new Option(model.displayName || model.slug, model.slug)));
  if (!selected) ui.model.prepend(new Option(t('selectModel'), ''));
  ui.model.value = selected?.slug || '';
  ui.model.disabled = !list.length;
}

async function loadModels() {
  try {
    const data = await request('models');
    models = data?.models ?? [];
    fillModelOptions();
    fillEfforts();
    refreshControls();
  } catch { /* Keep the saved model selection if the catalog request fails. */ }
}

async function refreshAccount() {
  const token = ++statusGeneration;
  try {
    const data = await request('status');
    if (token !== statusGeneration) return;
    const wasConnected = connected;
    connected = Boolean(data.connected);
    account = data;
    accountFailed = false;
    renderAccount();
    ui.login.hidden = connected;
    ui.login.disabled = Boolean(data.needsRecovery);
    ui.logout.hidden = !connected;
    ui.recovery.hidden = !data.needsRecovery;
    if (!connected && busy) invalidate();
    if (!connected && !persistentStatus) message(data.needsRecovery ? 'resetRequired' : 'loginRequired');
    else if (connected && !wasConnected) {
      if (!persistentStatus) message('');
      void loadModels();
    }
    refreshControls();
  } catch (error) {
    if (token !== statusGeneration) return;
    connected = false;
    if (busy) invalidate();
    ui.login.hidden = false;
    ui.logout.hidden = true;
    accountFailed = true;
    renderAccount();
    if (!persistentStatus) message(error, true);
    refreshControls();
  }
}

async function init() {
  try {
    const stored = await chrome.storage.local.get(['settings', 'appOnlyVersion']);
    settings = { ...settings, ...stored.settings };
    settings.uiLanguage = preferredLanguage(settings.uiLanguage);
    if (!stored.settings?.uiLanguage) await chrome.storage.local.set({ settings });
    if (stored.appOnlyVersion !== 1) {
      if (/luna/i.test(settings.model)) Object.assign(settings, { model: 'latest-terra', effort: 'low' });
      await chrome.storage.local.set({ settings, appOnlyVersion: 1 });
      await chrome.storage.local.remove('pageTranslationSettings');
    }
    if (!['system', 'light', 'dark'].includes(settings.theme)) settings.theme = 'system';
    if (settings.sourceLanguage !== 'auto' && !languages.some(([code]) => code === settings.sourceLanguage)) settings.sourceLanguage = 'auto';
    settings.targetLanguage = normalizeTargetLanguage(settings.targetLanguage) ?? 'en';
  } catch { message('settingsLoadFailed', true); }
  renderLanguage();
  ui.theme.value = settings.theme;
  ui['source-language'].value = settings.sourceLanguage;
  ui['target-language'].value = settings.targetLanguage;
  fillEfforts();
  applyTheme();
  refreshControls();
  initialized = true;
  void refreshAccount();
}

ui['source-text'].addEventListener('input', () => invalidate());
for (const [id, key] of [['source-language', 'sourceLanguage'], ['target-language', 'targetLanguage'], ['model', 'model'], ['effort', 'effort']]) {
  ui[id].addEventListener('change', () => {
    persist({ [key]: ui[id].value });
    invalidate();
    if (key === 'model') fillEfforts();
  });
}
ui['ui-language'].addEventListener('change', () => { persist({ uiLanguage: ui['ui-language'].value }); renderLanguage(); refreshControls(); });
ui.theme.addEventListener('change', () => { persist({ theme: ui.theme.value }); applyTheme(); });
ui.translate.addEventListener('click', translate);
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void translate(); }
  if (event.key === 'Escape' && !ui['settings-panel'].hidden) { ui['settings-panel'].hidden = true; ui['settings-toggle'].setAttribute('aria-expanded', 'false'); ui['settings-toggle'].focus(); }
});
ui.stop.addEventListener('click', () => { invalidate(); message('stopped'); });
ui.clear.addEventListener('click', () => { ui['source-text'].value = ''; invalidate({ clear: true }); ui['source-text'].focus(); });
ui.copy.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(ui.result.textContent); message('copied'); }
  catch { message('copyFailed', true); }
});
ui.swap.addEventListener('click', () => {
  if (settings.sourceLanguage === 'auto') return;
  const source = normalizeLanguage(settings.targetLanguage);
  const target = settings.sourceLanguage;
  ui['source-language'].value = source;
  ui['target-language'].value = target;
  persist({ sourceLanguage: source, targetLanguage: target });
  invalidate();
});
ui.login.addEventListener('click', async () => {
  ui.login.disabled = true;
  message('loginPrompt');
  try { await request('login'); await refreshAccount(); }
  catch (error) { message(error, true); }
  finally { ui.login.disabled = false; }
});
ui.logout.addEventListener('click', async () => {
  invalidate();
  ui.logout.disabled = true;
  try {
    const result = await request('logout');
    await refreshAccount();
    if (result?.remoteRevocationConfirmed === false) {
      message('revocationUnconfirmed', true, true);
    }
  }
  catch (error) { message(error, true); }
  finally { ui.logout.disabled = false; }
});
ui['settings-toggle'].addEventListener('click', () => {
  ui['settings-panel'].hidden = !ui['settings-panel'].hidden;
  ui['settings-toggle'].setAttribute('aria-expanded', String(!ui['settings-panel'].hidden));
});
document.addEventListener('click', event => {
  if (!event.target.closest('.settings-anchor')) { ui['settings-panel'].hidden = true; ui['settings-toggle'].setAttribute('aria-expanded', 'false'); }
});
ui.recover.addEventListener('click', async () => {
  if (!confirm(t('confirmReset'))) return;
  ui.recover.disabled = true;
  invalidate();
  try {
    await request('recover');
    await refreshAccount();
    message('resetComplete');
  } catch (error) { message(error, true); }
  finally { ui.recover.disabled = false; }
});
window.addEventListener('focus', () => { if (initialized) void refreshAccount(); });
window.addEventListener('pagehide', () => { if (activeJob) request('translateCancel', { jobId: activeJob }).catch(() => {}); });
void init();
