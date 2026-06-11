import { ApplyOptions } from '@sapphire/decorators';
import type { Command } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type SlashCommandBuilder,
  type TextChannel,
} from 'discord.js';

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
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: 'このコマンドを実行するにはサーバー管理権限が必要です。',
        flags: ['Ephemeral'],
      });
      return;
    }

    const ch = interaction.options.getChannel('target', true);
    const discordGuildId = interaction.guildId!;

    await upsertConfig({ discordGuildId, notifyChannelId: ch.id });

    // ===== 1️⃣ 给操作者的 Ephemeral 确认 =====
    const confirmEmbed = new EmbedBuilder()
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

    await interaction.reply({ embeds: [confirmEmbed], flags: ['Ephemeral'] });

    // ===== 2️⃣ 向目标频道发送通知 =====
    if (ch.type === ChannelType.GuildText) {
      const notifyEmbed = new EmbedBuilder()
        .setTitle('📢 通知チャンネルが設定されました')
        .setDescription(
          `このチャンネルは **Flyff Ranking Watcher** の通知先として設定されました。\n\n今後、公会・ランキング更新がここに送信されます。`,
        )
        .setFooter({ text: 'Flyff Ranking Watcher' })
        .setTimestamp(new Date())
        .setColor(0x5865f2);

      try {
        await (ch as TextChannel).send({ embeds: [notifyEmbed] });
      } catch (err) {
        // ⚠️ 不影响主流程，只记录
        console.warn(`[notifyChannel] failed to send message to ${ch.id}`, err);
      }
    }
  }
}
