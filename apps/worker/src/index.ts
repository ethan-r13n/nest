import { AgentAdmission } from './agent/admission.ts';
import { ConversationAgent } from './agent/conversation.ts';
import { createApp } from './app.ts';
import { automationDeps, runAutomations } from './automations/dispatch.ts';
import { recoverPendingPlans } from './execution/recovery.ts';
import { executionDeps } from './execution/store.ts';
import { RavenConnection } from './raven/connection.ts';

const app = createApp();

export { AgentAdmission, ConversationAgent, RavenConnection };

export default {
  fetch: app.fetch,
  /** Cron wakes the dispatcher about once a minute; due rules and leases live in D1, not here. */
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      recoverPendingPlans(executionDeps(env)).then(
        (summary) => console.log(JSON.stringify({ recovery: 'tick', ...summary })),
        (error: unknown) =>
          console.error(
            JSON.stringify({ recovery: 'tick_failed', error: error instanceof Error ? error.name : 'unknown' }),
          ),
      ),
    );
    ctx.waitUntil(
      runAutomations(automationDeps(env)).then(
        (summary) => console.log(JSON.stringify({ automation: 'tick', ...summary })),
        (error: unknown) =>
          console.error(
            JSON.stringify({ automation: 'tick_failed', error: error instanceof Error ? error.message : 'unknown' }),
          ),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
