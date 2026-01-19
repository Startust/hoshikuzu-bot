import type { SapphireClient } from '@sapphire/framework';

import { isGuildAllowed } from './guildAllowList.js';

export async function enforceAllowlist(client: SapphireClient, logger: Console) {
  for (const [, guild] of client.guilds.cache) {
    const allowed = await isGuildAllowed(guild.id);
    if (allowed) continue;

    logger.warn(`[allowlist] Startup cleanup: leaving ${guild.id} (${guild.name})`);

    try {
      await guild.leave();
    } catch (e) {
      logger.error(e);
    }
  }
}
