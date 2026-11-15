const encoder = new TextEncoder();
const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('translation-browser-test', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('requests', { autoIncrement: true });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

globalThis.fetch = async function (url, options = {}) {
  if (this !== globalThis) throw new TypeError('Illegal invocation');
  options.signal?.throwIfAborted();
  const db = await database;
  const payload = options.body && typeof options.body === 'string'
    ? JSON.parse(options.body) : null;
  await new Promise((resolve, reject) => {
    const transaction = db.transaction('requests', 'readwrite');
    transaction.objectStore('requests').add({ url: String(url), payload });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  if (String(url).endsWith('/api/v1/models')) return Response.json({
    models: [{ type: 'llm', key: 'pfnet/plamo-3-translate-2b', display_name: 'PLaMo 3 Translate 2B',
      loaded_instances: [{ id: 'plamo-3-translate-2b', config: { context_length: 32768 } }] }],
  });
  if (String(url).endsWith('/models')) return Response.json({
    models: [
      { slug: 'gpt-6.1-terra', display_name: 'GPT-6.1 Terra', visibility: 'list', supported_reasoning_levels: ['low', 'medium', 'high'] },
      { slug: 'gpt-6-luna', display_name: 'GPT-6 Luna', visibility: 'list', supported_reasoning_levels: ['low', 'medium', 'high'] },
      { slug: 'gpt-6-pro', display_name: 'GPT-6 Pro', visibility: 'list', supported_reasoning_levels: ['low', 'medium', 'high'] },
    ],
  });
  if (String(url).endsWith('/responses')) {
    await new Promise(resolve => setTimeout(resolve, 700));
    options.signal?.throwIfAborted();
    const source = payload.input[0].content;
    const output = source === 'Hello, world.' ? 'こんにちは、世界。' : `翻訳:${source}`;
    const events = [{ type: 'response.output_text.delta', delta: output.slice(0, 3) },
      { type: 'response.output_text.delta', delta: output.slice(3) },
      { type: 'response.completed', response: { status: 'completed' } }];
    return new Response(new ReadableStream({ start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.close();
    } }), { headers: { 'Content-Type': 'text/event-stream' } });
  }
  if (String(url).endsWith('/oauth/token')) return Response.json({
    access_token: 'synthetic-new-access-token', refresh_token: 'synthetic-rotated-refresh-token',
    expires_in: 3600, scope: 'chatgpt.tokens.use.direct',
  });
  throw new Error('Unexpected request in browser test');
};
