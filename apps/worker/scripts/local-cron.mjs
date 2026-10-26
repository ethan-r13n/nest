// Local development only: deployed Workers get their one-minute cron from Cloudflare. This calls
// the dev server's scheduled route once a minute so automations run while `pnpm dev` is up.
// Usage: pnpm --filter @nest/worker cron:local [http://localhost:5173]
const base = process.argv[2] ?? process.env.NEST_DEV_URL ?? 'http://localhost:5173';
const url = `${base}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent('* * * * *')}`;

async function tick() {
  try {
    const response = await fetch(url);
    console.log(`${new Date().toISOString()} scheduled → ${response.status}`);
  } catch (error) {
    console.error(`${new Date().toISOString()} ${base} is not reachable: ${error.message}`);
  }
}

await tick();
setInterval(tick, 60_000);
