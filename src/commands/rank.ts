import { ApplyOptions } from '@sapphire/decorators';
import type { Command } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { ChannelType } from 'discord.js';

import { fetchAllPlayers } from '../services/flyffRanking/scrape.js';
import { getConfig, upsertConfig } from '../services/flyffRanking/store.js';

@ApplyOptions<Command.Options>({
  name: 'rank',
  description: 'Flyff 排行榜监控',
})
export class RankCommand extends Subcommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(
      (builder) =>
        builder
          .setName('rank')
          .setDescription('Flyff 排行榜监控')
          .addSubcommand((sc) =>
            sc
              .setName('channel')
              .setDescription('设置推送频道')
              .addChannelOption((o) =>
                o
                  .setName('target')
                  .setDescription('推送到哪个频道')
                  .addChannelTypes(ChannelType.GuildText)
                  .setRequired(true),
              ),
          )
          .addSubcommand((sc) =>
            sc.setName('now').setDescription('立刻抓取一次（调试用）'),
          ),
      {
        guildIds: [process.env.DEV_GUILD_ID!],
      },
    );
  }

  public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand(true);
    const discordGuildId = interaction.guildId!;

    if (sub === 'channel') {
      const ch = interaction.options.getChannel('target', true);
      await upsertConfig({ discordGuildId, notifyChannelId: ch.id });
      await interaction.reply(`✅ 已设置推送频道：<#${ch.id}>`);
      return;
    }

    if (sub === 'now') {
      const config = await getConfig(discordGuildId);
      await interaction.deferReply({ ephemeral: true });

      const players = await fetchAllPlayers(config.flyffServerId);
      const preview = players
        .slice(0, 5)
        .map(
          (p) =>
            `#${p.rank ?? '?'} ${p.username} | lv=${p.level ?? '?'} | job=${p.job ?? '?'} | guild=${p.flyffGuildName ?? '无'}`,
        );

      await interaction.editReply(
        `抓取成功：共 ${players.length} 条。\n` +
          preview.join('\n') +
          `\n\n（如果这里全是空，说明解析 selector 需要校准）`,
      );
      return;
    }
  }
}
