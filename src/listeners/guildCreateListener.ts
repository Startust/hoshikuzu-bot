import { Listener } from '@sapphire/framework';
import type { Guild } from 'discord.js';

import { isGuildAllowed } from '../services/guildAllowList';

export class GuildCreateListener extends Listener {
  public constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, { ...options, event: 'guildCreate' });
  }

  public async run(guild: Guild) {
    const allowed = await isGuildAllowed(guild.id);
    if (allowed) return;

    this.container.logger.warn(
      `[allowlist] Joined non-allowed guild ${guild.id} (${guild.name}). Leaving...`,
    );

    // 可选：尝试给系统频道发一句说明（可能没权限/没频道）
    try {
      const ch = guild.systemChannel;
      if (ch) await ch.send('This bot is not authorized for this server. Leaving.');
    } catch {
      /* empty */
    }

    try {
      await guild.leave();
    } catch (e) {
      this.container.logger.error(e);
    }
  }
}
