import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../live-chat.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(customFetch) {
  const requests = [], streams = [];
  let conversations = 0;
  class Events {
    static CLOSED = 2;
    readyState = 1;
    constructor(url) { this.url = url; streams.push(this); }
    close() { this.readyState = 2; }
    emit(id, event) { this.onmessage({lastEventId: String(id), data: JSON.stringify(event)}); }
  }
  const scope = {
    window: {}, location: {hostname: '127.0.0.1', port: '8765'},
    crypto: {randomUUID: () => 'message-id'}, AbortSignal, setTimeout, clearTimeout, EventSource: Events,
    fetch: async (url, options) => {
      requests.push({url, options});
      if (customFetch) {
        const response = customFetch(url, options);
        if (response) return response;
      }
      const data = url.endsWith('/conversations') ? {conversationId: `conversation-${++conversations}`} :
        {runId: 'run', afterEventId: 0};
      return {ok: true, json: async () => data};
    },
  };
  vm.runInNewContext(source, scope);
  return {client: scope.window.NestLiveChat.createClient(), requests, streams};
}

async function main() {
  {
    const {client, requests, streams} = harness();
    const events = [];
    const first = client.send('Allocate 10000 USDC for 30 days', event => events.push(event));
    await tick();
    streams[0].emit(1, {type: 'text_delta', delta: 'Answer'});
    streams[0].emit(1, {type: 'text_delta', delta: 'Answer'});
    streams[0].emit(2, {type: 'settled'});
    await first;
    assert.equal(events.filter(event => event.type === 'text_delta').length, 1);
    const followup = client.send('Compare', () => {});
    await tick();
    streams[1].emit(1, {type: 'settled'});
    await followup;
    assert.equal(requests.filter(request => request.url.endsWith('/conversations')).length, 1);
    assert(requests.filter(request => request.url.endsWith('/messages')).every(request => request.url.includes('conversation-1/')));
    const posted = requests.filter(request => request.url.endsWith('/messages')).map(request => JSON.parse(request.options.body));
    assert.equal(posted[0].researchOnly, true);
    assert.equal(posted[1].history[0].text, 'Allocate 10000 USDC for 30 days');
    assert.equal(posted[1].history[1].text, 'Answer');
  }
  {
    const {client, requests, streams} = harness();
    const events = [];
    const pending = client.send('Research', event => events.push(event));
    await tick();
    client.stop();
    await pending;
    assert.equal(streams[0].readyState, 2);
    assert.equal(events.at(-1).reason, 'stopped');
    assert(requests.some(request => request.url.endsWith('/abort')));
  }
  {
    let release;
    let starts = 0;
    const {client, requests, streams} = harness(url => {
      if (url.endsWith('/conversations') && ++starts === 1) {
        return new Promise(resolve => { release = resolve; });
      }
    });
    const old = client.send('Old draft', () => { throw new Error('Old events must not reach the new conversation'); });
    await tick();
    client.reset();
    release({ok: true, json: async () => ({conversationId: 'discarded-conversation'})});
    await old;
    const fresh = client.send('New question', () => {});
    await tick();
    streams[0].emit(1, {type: 'settled'});
    await fresh;
    assert.equal(requests.filter(request => request.url.endsWith('/messages')).length, 1);
    assert(!requests.some(request => request.url.includes('discarded-conversation/')));
  }
  {
    const {client} = harness(() => Promise.reject(new Error('offline')));
    await assert.rejects(client.send('Question', () => {}), /Live chat is unavailable/);
  }
  console.log('Live chat: context, stream deduplication, Stop, reset race and offline errors passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
