import { failure } from './auth.js';
import { plamoRequest } from './plamo.js';
import { isLocalProvider, localEndpoints, normalizeEndpoint } from './connections.js';

function endpointFor({ provider = 'lmstudio', endpoint }) {
  if (!isLocalProvider(provider)) throw failure('LOCAL_ENDPOINT', 'Invalid local provider.');
  try {
    return normalizeEndpoint(endpoint ?? localEndpoints[provider]);
  } catch {
    throw failure('LOCAL_ENDPOINT', 'Invalid local connection URL.');
  }
}

const isPlamo = id => typeof id === 'string' && /plamo-3-translate/i.test(id);

export class LocalTranslationAPI {
  constructor(fetcher = globalThis.fetch.bind(globalThis)) {
    this.fetcher = fetcher;
  }

  async json(url, options) {
    let response;
    try {
      response = await this.fetcher(url, { ...options, redirect: 'error', credentials: 'omit' });
    } catch (error) {
      options.signal.throwIfAborted();
      throw failure('LOCAL_UNAVAILABLE', 'Could not reach LM Studio.');
    }
    if (response.status === 401 || response.status === 403) {
      throw failure('LOCAL_AUTH', 'LM Studio requires authentication.');
    }
    if (!response.ok) throw failure('LOCAL_REQUEST_FAILED', 'LM Studio rejected the request.');
    try {
      return await response.json();
    } catch {
      options.signal.throwIfAborted();
      throw failure('LOCAL_REQUEST_FAILED', 'LM Studio returned an invalid response.');
    }
  }

  async models(connection = {}, signal = AbortSignal.timeout(5000)) {
    const endpoint = endpointFor(connection);
    let models;
    if (connection.provider && connection.provider !== 'lmstudio') {
      const data = await this.json(endpoint + '/models', { signal });
      if (!Array.isArray(data?.data)) throw failure('LOCAL_REQUEST_FAILED', 'Invalid model list.');
      models = data.data.filter(model => isPlamo(model.id)).map(({ id }) => ({
        slug: id, displayName: id, contextLength: 4096, preferred: /plamo-3-translate-2b\b/i.test(id),
      }));
    } else {
      models = await this.lmStudioModels(endpoint, signal);
    }
    if (!models.length) throw failure('LOCAL_NO_MODEL', 'Make PLaMo 3 Translate available on the server.');
    return models;
  }

  async lmStudioModels(endpoint, signal) {
    const data = await this.json(endpoint.replace(/\/v1$/, '') + '/api/v1/models', { signal });
    if (!Array.isArray(data?.models)) throw failure('LOCAL_REQUEST_FAILED', 'Could not read the LM Studio model list.');
    return data.models.filter(model => model.type === 'llm' && isPlamo(model.key))
      .flatMap(model => (model.loaded_instances ?? [])
        .filter(instance => typeof instance.id === 'string' && instance.config?.context_length > 256)
        .map(instance => ({
          slug: instance.id, displayName: model.display_name || model.key,
          contextLength: instance.config.context_length,
          preferred: /plamo-3-translate-2b\b/i.test(model.key),
        })));
  }

  async translate(request, signal) {
    const models = await this.models(request, AbortSignal.any([signal, AbortSignal.timeout(5000)]));
    const model = models.find(item => item.slug === request.model);
    if (!model) throw failure('LOCAL_NO_MODEL', 'Load the selected model in LM Studio.');
    const options = plamoRequest(request, model.contextLength);
    const response = await this.json(endpointFor(request) + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
      signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]),
    });
    const choice = response?.choices?.[0];
    if (choice?.finish_reason === 'length') throw failure('LOCAL_CONTEXT', 'The local translation reached its output limit.');
    const text = choice?.message?.content;
    if (choice?.finish_reason !== 'stop' || typeof text !== 'string' || !text.trim()) {
      throw failure('LOCAL_REQUEST_FAILED', 'LM Studio did not return a complete translation.');
    }
    return { text };
  }
}
