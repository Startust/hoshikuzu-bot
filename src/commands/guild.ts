import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';
import type { SlashCommandBuilder } from 'discord.js';

import {
  getConfig,
  listGuildHistoryEvents,
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
    {
      name: 'history',
      chatInputRun: 'chatInputHistory',
    },
  ],
})
export class GuildCommand extends Subcommand {
  public override registerApplicationCommands(registry: Subcommand.Registry) {
    const devGuildId = process.env.DEV_GUILD_ID;
    const isProd = process.env.NODE_ENV === 'production';

    const command = (builder: SlashCommandBuilder) =>
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
        .addSubcommand((sc) => sc.setName('list').setDescription('查看已关注公会'))
        .addSubcommand((sc) =>
          sc
            .setName('history')
            .setDescription('查看某个 Flyff 公会的历史变动记录')
            .addStringOption((o) =>
              o.setName('name').setDescription('公会名').setRequired(true),
            )
            .addIntegerOption((o) =>
              o
                .setName('limit')
                .setDescription('返回条数（默认 20，最大 50）')
                .setMinValue(1)
                .setMaxValue(50),
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

  public async chatInputHistory(interaction: Subcommand.ChatInputCommandInteraction) {
    const discordGuildId = interaction.guildId!;
    const name = interaction.options.getString('name', true);
    const limit = Math.min(interaction.options.getInteger('limit') ?? 20, 50);

    await interaction.deferReply(); // 数据库查询，稳一点

    const cfg = await getConfig(discordGuildId);
    const serverId = cfg.flyffServerId ?? 23;

    const events = await listGuildHistoryEvents({
      flyffServerId: cfg.flyffServerId ?? 23,
      guildName: name,
      limit: limit,
    });

    const lines = events.map((e) => {
      const ts = Math.floor(e.createdAt.getTime() / 1000);

      if (e.eventType === 'guild') {
        const user = e.username ?? '未知玩家';
        const before = e.beforeValue ?? '无';
        const after = e.afterValue ?? '无';

        const extra: string[] = [];
        if (e.rank != null) extra.push(`#${e.rank}`);
        if (e.level != null) extra.push(`Lv.${e.level}`);
        if (e.job) extra.push(e.job);

        const suffix = extra.length ? `（${extra.join(' / ')}）` : '';
        return `• <t:${ts}:R> 🏰 **${user}**：${before} → ${after} ${suffix}`;
      }

      // suspected-rename
      const beforeN = e.beforeName ?? '??';
      const afterN = e.afterName ?? '??';
      const score = e.score ?? 0;

      let reasons: string[] = [];
      try {
        reasons = e.reasonJson ? JSON.parse(e.reasonJson) : [];
      } catch {
        /* empty */
      }

      const reasonText = reasons.length ? `（${reasons.join(',')}）` : '';
      return `• <t:${ts}:R> ⚠️ 疑似改名：**${beforeN}** → **${afterN}** score=${score} ${reasonText}`;
    });

    // 防止超长消息
    const header = `【${name} 历史记录】server=${serverId}（最近 ${events.length} 条）\n`;
    let body = '';
    for (const line of lines) {
      if ((header + body + line + '\n').length > 1900) break;
      body += line + '\n';
    }

    await interaction.editReply(header + body);
  }
}
