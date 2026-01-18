import { Command } from '@sapphire/framework';

export class PingCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((b) => b.setName('ping').setDescription('ping'), {
      guildIds: [process.env.DEV_GUILD_ID!],
    });
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    return interaction.reply('pong');
  }
}
