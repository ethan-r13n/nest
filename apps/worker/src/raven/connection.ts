import { DurableObject } from 'cloudflare:workers';
import {
  McpAuthRequiredError,
  McpClient,
  McpSessionExpiredError,
  StreamableHttpTransport,
} from '@earendil-works/pi-mcp';
import {
  adaptOAuthProvider,
  authorizeMcp,
  McpOAuthAuthorizationRequiredError,
  McpOAuthProvider,
  type McpOAuthState,
  type McpOAuthStateStore,
} from '@earendil-works/pi-mcp/oauth';

import { decodeEncryptionKey } from '../config.ts';
import { importEncryptionKey, seal, unseal } from './crypto.ts';

const RAVEN_MCP_URL = 'https://raven.stellar.org/mcp';
/** The single shared connection while Nest uses one team Raven account. */
export const TEAM_CONNECTION = 'team';

const SEALED_PURPOSE = 'raven-oauth-state';
const CALL_TIMEOUT_MS = 30_000;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS oauth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  redirect_url TEXT NOT NULL,
  sealed_state TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);`;

export type BeginResult = { status: 'redirect'; authorizationUrl: string } | { status: 'failed' };
export type CompleteResult = { status: 'connected' | 'no_pending' | 'invalid_state' | 'failed' };
export type RavenToolName = 'search' | 'execute';
export type RavenCallResult =
  | { status: 'ok'; isError: boolean; text: string }
  | { status: 'not_connected' }
  | { status: 'unavailable' };

/** The only Raven tools Nest calls, and the string input each must still require. */
const REQUIRED_INPUT: Record<RavenToolName, string> = { search: 'query', execute: 'code' };

export interface RavenTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

class NotConnectedError extends Error {
  override name = 'NotConnectedError';
}

class RavenSchemaError extends Error {
  override name = 'RavenSchemaError';
}

/** True when Raven still offers both tools with the inputs Nest's wrappers send. */
export function checkRavenTools(tools: readonly { name: string; inputSchema: unknown }[]): boolean {
  return Object.entries(REQUIRED_INPUT).every(([name, input]) => {
    const schema = tools.find((tool) => tool.name === name)?.inputSchema;
    if (typeof schema !== 'object' || schema === null) return false;
    const { properties, required } = schema as { properties?: Record<string, { type?: unknown }>; required?: unknown };
    return Array.isArray(required) && required.includes(input) && properties?.[input]?.type === 'string';
  });
}

/**
 * Owns Nest's Raven OAuth grant and MCP session. Every Raven call goes through this one object, so a
 * token refresh never races another one: with rotating refresh tokens, a second refresh would discard the grant.
 */
export class RavenConnection extends DurableObject<Env> {
  #key: Promise<CryptoKey> | undefined;
  #client: Promise<McpClient> | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(SCHEMA);
  }

  async status(): Promise<{ connected: boolean }> {
    const state = this.#row() ? await this.#loadState() : undefined;
    return { connected: Boolean(state?.tokens) };
  }

  /** Starts a fresh authorization. The current grant keeps working until the new one completes. */
  async beginAuthorization(redirectUrl: string): Promise<BeginResult> {
    const saved = this.#row()?.redirect_url === redirectUrl ? await this.#loadState() : undefined;
    if (saved) {
      // Same callback URL: reuse the registered client; each attempt gets a new verifier and state.
      const { codeVerifier: _verifier, oauthState: _state, ...kept } = saved;
      await this.#store(redirectUrl).save(kept);
    } else {
      // A client is registered for one callback URL, so another URL starts over.
      await this.#closeClient();
      this.ctx.storage.sql.exec('DELETE FROM oauth');
    }
    let authorizationUrl: URL | undefined;
    const provider = this.#provider(redirectUrl, (url) => {
      authorizationUrl = url;
    });
    try {
      const result = await authorizeMcp(provider, { serverUrl: RAVEN_MCP_URL, skipRefresh: true });
      if (result === 'REDIRECT' && authorizationUrl)
        return { status: 'redirect', authorizationUrl: authorizationUrl.href };
    } catch (error) {
      logFailure('begin', error);
    }
    return { status: 'failed' };
  }

  async completeAuthorization(input: {
    code: string;
    state: string;
    iss?: string | undefined;
  }): Promise<CompleteResult> {
    const row = this.#row();
    const saved = row ? await this.#loadState() : undefined;
    if (!row || !saved?.codeVerifier || !saved.oauthState) return { status: 'no_pending' };
    if (!constantTimeEqual(saved.oauthState, input.state)) return { status: 'invalid_state' };
    const provider = this.#provider(row.redirect_url, () => {});
    try {
      const result = await authorizeMcp(provider, {
        serverUrl: RAVEN_MCP_URL,
        authorizationCode: input.code,
        ...(input.iss ? { iss: input.iss } : {}),
      });
      if (result !== 'AUTHORIZED') return { status: 'failed' };
    } catch (error) {
      logFailure('complete', error);
      return { status: 'failed' };
    }
    // The state and verifier are single use.
    const { codeVerifier: _verifier, oauthState: _state, ...connected } = (await this.#loadState()) ?? saved;
    await this.#store(row.redirect_url).save(connected);
    await this.#closeClient();
    return { status: 'connected' };
  }

  async listTools(): Promise<RavenTool[] | null> {
    try {
      const tools = await (await this.#connected()).listTools({ timeoutMs: CALL_TIMEOUT_MS });
      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema,
      }));
    } catch (error) {
      if (!isAuthError(error)) logFailure('list_tools', error);
      await this.#closeClient();
      return null;
    }
  }

  async callTool(name: RavenToolName, args: Record<string, unknown>): Promise<RavenCallResult> {
    if (!Object.hasOwn(REQUIRED_INPUT, name)) return { status: 'unavailable' };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const client = await this.#connected();
        const result = await client.callTool(name, args, { timeoutMs: CALL_TIMEOUT_MS });
        const text = result.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n');
        return { status: 'ok', isError: result.isError === true, text };
      } catch (error) {
        await this.#closeClient();
        if (isAuthError(error)) return { status: 'not_connected' };
        // Raven may drop an idle MCP session; open a new one once.
        if (error instanceof McpSessionExpiredError && attempt === 0) continue;
        logFailure('call_tool', error);
        return { status: 'unavailable' };
      }
    }
    return { status: 'unavailable' };
  }

  #connected(): Promise<McpClient> {
    this.#client ??= this.#openClient().catch((error: unknown) => {
      this.#client = undefined;
      throw error;
    });
    return this.#client;
  }

  async #openClient(): Promise<McpClient> {
    const row = this.#row();
    if (!row) throw new NotConnectedError();
    const provider = this.#provider(row.redirect_url, () => {});
    const transport = new StreamableHttpTransport({
      url: RAVEN_MCP_URL,
      authProvider: adaptOAuthProvider(provider),
      openGetStream: false,
    });
    const client = new McpClient({ name: 'nest', version: '0.0.0' });
    client.onClose(() => {
      this.#client = undefined;
    });
    await client.connect(transport);
    // Remote tools never change what Nest sends: a changed schema stops Raven calls until the wrappers are updated.
    if (!checkRavenTools(await client.listTools({ timeoutMs: CALL_TIMEOUT_MS }))) {
      await client.close();
      throw new RavenSchemaError('Raven tool schemas changed.');
    }
    return client;
  }

  async #closeClient(): Promise<void> {
    const pending = this.#client;
    this.#client = undefined;
    await pending?.then((client) => client.close()).catch(() => {});
  }

  #provider(redirectUrl: string, onRedirect: (url: URL) => void): McpOAuthProvider {
    return new McpOAuthProvider({
      serverUrl: RAVEN_MCP_URL,
      redirectUrl,
      clientMetadata: {
        client_name: 'Nest',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: 'mcp',
      },
      store: this.#store(redirectUrl),
      onRedirect,
    });
  }

  #store(redirectUrl: string): McpOAuthStateStore {
    return {
      load: () => (this.#row() ? this.#loadState() : undefined),
      save: async (state) => {
        const sealed = await seal(await this.#encryptionKey(), SEALED_PURPOSE, JSON.stringify(state));
        this.ctx.storage.sql.exec(
          `INSERT INTO oauth (id, redirect_url, sealed_state, updated_at_ms) VALUES (1, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET redirect_url = excluded.redirect_url,
             sealed_state = excluded.sealed_state, updated_at_ms = excluded.updated_at_ms`,
          redirectUrl,
          sealed,
          Date.now(),
        );
      },
    };
  }

  async #loadState(): Promise<McpOAuthState | undefined> {
    const row = this.#row();
    if (!row) return undefined;
    return JSON.parse(await unseal(await this.#encryptionKey(), SEALED_PURPOSE, row.sealed_state)) as McpOAuthState;
  }

  #row(): { redirect_url: string; sealed_state: string } | undefined {
    return this.ctx.storage.sql
      .exec<{ redirect_url: string; sealed_state: string }>('SELECT redirect_url, sealed_state FROM oauth WHERE id = 1')
      .toArray()[0];
  }

  #encryptionKey(): Promise<CryptoKey> {
    this.#key ??= importEncryptionKey(decodeEncryptionKey(this.env));
    return this.#key;
  }
}

function isAuthError(error: unknown): boolean {
  return (
    error instanceof NotConnectedError ||
    error instanceof McpOAuthAuthorizationRequiredError ||
    error instanceof McpAuthRequiredError
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

/** Logs the error class and a bounded message; OAuth errors never carry tokens in their messages. */
function logFailure(step: string, error: unknown): void {
  console.error(
    JSON.stringify({
      raven: step,
      error: error instanceof Error ? error.name : 'unknown',
      detail: error instanceof Error ? error.message.slice(0, 300) : undefined,
    }),
  );
}
