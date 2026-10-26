(() => {
  const localPreview = ['127.0.0.1', 'localhost'].includes(location.hostname) && location.port === '8765';
  const base = localPreview ? 'http://127.0.0.1:8878/api/agent' : '/api/agent';
  const terminal = event => ['settled', 'error', 'interrupted'].includes(event.type);

  function createClient() {
    let conversation = null;
    let active = null;
    let generation = 0;
    let history = [];

    async function post(path, body = {}) {
      let response;
      try {
        response = await fetch(base + path, {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new Error('Live chat is unavailable. Check your connection and try again.');
      }
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const wait = data?.error?.retryAfterSeconds;
        throw new Error((data?.error?.message || 'Live chat is unavailable. Please try again.') +
          (wait ? ` Try again in ${Math.ceil(wait / 60)} minutes.` : ''));
      }
      if (!data) throw new Error('Live chat returned an invalid response. Please try again.');
      return data;
    }

    function abort(run) {
      if (run.id && run.conversation) {
        post(`/conversations/${run.conversation}/runs/${run.id}/abort`).catch(() => {});
      }
    }

    async function send(text, onEvent) {
      if (active) throw new Error('Wait for the current answer or stop it first.');
      const run = {generation, cancelled: false, finish: null, id: null, conversation: null, answer: ''};
      active = run;
      try {
        if (!conversation) {
          const created = await post('/conversations');
          if (run.cancelled || run.generation !== generation) return;
          conversation = created.conversationId;
        }
        run.conversation = conversation;
        if (run.cancelled || run.generation !== generation) return;
        const admitted = await post(`/conversations/${conversation}/messages`, {
          messageId: crypto.randomUUID(), text, history, researchOnly: true,
        });
        run.id = admitted.runId;
        if (run.cancelled || run.generation !== generation) { abort(run); return; }
        if (!run.id) throw new Error('Live chat could not start an answer. Please try again.');
        await new Promise(resolve => {
          let finished = false;
          let lastId = admitted.afterEventId;
          const events = new EventSource(base + `/conversations/${run.conversation}/runs/${run.id}/events?after=${lastId}`);
          const finish = event => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            events.close();
            if (event?.type === 'settled' && run.generation === generation && run.answer) {
              history.push({role: 'user', text}, {role: 'assistant', text: run.answer.slice(0, 12_000)});
              while (history.length > 12 || history.reduce((sum, message) => sum + message.text.length, 0) > 48_000) history.splice(0, 2);
            }
            if (event && run.generation === generation) onEvent(event);
            resolve();
          };
          const timer = setTimeout(() => {
            abort(run);
            finish({type: 'error', message: 'The answer took too long. Please try again.'});
          }, 105_000);
          run.finish = finish;
          events.onmessage = message => {
            if (finished || run.generation !== generation) return;
            const id = Number(message.lastEventId);
            if (Number.isFinite(id) && id <= lastId) return;
            if (Number.isFinite(id)) lastId = id;
            let event;
            try { event = JSON.parse(message.data); }
            catch { finish({type: 'error', message: 'The answer stream was interrupted. Please try again.'}); return; }
            if (event.type === 'text_delta') run.answer += event.delta;
            if (terminal(event)) finish(event);
            else onEvent(event);
          };
          events.onerror = () => {
            if (events.readyState === EventSource.CLOSED) {
              finish({type: 'error', message: 'Lost the connection to live chat. Please try again.'});
            }
          };
        });
      } finally {
        if (active === run) active = null;
      }
    }

    function stop() {
      if (!active) return;
      active.cancelled = true;
      abort(active);
      active.finish?.({type: 'interrupted', reason: 'stopped'});
    }

    function reset() {
      stop();
      generation += 1;
      conversation = null;
      active = null;
      history = [];
    }

    async function network() {
      try {
        const response = await fetch(base.replace('/api/agent', '/api/health'), {signal: AbortSignal.timeout(5_000)});
        const status = response.ok ? await response.json() : null;
        return ['mainnet', 'testnet'].includes(status?.network) ? status.network : null;
      } catch { return null; }
    }

    return {send, stop, reset, network};
  }

  window.NestLiveChat = {createClient};
})();
