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
  client.once('clientReady', () => {
    console.log(`Ready! Logged in as ${client.user?.tag}`);
    console.log('NODE_ENV', process.env.NODE_ENV);
    console.log('Loaded command keys:', [...client.stores.get('commands').keys()]);
    console.log('Listeners loaded:', client.stores.get('listeners')?.size);
    startFlyffPoller(client);
  });

  client.on('applicationCommandRegistriesRegistered', async () => {
    const { REST, Routes } = await import('discord.js');
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

    const cmds = (await rest.get(
      Routes.applicationGuildCommands(process.env.CLIENT_ID!, process.env.DEV_GUILD_ID!),
    )) as any[];

    console.log(
      'Guild commands now:',
      cmds.map((c) => `${c.name}(${c.id})`),
    );
  });

  client.on('applicationCommandRegistriesSkipped', (...args) => {
    console.log('[ACR SKIPPED]', ...args);
  });

  client.on('applicationCommandRegistriesError', (...args) => {
    console.error('[ACR ERROR]', ...args);
  });

  await client.login(token);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
