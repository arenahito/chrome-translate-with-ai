import test from 'node:test';
import assert from 'node:assert/strict';
import { errorText, languageName, preferredLanguage, setLanguage, t } from '../src/localization.js';

test('first-use language follows Japanese browser language and otherwise defaults to English', () => {
  for (const language of ['ja', 'ja-JP', 'JA-jp']) assert.equal(preferredLanguage(undefined, language), 'ja');
  for (const language of ['en-US', 'fr', 'zh-Hans', 'javanese']) assert.equal(preferredLanguage(undefined, language), 'en');
  assert.equal(preferredLanguage('en', 'ja-JP'), 'en');
  assert.equal(preferredLanguage('ja', 'en-US'), 'ja');
  assert.equal(preferredLanguage('invalid', 'en-US'), 'en');
});

test('language names, Japanese register and backend errors follow the selected interface language', () => {
  setLanguage('en');
  assert.equal(languageName('en'), 'English');
  assert.equal(languageName('ja', true), 'Japanese (polite)');
  assert.equal(languageName('ja-plain', true), 'Japanese (plain)');
  assert.equal(t('detected', { language: 'English' }), 'English detected');
  assert.match(errorText({ code: 'USAGE_LIMIT', message: '日本語のエラー' }), /ChatGPT allowance/);
  setLanguage('ja');
  assert.equal(languageName('en'), '英語');
  assert.equal(languageName('ja-plain', true), '日本語（常体）');
  assert.match(errorText({ code: 'USAGE_LIMIT' }), /利用上限/);
});
