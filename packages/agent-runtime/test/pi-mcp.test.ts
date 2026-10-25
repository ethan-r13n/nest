import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const RAVEN_MCP_URL = 'https://raven.stellar.org/mcp';

describe('pi-mcp in workerd', () => {
  it('imports the client and the Streamable HTTP transport', async () => {
    const { McpClient, StreamableHttpTransport } = await import('@earendil-works/pi-mcp');
    const client = new McpClient({ name: 'nest', version: '0.0.0' });
    const transport = new StreamableHttpTransport({ url: RAVEN_MCP_URL, openGetStream: false });
    expect(client).toBeDefined();
    expect(transport).toBeDefined();
  });

  it.skipIf(env.NEST_LIVE_RAVEN !== '1')('reaches Raven and is asked to authenticate', async () => {
    const { McpAuthRequiredError, McpClient, McpHttpError, StreamableHttpTransport } = await import(
      '@earendil-works/pi-mcp'
    );
    const client = new McpClient({ name: 'nest', version: '0.0.0', requestTimeoutMs: 15_000 });
    const transport = new StreamableHttpTransport({ url: RAVEN_MCP_URL, openGetStream: false });
    const error = await client.connect(transport).then(
      () => null,
      (reason: unknown) => reason,
    );
    console.log(JSON.stringify({ raven: error === null ? 'connected' : String(error).slice(0, 200) }));
    expect(error instanceof McpAuthRequiredError || (error instanceof McpHttpError && error.status === 401)).toBe(true);
    await client.close();
  });
});
