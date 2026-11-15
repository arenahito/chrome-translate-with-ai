export const messages = {
  provider: ['Translation engine', '翻訳エンジン'],
  customProvider: ['Custom', 'カスタム'],
  endpoint: ['Connection URL', '接続先'],
  resetEndpoint: ['Reset', 'リセット'],
  refreshLocal: ['Refresh models', 'モデル一覧を更新'],
  localConnected: ['Connected to local server', 'ローカルサーバーに接続済み'],
  error_LOCAL_ENDPOINT: ['Enter an HTTP or HTTPS URL on localhost or 127.0.0.1.', 'localhost または 127.0.0.1 の HTTP・HTTPS URL を入力してください。'],
  selectLanguage: ['Select a language', '言語を選択'],
  error_LOCAL_UNAVAILABLE: ['Check the local server and connection URL, then refresh the model list.', 'ローカルサーバーと接続先を確認し、モデル一覧を更新してください。'],
  error_LOCAL_AUTH: ['The local server requires authentication. Use a loopback server without API token authentication.', 'ローカルサーバーが認証を要求しました。APIトークン認証を使わないループバックサーバーに接続してください。'],
  error_LOCAL_REQUEST_FAILED: ['The local server could not complete the request. Check its server and model settings.', 'ローカルサーバーで処理を完了できませんでした。サーバーとモデルの設定を確認してください。'],
  error_LOCAL_NO_MODEL: ['Make a supported translation model available on the local server, then refresh the model list.', 'ローカルサーバーで対応する翻訳モデルを利用できる状態にし、モデル一覧を更新してください。'],
  error_LOCAL_CONTEXT: ['The text or translation exceeds the local model’s context budget. Split the text and try again.', '原文または訳文がローカルモデルの処理上限を超えました。原文を分割して再度お試しください。'],
  error_LOCAL_LANGUAGE: ['Select a language supported by PLaMo 3 Translate.', 'PLaMo 3 Translateが対応する言語を選択してください。'],
  home: ['Translate with AI home', 'Translate with AI ホーム'],
  login: ['Log in', 'ログイン'], logout: ['Log out', 'ログアウト'],
  settings: ['Settings', '設定'], translationSettings: ['Translation settings', '翻訳の設定'],
  model: ['Model', 'モデル'], effort: ['Reasoning level', '推論レベル'],
  fastMode: ['Fast mode', 'Fast モード'],
  appearance: ['Appearance', '外観'], system: ['System', 'システム'],
  light: ['Light', 'ライト'], dark: ['Dark', 'ダーク'],
  interfaceLanguage: ['Display language', '表示言語'],
  usage: ['ChatGPT settings and usage ↗', 'ChatGPT の設定・使用状況 ↗'],
  checkingConnection: ['Checking connection', '接続を確認中'],
  recovery: ['Sign-in recovery', '接続情報の復旧'],
  recoveryTitle: ['Saved sign-in information is unavailable', '保存済みの接続情報を使用できません'],
  recoveryDescription: ['Reset saved sign-in information to reconnect. This removes local sign-in data but does not disconnect the app from your ChatGPT account.', '再接続するには初期化してください。保存済みの接続情報は削除されます。ChatGPT 側の接続は解除されません。'],
  recover: ['Reset saved sign-in', '保存済み接続情報を初期化'],
  editor: ['Translation editor', '翻訳エディター'],
  sourceLanguage: ['Source language', '原文の言語'], targetLanguage: ['Target language', '翻訳先の言語'],
  sourceText: ['Text to translate', '翻訳する文章'], source: ['Original', '原文'],
  stop: ['Stop', '停止'], translate: ['Translate', '翻訳する'],
  translateShortcut: ['Translate with Ctrl + Enter (Cmd + Enter on macOS)', 'Ctrl + Enter で翻訳（macOS は Cmd + Enter）'],
  swap: ['Swap source and target languages', '原文と翻訳の言語を入れ替える'],
  swapReason: ['Languages cannot be swapped while the source language is set to auto-detect.', '翻訳元が自動検出の場合は言語を交換できません。'],
  clear: ['Clear', 'クリア'], copy: ['Copy', 'コピー'],
  sourcePlaceholder: ['Enter or paste text to translate', '翻訳する文章を入力、または貼り付けてください'],
  result: ['Translation', '翻訳'], resultLabel: ['Translation result', '翻訳結果'],
  outdated: ['Outdated translation', '更新前の翻訳'],
  resultEmpty: ['Your translation will appear here', '翻訳結果がここに表示されます'],
  autoDetect: ['Detect language', '言語を自動検出'],
  japanesePolite: ['Japanese (polite)', '日本語（敬体）'], japanesePlain: ['Japanese (plain)', '日本語（常体）'],
  detected: ['{language} detected', '{language}を検出'],
  loading: ['Loading…', '読み込み中…'], selectModel: ['Select a model', 'モデルを選択してください'],
  loginToSelect: ['Log in to select a model', 'ログインすると選択できます'],
  selectedEffort: ['{effort} (selected)', '{effort}（選択中）'],
  connected: ['Connected to ChatGPT', 'ChatGPT に接続済み'], disconnected: ['Not connected', '未接続'],
  connectionFailed: ['Could not connect', '接続できません'],
  loginRequired: ['Log in to ChatGPT to translate.', 'ChatGPT にログインすると翻訳できます。'],
  openLoginSettings: ['Open settings', '設定を開く'],
  resetRequired: ['Reset saved sign-in information, then reconnect.', '保存済みの接続情報を初期化してから再接続してください。'],
  settingsSaveFailed: ['Could not save settings.', '設定を保存できませんでした。'],
  settingsLoadFailed: ['Could not load saved settings.', '保存した設定を読み込めませんでした。'],
  changed: ['The original text or settings changed. Translate again to update the result.', '原文または設定が変更されました。翻訳し直してください。'],
  completed: ['Translation complete.', '翻訳が完了しました。'],
  stopped: ['Translation stopped.', '翻訳を停止しました。'],
  translationFailed: ['Could not translate. Please try again.', '翻訳できませんでした。もう一度お試しください。'],
  signInFirst: ['Please log in to ChatGPT.', 'ChatGPT にログインしてください。'],
  enterText: ['Enter text to translate.', '翻訳する文章を入力してください。'],
  inputLimit: ['The original text must be 50,000 characters or fewer.', '原文は 50,000 文字以内にしてください。'],
  translating: ['Translating…', '翻訳しています…'],
  startFailed: ['Could not start translation. Please try again.', '翻訳を開始できませんでした。もう一度お試しください。'],
  copied: ['Translation copied.', '翻訳をコピーしました。'],
  copyFailed: ['Could not copy. Select the translation and copy it manually.', 'コピーできませんでした。翻訳結果を選択してコピーしてください。'],
  loginPrompt: ['Connect to ChatGPT in the sign-in tab.', 'ログイン画面で ChatGPT に接続してください。'],
  revocationUnconfirmed: ['Signed out of this extension. Revocation by OpenAI could not be confirmed. Check the connection in ChatGPT settings.', 'この拡張機能からログアウトしました。OpenAI 側の認証取り消しは確認できませんでした。ChatGPT の設定で接続状況をご確認ください。'],
  chatgptSettings: ['ChatGPT settings ↗', 'ChatGPT の設定 ↗'],
  confirmReset: ['Delete saved sign-in information from this extension? This does not disconnect the app from your ChatGPT account.', '保存済みの接続情報をこの拡張機能から削除します。ChatGPT 側の接続は解除されません。初期化しますか？'],
  resetComplete: ['Saved sign-in information was reset. Log in to ChatGPT again.', '保存済みの接続情報を初期化しました。ChatGPT にログインしてください。'],
  connectTitle: ['Connecting to ChatGPT', 'ChatGPTへの接続'],
  checkingSignIn: ['Checking sign-in information…', '接続情報を確認しています…'],
  openTranslator: ['Open translator', '翻訳画面を開く'],
  connectedCallback: ['Connected. You can close this tab and return to the translator.', '接続しました。このタブを閉じて翻訳画面に戻れます。'],
  openingLogin: ['Opening the ChatGPT sign-in page…', 'ChatGPTのログイン画面を開いています…'],
  operationFailed: ['Could not complete the operation. Please try again.', '操作を完了できませんでした。再度お試しください。'],
  error_EXTENSION_UNAVAILABLE: ['Open this app from Chrome’s extensions page.', 'Chrome の拡張機能ページから開き直してください。'],
  error_EXTENSION_DISCONNECTED: ['The extension disconnected. Reload this page.', '拡張機能との接続が切れました。このページを再読み込みしてください。'],
  error_INVALID_REQUEST: ['Check the translation settings and try again.', '翻訳設定を確認してください。'],
  error_INPUT_LIMIT: ['Enter between 1 and 50,000 characters.', '原文は1〜50,000文字で指定してください。'],
  error_USAGE_LIMIT: ['Your ChatGPT allowance is exhausted or temporarily unavailable. Try again later.', 'ChatGPTの利用上限に達したか、現在利用できません。時間をおいてお試しください。'],
  error_LOGIN_REQUIRED: ['Please reconnect to ChatGPT.', 'ChatGPTに再接続してください。'],
  error_ACCESS_DENIED: ['This account or screen is not authorized for this operation.', 'このアカウントまたは画面では操作が許可されていません。'],
  error_API_UNAVAILABLE: ['Translation is unavailable. Please try again.', '翻訳を完了できませんでした。再度お試しください。'],
  error_STREAM_INTERRUPTED: ['The translation stream ended before completion. Please try again.', '翻訳の完了を確認できませんでした。再度お試しください。'],
  error_STREAM_INVALID: ['The translation response could not be read. Please try again.', '翻訳結果の形式を読み取れませんでした。'],
  error_OUTPUT_LIMIT: ['The translation exceeded the output limit.', '翻訳結果の文字数が上限を超えました。'],
  error_MODELS_EMPTY: ['No models are available for this account.', '利用できるモデルがありません。'],
  error_MODEL_UNAVAILABLE: ['This model is unavailable. Select another model in settings.', '選択したモデルは利用できません。設定でモデルを選び直してください。'],
  error_EFFORT_UNAVAILABLE: ['This reasoning level is unavailable for the selected model.', '選択したモデルでは、この推論レベルを利用できません。'],
  error_QUEUE_FULL: ['The translation queue is full. Wait for a translation to finish.', '翻訳の待機数が上限に達しました。完了後にお試しください。'],
  error_JOB_NOT_FOUND: ['This translation is no longer available. Start a new translation.', '翻訳処理が見つかりません。翻訳し直してください。'],
  error_TIMEOUT: ['Translation timed out. Please try again.', '翻訳の待機時間を超えました。再度お試しください。'],
  error_TRANSLATION_FAILED: ['Translation failed. Please try again.', '翻訳を完了できませんでした。再度お試しください。'],
  error_ENGINE_UNAVAILABLE: ['The translation engine is unavailable. Reload the extension.', '翻訳処理を開始できませんでした。拡張機能を再読み込みしてください。'],
  error_LOGIN_PENDING: ['A sign-in attempt is already in progress.', '接続操作が進行中です。'],
  error_CALLBACK_INVALID: ['The sign-in attempt expired or did not match. Start sign-in again.', '接続操作の有効期限が切れたか、タブが一致しません。ログインし直してください。'],
  error_IDENTITY_INVALID: ['Your ChatGPT account could not be verified. Sign in again.', 'ChatGPTアカウントの検証に失敗しました。'],
  error_LOGIN_DENIED: ['Sign-in was not authorized.', '接続が許可されませんでした。'],
  error_SIGNED_OUT: ['The connection was cancelled or signed out.', '接続が解除されました。'],
  error_GRANT_INVALID: ['ChatGPT plan access could not be verified. Sign in again.', 'ChatGPT利用枠の許可または接続情報を確認できませんでした。'],
  error_AUTH_NETWORK: ['A network error prevented connecting to ChatGPT. Please try again.', '通信エラーでChatGPTに接続できませんでした。再度お試しください。'],
  error_AUTH_TIMEOUT: ['Connecting to ChatGPT timed out. Please try again.', 'ChatGPTへの接続がタイムアウトしました。再度お試しください。'],
  error_AUTH_UNAVAILABLE: ['ChatGPT sign-in is temporarily unavailable. Please try again.', 'ChatGPTに接続できませんでした。再度お試しください。'],
  error_REFRESH_INVALID: ['Saved sign-in information could not be refreshed. Reconnect to ChatGPT.', '接続情報を更新できませんでした。ChatGPTに再接続してください。'],
  error_VAULT_CORRUPT: ['Saved sign-in information is damaged. Reset it to reconnect.', '保存済み接続情報を読み込めません。初期化して再接続してください。'],
  error_VAULT_KEY_MISSING: ['The key for saved sign-in information is missing. Reset it to reconnect.', '保存済み接続情報の暗号鍵がありません。初期化して再接続してください。'],
  error_RECOVERY_REQUIRED: ['Reset saved sign-in information before reconnecting.', '保存済みの接続情報を初期化してから再接続してください。'],
  error_RECOVERY_NOT_REQUIRED: ['Saved sign-in information does not need to be reset.', '保存済み接続情報の初期化は不要です。'],
};

