import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  type SlashCommandBuilder,
} from 'discord.js';

import { DEFAULT_FLYFF_SERVER_ID } from '../services/flyffRanking/constants.js';
import {
  getConfig,
  type GuildHistoryRow,
  listGuildHistoryEvents,
  listWatchedGuilds,
  searchDiscoveredGuilds,
  unwatchGuild,
  watchGuild,
} from '../services/flyffRanking/store.js';

const FOOTER_TEXT = 'Flyff Guild Watcher';

const HISTORY_PAGE_SIZE = 10;
const HISTORY_BTN_PREV = 'guild_history_prev';
const HISTORY_BTN_NEXT = 'guild_history_next';
const DISCORD_CHOICE_NAME_MAX = 100;
const INVISIBLE_NAME_CHARS = /[\s\u115f\u1160\u3164\uffa0\u200b-\u200d\ufeff]/gu;

function fmtGuild(x: string | null) {
  return x ?? 'なし';
}

function classifyGuild(before: string | null, after: string | null) {
  if (!before && after) return { emoji: '✅', label: '加入', color: 0x57f287 };
  if (before && !after) return { emoji: '🚪', label: '脱退', color: 0xed4245 };
  if (before && after && before !== after)
    return { emoji: '🔁', label: '移籍', color: 0x5865f2 };
  return { emoji: '📝', label: '更新', color: 0x2b2d31 };
}

function joinAndTrimLines(lines: string[], max = 1024) {
  let out = '';
  for (const line of lines) {
    const next = out ? out + '\n' + line : line;
    if (next.length > max) {
      out = out ? out + '\n…（以下省略）' : '…（以下省略）';
      break;
    }
    out = next;
  }
  return out || '（なし）';
}

function toAutocompleteChoice(name: string) {
  const value = name.trim();
  if (!value) return null;

  const visible = value.replace(INVISIBLE_NAME_CHARS, '');
  if (!visible) return null;

  return {
    name: Array.from(value).slice(0, DISCORD_CHOICE_NAME_MAX).join(''),
    value,
  };
}

function buildHistoryRow(page: number, totalPages: number, disabled = false) {
  const prevDisabled = disabled || page <= 0;
  const nextDisabled = disabled || page >= totalPages - 1;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(HISTORY_BTN_PREV)
      .setLabel('⬅️ 前へ')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(prevDisabled),
    new ButtonBuilder()
      .setCustomId(HISTORY_BTN_NEXT)
      .setLabel('次へ ➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(nextDisabled),
  );
}

