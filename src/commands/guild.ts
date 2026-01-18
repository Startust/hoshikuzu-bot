import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';

import {
  listWatchedGuilds,
  unwatchGuild,
  watchGuild,
} from '../services/flyffRanking/store.js';

@ApplyOptions<Subcommand.Options>({
  name: 'guild',
  description: 'Manage watched Flyff guilds',
  subcommands: [
    {
      name: 'watch',
      chatInputRun: 'chatInputWatch',
    },
    {
      name: 'unwatch',
      chatInputRun: 'chatInputUnwatch',
    },
    {
      name: 'list',
      chatInputRun: 'chatInputList',
    },
  ],
})
export class GuildCommand extends Subcommand {
  public override registerApplicationCommands(registry: Subcommand.Registry) {
    registry.registerChatInputCommand(
      (builder) =>
        builder
          .setName('guild')
          .setDescription('关注/取消关注 Flyff 公会')
          .addSubcommand((sc) =>
            sc
              .setName('watch')
              .setDescription('关注一个公会')
              .addStringOption((o) =>
                o.setName('name').setDescription('公会名').setRequired(true),
              ),
          )
          .addSubcommand((sc) =>
            sc
              .setName('unwatch')
              .setDescription('取消关注一个公会')
              .addStringOption((o) =>
                o.setName('name').setDescription('公会名').setRequired(true),
              ),
          )
          .addSubcommand((sc) => sc.setName('list').setDescription('查看已关注公会')),
      {
        guildIds: [process.env.DEV_GUILD_ID!],
      },
    );
  }

  public async chatInputWatch(interaction: Subcommand.ChatInputCommandInteraction) {
    const discordGuildId = interaction.guildId!;
    const name = interaction.options.getString('name', true).trim();
    await watchGuild(discordGuildId, name);
    await interaction.reply(`✅ 已关注公会：**${name}**`);
  }

  public async chatInputUnwatch(interaction: Subcommand.ChatInputCommandInteraction) {
    const discordGuildId = interaction.guildId!;
    const name = interaction.options.getString('name', true).trim();
    await unwatchGuild(discordGuildId, name);
    await interaction.reply(`✅ 已取消关注：**${name}**`);
  }

  public async chatInputList(interaction: Subcommand.ChatInputCommandInteraction) {
    const discordGuildId = interaction.guildId!;
    const list = await listWatchedGuilds(discordGuildId);
    if (!list.length) {
      await interaction.reply('（暂无关注公会）');
      return;
    }
    await interaction.reply(`当前关注公会：\n${list.map((x) => `- ${x}`).join('\n')}`);
  }
}