export function preferredLanguage(saved, browserLanguage = globalThis.chrome?.i18n?.getUILanguage() ?? globalThis.navigator?.language ?? 'en') {
  return ['en', 'ja'].includes(saved) ? saved : /^ja(?:-|$)/i.test(browserLanguage) ? 'ja' : 'en';
}

let language = preferredLanguage();
export function setLanguage(value) { language = preferredLanguage(value); }
export function getLanguage() { return language; }
export function t(key, parameters = {}) {
  const value = messages[key]?.[language === 'ja' ? 1 : 0] ?? key;
  return value.replace(/\{(\w+)\}/g, (_, name) => parameters[name] ?? '');
}
export function errorText(error) {
  const key = `error_${error?.code}`;
  return t(messages[key] ? key : 'operationFailed');
}
export function languageName(code, target = false) {
  if (target && code === 'ja') return t('japanesePolite');
  if (target && code === 'ja-plain') return t('japanesePlain');
  return new Intl.DisplayNames([language], { type: 'language' }).of(code);
}
export function applyTranslations(root = document) {
  for (const element of root.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const attribute of ['aria-label', 'title', 'placeholder']) {
    for (const element of root.querySelectorAll(`[data-i18n-${attribute}]`)) {
      element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
    }
  }
  root.documentElement.lang = language;
}
export async function loadLanguage() {
  const { settings } = await chrome.storage.local.get('settings');
  setLanguage(settings?.uiLanguage);
  applyTranslations();
}
