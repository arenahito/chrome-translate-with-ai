import { failure } from './auth.js';

const supported = new Set('ja en zh-hans zh-hant ko ar az be bg bn ca ceb de es et eu fa fr gu he hi hr hu hy id it jv ka kk km lt lv ml mr ms my ne nl pa pl ru si sk sl sr sw ta te th tl ur uz vi'.split(' '));

export function supportsPlamoLanguage(code) {
  return supported.has(code.toLowerCase()) || code === 'ja-plain';
}

export function plamoRequest(request, contextLength) {
  if (!supportsPlamoLanguage(request.targetLanguage) ||
      (request.sourceLanguage !== 'auto' && !supported.has(request.sourceLanguage.toLowerCase()))) {
    throw failure('LOCAL_LANGUAGE', 'Select a language supported by PLaMo 3 Translate.');
  }
  const target = request.targetLanguage === 'ja-plain' ? 'ja' : request.targetLanguage.toLowerCase();
  const options = ['[plamo-translate]', `target_lang=${target}`];
  if (request.sourceLanguage !== 'auto') options.push(`source_lang=${request.sourceLanguage.toLowerCase()}`);
  if (target === 'ja') options.push(`form=${request.targetLanguage === 'ja-plain' ? 'plain' : 'polite'}`);

  // Reserve half of the usable context for output and budget input conservatively by UTF-8 bytes.
  const budget = Math.floor(Math.min(contextLength, 32768) / 2);
  if (new TextEncoder().encode(request.text).length + 128 > budget) {
    throw failure('LOCAL_CONTEXT', 'The text exceeds the local model context budget.');
  }
  return {
    model: request.model,
    messages: [{ role: 'system', content: options.join('\n') }, { role: 'user', content: request.text }],
    temperature: 0,
    max_tokens: budget,
    stop: ['<|plamo:tag|>', '<|plamo:bos|>'],
  };
}
