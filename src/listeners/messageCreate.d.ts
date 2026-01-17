import { Listener } from '@sapphire/framework';
import type { Message } from 'discord.js';
export declare class MessageCreateListener extends Listener {
    constructor(context: Listener.LoaderContext, options: Listener.Options);
    run(message: Message): Promise<void>;
}
//# sourceMappingURL=messageCreate.d.ts.map