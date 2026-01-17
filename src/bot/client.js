import { join } from 'node:path';
import { SapphireClient } from '@sapphire/framework';
import { GatewayIntentBits, Partials } from 'discord.js';
export class HoshikuzuClient extends SapphireClient {
    constructor() {
        super({
            baseUserDirectory: join(process.cwd(), 'src'),
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
//# sourceMappingURL=client.js.map