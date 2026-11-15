import { errorText, loadLanguage, t } from './localization.js';

const query = location.search;
history.replaceState(null, '', location.pathname);
const status = document.querySelector('#status');
try {
  await loadLanguage();
  const reply = await chrome.runtime.sendMessage({
    target: 'background', type: 'oauthCallback', query,
  });
  if (!reply?.ok) throw Object.assign(new Error(), reply?.error || { code: 'OPERATION_FAILED' });
  status.textContent = t('connectedCallback');
} catch (error) {
  status.textContent = errorText(error);
}