function buildHistoryEmbedForPage(args: {
  page: number;
  name: string;
  serverId: number;
  events: GuildHistoryRow[];
}) {
  const { page, name, serverId, events } = args;

  const totalPages = Math.max(1, Math.ceil(events.length / HISTORY_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);

  const slice = events.slice(
    safePage * HISTORY_PAGE_SIZE,
    safePage * HISTORY_PAGE_SIZE + HISTORY_PAGE_SIZE,
  );

  const guildLines: string[] = [];
  const renameLines: string[] = [];

  for (const e of slice) {
    const ts = Math.floor(e.createdAt.getTime() / 1000);

    if (e.eventType === 'guild') {
      const user = e.username ?? '不明なプレイヤー';
      const before = e.beforeValue ?? null;
      const after = e.afterValue ?? null;

      const meta = classifyGuild(before, after);

      const extra: string[] = [];
      if (e.rank != null) extra.push(`#${e.rank}`);
      if (e.level != null) extra.push(`Lv.${e.level}`);
      if (e.job) extra.push(e.job);
      const suffix = extra.length ? `（${extra.join(' / ')}）` : '';

      guildLines.push(
        `• <t:${ts}:R> ${meta.emoji} **${user}**：${meta.label}（${fmtGuild(before)} → ${fmtGuild(after)}） ${suffix}`.trim(),
      );
      continue;
    }

    // rename / suspected-rename
    const beforeN = e.beforeName ?? '??';
    const afterN = e.afterName ?? '??';
    const isSuspected = e.eventType === 'suspected-rename';
    const score = e.score ?? 0;

    let reasons: string[] = [];
    try {
      reasons = e.reasonJson ? JSON.parse(e.reasonJson) : [];
    } catch {
      /* empty */
    }

    const reasonText = reasons.length ? `根拠：${reasons.join(', ')}` : '';
    const kind = isSuspected ? '⚠️' : '📝';
    const line =
      `• <t:${ts}:R> ${kind} **${beforeN}** → **${afterN}**` +
      (isSuspected ? `（score=${score}）` : '') +
      (reasonText ? `｜${reasonText}` : '');

    // 一行太长会很难看，轻微收敛
    renameLines.push(line.slice(0, 350));
  }

  // 这一页的主色：有 rename -> 黄；否则取第一条 guild 的语义色；没有 guild -> 灰
  const hasRename = slice.some((e) => e.eventType !== 'guild');
  const firstGuild = slice.find((e) => e.eventType === 'guild');
  const color = hasRename
    ? 0xfee75c
    : firstGuild
      ? classifyGuild(firstGuild.beforeValue ?? null, firstGuild.afterValue ?? null).color
      : 0x2b2d31;

  const embed = new EmbedBuilder()
    .setTitle(`🕘 履歴：${name}`)
    .setDescription(
      `server=${serverId}｜合計 ${events.length} 件｜ページ ${safePage + 1}/${totalPages}（${HISTORY_PAGE_SIZE}件/ページ）`,
    )
    .addFields(
      { name: '🏰 ギルド変動', value: joinAndTrimLines(guildLines, 1024) },
      { name: '⚠️ 改名の可能性', value: joinAndTrimLines(renameLines, 1024) },
    )
    .setColor(color)
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();

  return { embed, safePage, totalPages };
}

@ApplyOptions<Subcommand.Options>({
  name: 'guild',
  description: 'フリフギルド監視管理',
  subcommands: [
    { name: 'watch', chatInputRun: 'chatInputWatch' },
    { name: 'unwatch', chatInputRun: 'chatInputUnwatch' },
    { name: 'list', chatInputRun: 'chatInputList' },
    { name: 'history', chatInputRun: 'chatInputHistory' },
  ],
})
export class GuildCommand extends Subcommand {
  public override registerApplicationCommands(registry: Subcommand.Registry) {
    const devGuildId = process.env.DEV_GUILD_ID;
    const isProd = process.env.NODE_ENV === 'production';

    const command = (builder: SlashCommandBuilder) =>
      builder
        .setName('guild')
        .setDescription('Flyffギルドをフォロー／解除する')
        .addSubcommand((sc) =>
          sc
            .setName('watch')
            .setDescription('ギルドをフォローする')
            .addStringOption((o) =>
              o
                .setName('name')
                .setDescription('ギルド名')
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((sc) =>
          sc
            .setName('unwatch')
            .setDescription('ギルドのフォローを解除する')
            .addStringOption((o) =>
              o
                .setName('name')
                .setDescription('ギルド名')
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((sc) =>
          sc.setName('list').setDescription('フォロー中のギルド一覧を表示'),
        )
        .addSubcommand((sc) =>
          sc
            .setName('history')
            .setDescription('指定した Flyff ギルドの履歴を表示')
            .addStringOption((o) =>
              o
                .setName('name')
                .setDescription('ギルド名')
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addIntegerOption((o) =>
              o
                .setName('limit')
                .setDescription('表示件数（デフォルト20、最大50）')
                .setMinValue(1)
                .setMaxValue(50),
            ),
        );

    if (!isProd && devGuildId) {
      console.log('[register] registering GUILD commands to', devGuildId);
      registry.registerChatInputCommand(command, { guildIds: [devGuildId] });
    } else {
      console.log('[register] registering GLOBAL commands');
      registry.registerChatInputCommand(command);
    }
  }

  public async chatInputWatch(interaction: Subcommand.ChatInputCommandInteraction) {
    const discordGuildId = interaction.guildId!;
    const name = interaction.options.getString('name', true).trim();

    await watchGuild(discordGuildId, name);

    const embed = new EmbedBuilder()
      .setTitle('✅ フォロー完了')
      .setDescription('監視対象に追加しました。')
      .addFields(
        { name: 'ギルド', value: `**${name}**`, inline: true },
        { name: 'サーバー', value: discordGuildId, inline: true },
        { name: 'ヒント', value: '更新が見つかると通知します。' },
      )
      .setColor(0x57f287)
      .setFooter({ text: FOOTER_TEXT })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: ['Ephemeral'] });
  }

  public async chatInputUnwatch(interaction: Subcommand.ChatInputCommandInteraction) {
    const discordGuildId = interaction.guildId!;
    const name = interaction.options.getString('name', true).trim();

    await unwatchGuild(discordGuildId, name);

    const embed = new EmbedBuilder()
      .setTitle('🚫 フォロー解除')
      .setDescription('監視対象から削除しました。')
      .addFields(
        { name: 'ギルド', value: `**${name}**`, inline: true },
        { name: 'サーバー', value: discordGuildId, inline: true },
      )
      .setColor(0xed4245)
      .setFooter({ text: FOOTER_TEXT })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: ['Ephemeral'] });
  }

  public async chatInputList(interaction: Subcommand.ChatInputCommandInteraction) {
    const discordGuildId = interaction.guildId!;
    const list = await listWatchedGuilds(discordGuildId);

    if (!list.length) {
      const embed = new EmbedBuilder()
        .setTitle('📋 フォロー中のギルド')
        .setDescription('（フォロー中のギルドはありません）')
        .setColor(0x2b2d31)
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: ['Ephemeral'] });
      return;
    }

    const body = joinAndTrimLines(
      list.map((x) => `• ${x}`),
      1024,
    );

    const embed = new EmbedBuilder()
      .setTitle('📋 フォロー中のギルド')
      .addFields({ name: `一覧（${list.length}件）`, value: body })
      .setColor(0x5865f2)
      .setFooter({ text: FOOTER_TEXT })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  public async chatInputHistory(interaction: Subcommand.ChatInputCommandInteraction) {
    const discordGuildId = interaction.guildId!;
    const name = interaction.options.getString('name', true);
    const limit = Math.min(interaction.options.getInteger('limit') ?? 20, 50);

    await interaction.deferReply();

    const cfg = await getConfig(discordGuildId);
    const serverId = cfg.flyffServerId ?? DEFAULT_FLYFF_SERVER_ID;

    const events = await listGuildHistoryEvents({
      flyffServerId: cfg.flyffServerId ?? DEFAULT_FLYFF_SERVER_ID,
      guildName: name,
      limit,
    });

    if (!events.length) {
      const embed = new EmbedBuilder()
        .setTitle('🕘 ギルド履歴')
        .setDescription(`**${name}** の履歴は見つかりませんでした。`)
        .addFields({ name: 'server', value: String(serverId), inline: true })
        .setColor(0x2b2d31)
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    let page = 0;

    const first = buildHistoryEmbedForPage({ page, name, serverId, events });

    await interaction.editReply({
      embeds: [first.embed],
      components:
        first.totalPages > 1 ? [buildHistoryRow(first.safePage, first.totalPages)] : [],
    });

    if (first.totalPages <= 1) return;

    const msg = await interaction.fetchReply();

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on('collect', async (btn) => {
      try {
        if (btn.customId === HISTORY_BTN_PREV) page -= 1;
        if (btn.customId === HISTORY_BTN_NEXT) page += 1;

        const next = buildHistoryEmbedForPage({ page, name, serverId, events });
        page = next.safePage;

        await btn.update({
          embeds: [next.embed],
          components: [buildHistoryRow(page, next.totalPages)],
        });
      } catch {
        if (!btn.replied && !btn.deferred) {
          await btn.deferUpdate().catch(() => {});
        }
      }
    });

    collector.on('end', async () => {
      const cur = buildHistoryEmbedForPage({ page, name, serverId, events });
      await interaction
        .editReply({
          embeds: [cur.embed],
          components: [buildHistoryRow(cur.safePage, cur.totalPages, true)],
        })
        .catch(() => {});
    });
  }

  public override async autocompleteRun(interaction: Subcommand.AutocompleteInteraction) {
    // 只对 name 这个 option 做补全
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'name') {
      await interaction.respond([]);
      return;
    }

    // 只在这些子命令启用补全（避免以后扩展时误触发）
    const sub = interaction.options.getSubcommand();
    if (sub !== 'watch' && sub !== 'unwatch' && sub !== 'history') {
      await interaction.respond([]);
      return;
    }

    const q = String(focused.value ?? '').trim();

    // 根据当前 Discord guild 的配置拿 flyffServerId（你现有逻辑）
    const discordGuildId = interaction.guildId!;
    const cfg = await getConfig(discordGuildId);
    const flyffServerId = cfg.flyffServerId ?? DEFAULT_FLYFF_SERVER_ID;

    const items = await searchDiscoveredGuilds(flyffServerId, q, 25);

    await interaction.respond(items.map(toAutocompleteChoice).filter((x) => x !== null));
  }
}
