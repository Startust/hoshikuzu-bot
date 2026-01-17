import { Listener } from '@sapphire/framework';
import type { Interaction } from 'discord.js';

export class InteractionCreateDebugListener extends Listener {
  public constructor(ctx: Listener.LoaderContext, options: Listener.Options) {
    super(ctx, { ...options, event: 'interactionCreate' });
  }

  public run(interaction: Interaction) {
    if (interaction.isChatInputCommand()) {
      console.log(
        '[interactionCreate]',
        interaction.commandName,
        'guild=',
        interaction.guildId,
      );
    }
  }
}
