import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const results = path.join(root, 'test-results');
await mkdir(results, { recursive: true });
const temporary = await mkdtemp(path.join(results, 'integration-'));
const profile = path.join(temporary, 'profile');
const extension = path.join(temporary, 'extension');
await mkdir(extension);
for (const name of ['manifest.json', 'index.html', 'callback.html', 'waiting.html', 'src', '_locales']) {
  await cp(path.join(root, name), path.join(extension, name), { recursive: true });
}
await cp('tests/fixtures/transport.js', path.join(extension, 'src/test-transport.js'));
await cp('tests/fixtures/credentials.js', path.join(extension, 'src/test-credentials.js'));
const engineFile = path.join(extension, 'src/engine-worker.js');
await writeFile(engineFile, `const buffered = [];\nconst buffer = event => buffered.push(event.data);\nself.addEventListener('message', buffer);\nawait import('./test-credentials.js');\nawait import('./test-transport.js');\n${await readFile(engineFile, 'utf8')}\nself.removeEventListener('message', buffer);\nfor (const data of buffered) self.onmessage({ data });\n`);
const origin = 'chrome-extension://dcglpehaicpeopdkdmociodkahdglkgi';
let context;
const checks = [];
const record = name => { checks.push(name); console.log(`PASS ${name}`); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function launch() {
  const browser = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE || chromium.executablePath(),
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1360, height: 940 },
  });
  browser.on('weberror', event => console.error('Browser error:', event.error().message));
  return browser;
}

async function seed(page) {
  await page.goto(`${origin}/waiting.html`);
  await page.evaluate(async () => {
    await chrome.storage.local.set({ settings: { theme: 'system', sourceLanguage: 'auto',
      targetLanguage: 'ja', model: 'latest-luna', effort: 'medium' }, pageTranslationSettings: { model: 'gpt-6-luna', effort: 'high' } });
  });
}

async function rpc(page, type, payload = {}) {
  const response = await page.evaluate(({ type, payload }) =>
    chrome.runtime.sendMessage({ target: 'background', type, ...payload }), { type, payload });
  assert.equal(response?.ok, true, `${type}: ${JSON.stringify(response?.error)}`);
  return response.data;
}

async function requests(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const opening = indexedDB.open('translation-browser-test', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('requests', { autoIncrement: true });
    opening.onsuccess = () => {
      const request = opening.result.transaction('requests').objectStore('requests').getAll();
      request.onsuccess = () => { resolve(request.result); opening.result.close(); };
      request.onerror = () => reject(request.error);
    };
    opening.onerror = () => reject(opening.error);
  }));
}

async function waitConnected(page) {
  await page.waitForFunction(() => !document.querySelector('#logout').hidden, null, { timeout: 15000 })
    .catch(async error => {
      console.error('Startup status:', await page.locator('#status').textContent());
      console.error('Startup account:', await page.locator('#account-status').textContent());
      throw error;
    });
}

