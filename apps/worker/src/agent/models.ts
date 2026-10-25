import type { StreamFn } from '@earendil-works/pi-agent-core';
import {
  type Api,
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Model,
} from '@earendil-works/pi-ai';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';

import { type AgentConfig, ConfigError, type FauxStep } from '../config.ts';

// OpenRouter's free variants end in ":free"; "openrouter/free" routes among them.
const FREE_MODEL_ID = /(:free$)|(^openrouter\/free$)/;

export interface ModelSource {
  model: Model<Api>;
  streamFn: StreamFn;
  getApiKey?: (provider: string) => string | undefined;
}

export function createModelSource(config: AgentConfig): ModelSource {
  const models = createModels();
  if (config.provider === 'faux') {
    const faux = fauxProvider({ tokensPerSecond: 1_000_000 });
    models.setProvider(faux.provider);
    faux.setResponses(config.script.map(toFauxMessage));
    return { model: faux.getModel(), streamFn: models.streamSimple.bind(models) };
  }
  models.setProvider(openrouterProvider());
  const model = models.getModel('openrouter', config.modelId);
  // Nest only runs free models: a paid or unknown model is a configuration error, never a fallback.
  if (!model || !isFreeModel(model)) throw new ConfigError(['PI_MODEL_ID']);
  const apiKey = config.apiKey;
  return {
    model,
    streamFn: models.streamSimple.bind(models),
    getApiKey: (provider) => (provider === 'openrouter' ? apiKey : undefined),
  };
}

function isFreeModel(model: Model<Api>): boolean {
  const { input, output, cacheRead, cacheWrite } = model.cost;
  return FREE_MODEL_ID.test(model.id) && input === 0 && output === 0 && cacheRead === 0 && cacheWrite === 0;
}

function toFauxMessage(step: FauxStep) {
  return 'text' in step
    ? fauxAssistantMessage([fauxText(step.text)])
    : fauxAssistantMessage([fauxToolCall(step.toolCall.name, step.toolCall.args)], { stopReason: 'toolUse' });
}
