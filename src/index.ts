import 'dotenv/config';
import '@sapphire/plugin-subcommands/register';

import { HoshikuzuClient } from './bot/client.js';
import { startFlyffPoller } from './bot/flyff-poller.js';
import { initSchema } from './db/schema.js';

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error('DISCORD_TOKEN is missing');

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY');
}

async function main() {
  await initSchema();
  console.log('✅ DB schema initialized');

  const client = new HoshikuzuClient();
  client.once('ready', () => {
    console.log(`Ready! Logged in as ${client.user?.tag}`);
    startFlyffPoller(client);
  });

  await client.login(token);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