try {
  context = await launch();
  const page = await context.newPage();
  await page.addInitScript(() => { chrome.i18n.getUILanguage = () => 'en-US'; });
  await seed(page);
  await page.goto(`${origin}/index.html`);
  await waitConnected(page);
  await page.waitForFunction(() => document.querySelector('#model').value === 'gpt-6.1-terra');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.locator('#translate').textContent(), 'Translate');
  assert.equal(await page.locator('#target-language option[value="ja-plain"]').textContent(), 'Japanese (plain)');
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    delete settings.uiLanguage;
    await chrome.storage.local.set({ settings });
  });
  const japaneseBrowser = await context.newPage();
  await japaneseBrowser.addInitScript(() => { chrome.i18n.getUILanguage = () => 'ja-JP'; });
  await japaneseBrowser.goto(`${origin}/index.html`);
  await waitConnected(japaneseBrowser);
  assert.equal(await japaneseBrowser.locator('html').getAttribute('lang'), 'ja');
  await japaneseBrowser.close();
  await page.reload();
  await waitConnected(page);
  await page.waitForFunction(() => document.querySelector('#model').value === 'gpt-6.1-terra');
  assert.equal(await page.locator('html').getAttribute('lang'), 'ja');
  record('first-use interface language is English except for Japanese browsers, and is saved');
  assert.equal(await page.locator('#model option[value^="latest-"]').count(), 0);
  assert.equal(await page.locator('#effort').inputValue(), 'low');
  assert.equal(await page.locator('#target-language option[value="ja"]').textContent(), '日本語（敬体）');
  assert.equal(await page.locator('#target-language option[value="ja-plain"]').textContent(), '日本語（常体）');
  assert.equal(await page.locator('#source-language option[value="ja"]').textContent(), '日本語');
  assert.equal(await page.evaluate(async () => (await chrome.storage.local.get('pageTranslationSettings')).pageTranslationSettings), undefined);
  record('saved Luna settings migrate to Terra Low while encrypted login is retained');
  assert.equal(await page.locator('#swap').getAttribute('aria-disabled'), 'true');
  await page.locator('#swap').hover();
  assert.equal(await page.locator('#swap-reason').isVisible(), true);
  await page.locator('#swap').click({ force: true });
  assert.equal(await page.locator('#source-language').inputValue(), 'auto');
  assert.equal(await page.locator('#target-language').inputValue(), 'ja');
  await page.locator('#source-language').selectOption('en');
  await page.locator('#swap').click();
  assert.equal(await page.locator('#source-language').inputValue(), 'ja');
  assert.equal(await page.locator('#target-language').inputValue(), 'en');
  assert.equal(await page.locator('#swap-reason').isVisible(), false);
  await page.locator('#source-language').selectOption('auto');
  await page.locator('#target-language').selectOption('ja');
  record('language settings swap before translation, with an explanatory tooltip for auto detection');
  await page.locator('#source-text').fill('Hello, world.');
  await delay(1100);
  assert.equal((await requests(page)).filter(item => item.url.endsWith('/responses')).length, 0);
  record('typing does not start translation');
  await page.locator('#translate').click();
  await page.waitForFunction(() => document.querySelector('#result').textContent === 'こんにちは、世界。');
  const payload = (await requests(page)).find(item => item.url.endsWith('/responses')).payload;
  assert.equal(payload.store, false);
  assert.equal(payload.stream, true);
  assert.equal(payload.reasoning.effort, 'low');
  assert.equal(payload.model, 'gpt-6.1-terra');
  assert.equal(Object.hasOwn(payload, 'service_tier'), false);
  record('button translation completes through Worker and mocked SSE');
  await page.locator('#settings-toggle').click();
  await page.locator('#ui-language').selectOption('en');
  assert.equal(await page.locator('#source-text').inputValue(), 'Hello, world.');
  assert.equal(await page.locator('#result').textContent(), 'こんにちは、世界。');
  assert.equal(await page.locator('#status').textContent(), 'Translation complete.');
  assert.equal(await page.locator('#swap-reason').textContent(), 'Languages cannot be swapped while the source language is set to auto-detect.');
  assert.equal(await page.locator('#model').inputValue(), 'gpt-6.1-terra');
  await page.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings.uiLanguage === 'en');
  const callback = await context.newPage();
  await callback.goto(`${origin}/callback.html`);
  await callback.waitForFunction(() => document.querySelector('#status').textContent.includes('Start sign-in again'));
  assert.equal(await callback.locator('html').getAttribute('lang'), 'en');
  const waiting = await context.newPage();
  await waiting.goto(`${origin}/waiting.html`);
  await waiting.waitForFunction(() => document.querySelector('p').textContent === 'Opening the ChatGPT sign-in page…');
  await page.locator('#ui-language').selectOption('ja');
  await page.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings.uiLanguage === 'ja');
  await callback.reload();
  await callback.waitForFunction(() => document.querySelector('#status').textContent.includes('ログインし直してください'));
  assert.equal(await callback.locator('html').getAttribute('lang'), 'ja');
  await waiting.reload();
  await waiting.waitForFunction(() => document.querySelector('p').textContent === 'ChatGPTのログイン画面を開いています…');
  await callback.close();
  await waiting.close();
  await page.locator('#settings-toggle').click();
  record('display-language changes preserve text and settings and localize connection pages and errors');
  await page.locator('#source-text').fill('Changed source');
  assert.equal(await page.locator('#outdated').isVisible(), true);
  await delay(900);
  assert.equal((await requests(page)).filter(item => item.url.endsWith('/responses')).length, 1);
  record('editing marks old translation stale without resending');
  await page.locator('#source-language').selectOption('en');
  await page.locator('#swap').click();
  assert.equal(await page.locator('#source-text').inputValue(), 'Changed source');
  assert.equal(await page.locator('#result').textContent(), 'こんにちは、世界。');
  assert.equal(await page.locator('#source-language').inputValue(), 'ja');
  assert.equal(await page.locator('#target-language').inputValue(), 'en');
  await page.locator('#source-language').selectOption('auto');
  await page.locator('#target-language').selectOption('ja');
  record('swapping only changes language settings and preserves both texts');
  await page.locator('#target-language').selectOption('ja-plain');
  await page.locator('#source-text').fill('Plain style sample');
  await page.locator('#translate').click();
  await page.waitForFunction(() => document.querySelector('#result').textContent === '翻訳:Plain style sample');
  assert.ok((await requests(page)).filter(item => item.url.endsWith('/responses')).at(-1).payload.instructions.includes('Use plain Japanese (だ・である調)'));
  await page.reload();
  await waitConnected(page);
  assert.equal(await page.locator('#target-language').inputValue(), 'ja-plain');
  await page.locator('#source-language').selectOption('en');
  await page.locator('#swap').click();
  assert.equal(await page.locator('#source-language').inputValue(), 'ja');
  assert.equal(await page.locator('#target-language').inputValue(), 'en');
  await page.locator('#source-language').selectOption('auto');
  await page.locator('#target-language').selectOption('ja');
  record('Japanese polite and plain targets persist and swap back to Japanese source');
  await page.locator('#source-text').fill('x'.repeat(50000));
  assert.equal(await page.locator('#character-count').textContent(), '50,000 / 50,000');
  assert.equal(await page.locator('#translate').isEnabled(), true);
  const beforeOverLimit = (await requests(page)).filter(item => item.url.endsWith('/responses')).length;
  await page.locator('#source-text').fill('x'.repeat(50001));
  assert.equal(await page.locator('#translate').isDisabled(), true);
  await page.locator('#source-text').press('Control+Enter');
  await page.locator('#settings-toggle').click();
  await page.locator('#ui-language').selectOption('en');
  assert.equal(await page.locator('#status').textContent(), 'The original text must be 50,000 characters or fewer.');
  await page.locator('#ui-language').selectOption('ja');
  assert.equal(await page.locator('#status').textContent(), '原文は 50,000 文字以内にしてください。');
  await page.locator('#settings-toggle').click();
  await delay(100);
  assert.equal((await requests(page)).filter(item => item.url.endsWith('/responses')).length, beforeOverLimit);
  record('app accepts 50,000 characters and blocks larger inputs including keyboard submission');
  const longText = 'A long paragraph inside the translation pane.\n'.repeat(500);
  await page.locator('#source-text').fill(longText);
  await page.evaluate(text => {
    document.querySelector('#result').textContent = text;
    document.querySelector('#result').hidden = false;
    document.querySelector('#result-empty').hidden = true;
  }, longText);
  for (const [width, height] of [[1366, 768], [1024, 600], [420, 740], [320, 480]]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => {
      const button = document.querySelector('#translate').getBoundingClientRect();
      const swap = document.querySelector('#swap').getBoundingClientRect();
      const source = document.querySelector('#source-text');
      const result = document.querySelector('#result');
      return { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        buttonBottom: button.bottom, buttonRight: button.right, swapLeft: swap.left,
        sourceHeight: source.clientHeight, resultHeight: result.clientHeight,
        sourceScrolls: source.scrollHeight > source.clientHeight, resultScrolls: result.scrollHeight > result.clientHeight };
    });
    assert.ok(layout.width <= width && layout.height <= height, `outer viewport ${width}x${height}`);
    assert.ok(layout.buttonBottom <= height && layout.sourceHeight > 0 && layout.resultHeight > 0);
    assert.ok(layout.buttonRight <= layout.swapLeft, 'translate button stays left of swap');
    assert.ok(layout.sourceScrolls && layout.resultScrolls);
    const busyLayout = await page.evaluate(() => {
      const stop = document.querySelector('#stop');
      stop.hidden = false;
      const button = document.querySelector('#translate').getBoundingClientRect();
      const swap = document.querySelector('#swap').getBoundingClientRect();
      const stopLeft = stop.getBoundingClientRect().left;
      stop.hidden = true;
      return { stopLeft, buttonRight: button.right, swapLeft: swap.left };
    });
    assert.ok(busyLayout.stopLeft >= 0 && busyLayout.buttonRight <= busyLayout.swapLeft, 'stop and translate fit left of swap');
  }
  await page.setViewportSize({ width: 1360, height: 940 });
  await page.locator('#source-text').fill('Changed source');
  await page.evaluate(() => { document.querySelector('#result').textContent = 'こんにちは、世界。'; });
  record('long text stays inside panes without scrolling the viewport at four window sizes');
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.locator('#theme').selectOption('dark');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.locator('#theme').selectOption('system');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  record('theme selection persists and system changes apply live');
  await page.screenshot({ path: path.join(results, 'desktop-dark.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.screenshot({ path: path.join(results, 'desktop-light.png'), fullPage: true });
  await page.setViewportSize({ width: 420, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(results, 'mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1360, height: 940 });
  record('narrow layout has no horizontal overflow');
  await page.locator('#settings-toggle').click();
  await page.locator('#ui-language').selectOption('en');
  await page.screenshot({ path: path.join(results, 'settings-english.png'), fullPage: true });
  await page.locator('#settings-toggle').click();
  for (const [width, height] of [[1366, 768], [1024, 600], [420, 740], [320, 480]]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => {
      const stop = document.querySelector('#stop');
      stop.hidden = false;
      const action = document.querySelector('#translate').getBoundingClientRect();
      const swap = document.querySelector('#swap').getBoundingClientRect();
      const stopLeft = stop.getBoundingClientRect().left;
      stop.hidden = true;
      return { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, stopLeft, buttonRight: action.right, swapLeft: swap.left };
    });
    assert.ok(layout.width <= width && layout.height <= height && layout.stopLeft >= 0 && layout.buttonRight <= layout.swapLeft);
  }
  await page.screenshot({ path: path.join(results, 'mobile-english.png'), fullPage: true });
  await page.setViewportSize({ width: 1360, height: 940 });
  record('English controls fit desktop and narrow viewports');

  await page.locator('#settings-toggle').click();
  await page.locator('#model').selectOption('gpt-6-luna');
  await page.locator('#effort').selectOption('medium');
  await page.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings.model === 'gpt-6-luna');
  await page.reload();
  await waitConnected(page);
  await page.waitForFunction(() => document.querySelector('#model').value === 'gpt-6-luna');
  assert.equal(await page.locator('#effort').inputValue(), 'medium');
  await page.locator('#settings-toggle').click();
  await page.locator('#model').selectOption('gpt-6-pro');
  await page.locator('#effort').selectOption('high');
  const fastMode = page.getByRole('switch', { name: 'Fast mode' });
  assert.equal(await fastMode.isChecked(), false);
  await fastMode.check();
  await page.locator('#settings-toggle').click();
  await page.waitForFunction(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    return settings.effort === 'high' && settings.fastMode === true;
  });
  record('model and effort selections persist after the one-time Terra migration');
  await page.evaluate(async () => {
    const { Vault } = await import(chrome.runtime.getURL('src/vault.js'));
    const vault = new Vault();
    const state = await vault.load();
    state.tokens.expiresAt = Date.now() - 1;
    await vault.save(state);
  });
  await context.close(); context = null;
  context = await launch();
  let restarted = await context.newPage();
  await restarted.goto(`${origin}/index.html`);
  await waitConnected(restarted);
  assert.equal(await restarted.locator('html').getAttribute('lang'), 'en');
  assert.equal((await rpc(restarted, 'status')).connected, true);
  record('browser restart restores login without a new OAuth flow');
  await restarted.waitForFunction(() => document.querySelector('#model').value === 'gpt-6-pro');
  assert.equal(await restarted.locator('#effort').inputValue(), 'high');
  record('model and effort selections survive browser restart');
  await restarted.locator('#source-text').fill('Hello, world.');
  await restarted.locator('#source-text').press('Control+Enter');
  await restarted.waitForFunction(() => document.querySelector('#result').textContent === 'こんにちは、世界。');
  record('Ctrl+Enter translates after restart');
  const lastResponsesPayload = async () => (await requests(restarted))
    .filter(item => item.url.endsWith('/responses')).at(-1).payload;
  assert.equal((await lastResponsesPayload()).service_tier, 'priority');
  await restarted.locator('#settings-toggle').click();
  const restoredFastMode = restarted.getByRole('switch', { name: 'Fast mode' });
  assert.equal(await restoredFastMode.isChecked(), true);
  await restoredFastMode.uncheck();
  await restarted.locator('#settings-toggle').click();
  await restarted.locator('#translate').click();
  await restarted.waitForFunction(() => document.querySelector('#status').textContent === 'Translation complete.');
  assert.equal(Object.hasOwn(await lastResponsesPayload(), 'service_tier'), false);
  record('Fast mode persists across restart and controls whether priority is requested');
  assert.ok((await requests(restarted)).some(item => item.url.endsWith('/oauth/token')));
  record('expired persisted credentials refresh after browser restart');
  await restarted.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const opening = indexedDB.open('chatgpt-translate-vault', 1);
      opening.onsuccess = () => {
        const transaction = opening.result.transaction('vault', 'readwrite');
        transaction.objectStore('vault').delete('key');
        transaction.oncomplete = () => { opening.result.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
      opening.onerror = () => reject(opening.error);
    });
  });
  await context.close(); context = null;
  context = await launch();
  restarted = await context.newPage();
  await restarted.goto(`${origin}/index.html`);
  await restarted.locator('#recover').waitFor({ state: 'visible' });
  assert.equal(await restarted.locator('#login').isDisabled(), true);
  restarted.once('dialog', dialog => dialog.accept());
  await restarted.locator('#recover').click();
  await restarted.waitForFunction(() => document.querySelector('#recovery').hidden && !document.querySelector('#login').disabled);
  assert.equal((await rpc(restarted, 'status')).connected, false);
  record('missing vault key requires explicit recovery and never silently restores credentials');
  const loginShortcut = restarted.locator('#open-login-settings');
  assert.equal(await restarted.locator('#login').isVisible(), false);
  await restarted.locator('#source-text').fill('Hello, world.');
  await loginShortcut.press('Enter');
  assert.equal(await restarted.locator('#settings-toggle').getAttribute('aria-expanded'), 'true');
  assert.equal(await restarted.locator('#settings-panel #login:focus').count(), 1);
  await restarted.locator('#provider').selectOption('lmstudio');
  assert.equal(await restarted.locator('#login').isVisible(), false);
  assert.equal(await loginShortcut.isVisible(), false);
  assert.equal(await restarted.locator('#fast-mode').isVisible(), false);
  await restarted.locator('#provider').selectOption('chatgpt');
  await loginShortcut.waitFor({ state: 'visible' });
  await restarted.locator('#login').press('Escape');
  assert.equal(await restarted.locator('#settings-toggle:focus').count(), 1);
  assert.equal(await restarted.locator('#login').isVisible(), false);
  record('signed-out ChatGPT offers a keyboard shortcut to the login button in settings');
  await writeFile(path.join(results, 'browser-results.json'), JSON.stringify({ checks }, null, 2));
} finally {
  if (context) await context.close();
  assert.ok(path.resolve(temporary).startsWith(path.resolve(results) + path.sep));
  await rm(temporary, { recursive: true, force: true });
}
