import { join } from 'node:path';

import { SapphireClient } from '@sapphire/framework';
import { GatewayIntentBits, Partials } from 'discord.js';

export class HoshikuzuClient extends SapphireClient {
  public constructor() {
    const isProd = process.env.NODE_ENV === 'production';

    super({
      baseUserDirectory: join(process.cwd(), isProd ? 'dist' : 'src'),
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
      loadMessageCommandListeners: true,
    });
  }
}
