import { ApplyOptions } from '@sapphire/decorators';
import type { Command } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { ChannelType, EmbedBuilder, type SlashCommandBuilder } from 'discord.js';

import { upsertConfig } from '../services/flyffRanking/store.js';

@ApplyOptions<Subcommand.Options>({
  name: 'rank',
  description: 'フリフランキング監視',
  subcommands: [{ name: 'channel', chatInputRun: 'chatInputChannel' }],
})
export class RankCommand extends Subcommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    const devGuildId = process.env.DEV_GUILD_ID;
    const isProd = process.env.NODE_ENV === 'production';

    const command = (builder: SlashCommandBuilder) =>
      builder
        .setName('rank')
        .setDescription('Flyffランキング監視')
        .addSubcommand((sc) =>
          sc
            .setName('channel')
            .setDescription('通知チャンネルを設定する')
            .addChannelOption((o) =>
              o
                .setName('target')
                .setDescription('通知を送信するチャンネル')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true),
            ),
        );

    if (!isProd && devGuildId) {
      console.log('[register] registering GUILD commands to', devGuildId);
      registry.registerChatInputCommand(command, { guildIds: [devGuildId] });
    } else {
      console.log('[register] registering GLOBAL commands');
      registry.registerChatInputCommand(command); // 不传 guildIds => 全局
    }
  }

  public async chatInputChannel(interaction: Command.ChatInputCommandInteraction) {
    const ch = interaction.options.getChannel('target', true);
    const discordGuildId = interaction.guildId!;

    await upsertConfig({ discordGuildId, notifyChannelId: ch.id });

    const embed = new EmbedBuilder()
      .setTitle('✅ 通知チャンネルを設定しました')
      .setDescription(`今後の更新通知は ${`<#${ch.id}>`} に送信されます。`)
      .addFields(
        { name: 'チャンネル', value: `<#${ch.id}>`, inline: true },
        {
          name: 'サーバー',
          value: String(interaction.guild?.name ?? discordGuildId),
          inline: true,
        },
      )
      .setFooter({ text: 'Flyff Ranking Watcher' })
      .setTimestamp(new Date())
      .setColor(0x57f287);

    await interaction.reply({ embeds: [embed], flags: ['Ephemeral'] });
  }
}
