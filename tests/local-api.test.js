import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalTranslationAPI } from '../src/local-api.js';

const request = {
  model: 'plamo-alias', sourceLanguage: 'auto', targetLanguage: 'ja-plain',
  text: 'This system is convenient.',
};
const signal = new AbortController().signal;

test('local translation uses the loaded model ID and explicit PLaMo target and register', async () => {
  const calls = [];
  const api = new LocalTranslationAPI(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/models')) return Response.json({ models: [
      { type: 'llm', key: 'plamo-3-translate-2b', loaded_instances: [
        { id: 'plamo-alias', config: { context_length: 4096 } },
      ] },
      { type: 'llm', key: 'other-model', loaded_instances: [] },
    ] });
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'このシステムは便利だ。' } }] });
  });
  assert.deepEqual(await api.translate(request, signal), { text: 'このシステムは便利だ。' });
  assert.equal(calls[1].url, 'http://127.0.0.1:1234/v1/chat/completions');
  assert.equal(calls[1].options.redirect, 'error');
  assert.equal(calls[1].options.headers.Authorization, undefined);
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.model, 'plamo-alias');
  assert.equal(body.max_tokens, 2048);
  assert.match(body.messages[0].content, /target_lang=ja\nform=plain$/);
  assert.deepEqual(body.messages[1], { role: 'user', content: request.text });
  await assert.rejects(api.translate({ ...request, text: 'あ'.repeat(700) }, signal), { code: 'LOCAL_CONTEXT' });
  assert.equal(calls.length, 3);
});

test('Ollama and Custom use their configured compatible endpoint and reject non-loopback destinations', async () => {
  const calls = [];
  const api = new LocalTranslationAPI(async url => {
    calls.push(url);
    if (url.endsWith('/models')) return Response.json({ data: [{ id: 'plamo-3-translate-2b' }] });
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '翻訳' } }] });
  });
  const local = { ...request, model: 'plamo-3-translate-2b' };
  await api.translate({ ...local, provider: 'ollama' }, signal);
  await api.translate({ ...local, provider: 'custom', endpoint: 'http://localhost:9001/proxy/v1/' }, signal);
  await assert.rejects(api.models({ provider: 'custom', endpoint: 'https://example.com/v1' }), { code: 'LOCAL_ENDPOINT' });
  assert.deepEqual(calls, [
    'http://127.0.0.1:11434/v1/models', 'http://127.0.0.1:11434/v1/chat/completions',
    'http://localhost:9001/proxy/v1/models', 'http://localhost:9001/proxy/v1/chat/completions',
  ]);
});
