import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SapphireClient } from '@sapphire/framework';
import { GatewayIntentBits, Partials } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class HoshikuzuClient extends SapphireClient {
  public constructor() {
    const isProd = process.env.NODE_ENV === 'production';
    console.log(`Starting in ${isProd ? 'production' : 'development'} mode`);

    super({
      // 假设这个文件在 src/bot/client.ts，那么 baseUserDirectory 指向 src
      baseUserDirectory: join(__dirname, '..'),
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
