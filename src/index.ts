import 'dotenv/config';
import '@sapphire/plugin-subcommands/register';

import { HoshikuzuClient } from './bot/client';
import { startFlyffPoller } from './bot/flyff-poller';

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error('DISCORD_TOKEN is missing');

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY');
}

async function main() {
  const client = new HoshikuzuClient();
  client.once('clientReady', () => {
    console.log(`Ready! Logged in as ${client.user?.tag}`);
    console.log('NODE_ENV', process.env.NODE_ENV);
    console.log('Loaded command keys:', [...client.stores.get('commands').keys()]);
    console.log('Listeners loaded:', client.stores.get('listeners')?.size);
    startFlyffPoller(client);
  });

  await client.login(token);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
