import { REST, Routes } from 'discord.js';

type Scope = 'guild' | 'global' | 'both';

export async function autoClearCommands(scope: Scope) {
  const token = process.env.DISCORD_TOKEN;
  const appId = process.env.CLIENT_ID; // 你的 application id
  const devGuildId = process.env.DEV_GUILD_ID;

  if (!token) throw new Error('DISCORD_TOKEN is missing');
  if (!appId) throw new Error('CLIENT_ID is missing');

  const rest = new REST({ version: '10' }).setToken(token);

  const clearGlobal = async () => {
    await rest.put(Routes.applicationCommands(appId), { body: [] });
    console.log('[commands] cleared GLOBAL');
  };

  const clearGuild = async () => {
    if (!devGuildId) {
      console.log('[commands] DEV_GUILD_ID missing, skip guild clear');
      return;
    }
    await rest.put(Routes.applicationGuildCommands(appId, devGuildId), { body: [] });
    console.log('[commands] cleared GUILD', devGuildId);
  };

  if (scope === 'global') return clearGlobal();
  if (scope === 'guild') return clearGuild();

  // both
  await clearGuild();
  await clearGlobal();
}
