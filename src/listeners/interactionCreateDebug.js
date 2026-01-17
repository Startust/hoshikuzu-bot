import { Listener } from '@sapphire/framework';
export class InteractionCreateDebugListener extends Listener {
    constructor(ctx, options) {
        super(ctx, { ...options, event: 'interactionCreate' });
    }
    run(interaction) {
        if (interaction.isChatInputCommand()) {
            console.log('[interactionCreate]', interaction.commandName, 'guild=', interaction.guildId);
        }
    }
}
//# sourceMappingURL=interactionCreateDebug.js.map