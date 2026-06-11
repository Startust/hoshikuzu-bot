import type { SapphireClient } from '@sapphire/framework';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
} from 'discord.js';

import { DEFAULT_FLYFF_SERVER_ID } from '../services/flyffRanking/constants.js';
import {
  type Change,
  diffByPlayerId,
  filterChangesByWatched,
} from '../services/flyffRanking/diff.js';
import {
  fetchAllPlayers,
  type ScrapedPlayer,
} from '../services/flyffRanking/scrape.js';
import {
  listAllConfigs, // 新增：返回所有有配置的 guild（哪怕没 enabled）
  listWatchedGuilds,
  loadSnapshot,
  persistChangesAndSnapshot,
  upsertDiscoveredGuilds,
} from '../services/flyffRanking/store.js';
import { listPronunciationUrls } from '../services/playerNamePronunciation.js';

const runningServer = new Set<number>();

const DEFAULT_SERVER_IDS = [DEFAULT_FLYFF_SERVER_ID]; // 你想“默认扫描”的服务器列表；可扩展
const PRONUNCIATION_BUTTON_LABEL = '発音を聞く';

function dedupePlayersByPlayerId(players: ScrapedPlayer[]) {
  const byPlayerId = new Map<string, ScrapedPlayer>();
  const duplicates: ScrapedPlayer[] = [];

  for (const player of players) {
    const existing = byPlayerId.get(player.playerId);
    if (!existing) {
      byPlayerId.set(player.playerId, player);
      continue;
    }

    duplicates.push(player);

    if (!existing.rank || (player.rank && player.rank < existing.rank)) {
      byPlayerId.set(player.playerId, player);
    }
  }

  return { players: Array.from(byPlayerId.values()), duplicates };
}

export function startFlyffPoller(client: SapphireClient) {
  console.log(`[flyff poller] started at ${new Date().toISOString()}`);

  setInterval(() => {
    tick(client).catch((e) => console.error('[flyff poller][tick]', e));
  }, 30_000);
}

export async function tick(client: SapphireClient) {
  const configs = await listAllConfigs();
  console.log(
    `[flyff poller] tick: configs=${configs.length} at ${new Date().toISOString()}`,
  );

  // 1) 决定要扫描哪些 server：默认 + 配置里出现过的
  const serverIds = new Set<number>(DEFAULT_SERVER_IDS);
  for (const cfg of configs) serverIds.add(cfg.flyffServerId ?? DEFAULT_FLYFF_SERVER_ID);

  // 2) 按 server 扫描（同一 server 只抓一次榜单）
  for (const serverId of serverIds) {
    if (runningServer.has(serverId)) continue;
    runningServer.add(serverId);

    try {
      await scanServerAndNotifyGuilds(client, serverId, configs);
    } catch (e) {
      console.error(`[flyff poller] scan server ${serverId} failed`, e);
    } finally {
      runningServer.delete(serverId);
    }
  }
}

async function scanServerAndNotifyGuilds(
  client: SapphireClient,
  serverId: number,
  allConfigs: Awaited<ReturnType<typeof listAllConfigs>>,
) {
  console.log(
    `[flyff poller] scanning server=${serverId} at ${new Date().toISOString()}`,
  );

  const oldSnap = await loadSnapshot(serverId);
  const fetched = await fetchAllPlayers(serverId);
  const { players: latest, duplicates } = dedupePlayersByPlayerId(fetched);

  console.log(
    `[flyff poller] server=${serverId} fetched ${fetched.length} players, unique=${latest.length}`,
  );

  if (duplicates.length) {
    const sample = duplicates
      .slice(0, 10)
      .map((p) => `${p.playerId}:${p.username}#${p.rank}`)
      .join(', ');
    console.warn(
      `[flyff poller] server=${serverId} dropped ${duplicates.length} duplicate player ids` +
        (sample ? ` (${sample})` : ''),
    );
  }

  // ✅ 1) 全量 diff（不看 watched/config）
  const allChanges = diffByPlayerId(oldSnap, latest);

  // ✅ 2) 原子化：快照和事件一起成功，避免快照失败后重复记录事件
  const latestByPlayerId = new Map(latest.map((p) => [p.playerId, p]));
  await persistChangesAndSnapshot({
    flyffServerId: serverId,
    changes: allChanges,
    latestByPlayerId,
    players: latest.map((p) => ({
      playerId: p.playerId,
      username: p.username,
      rank: p.rank,
      level: p.level,
      job: p.job,
      flyffGuildName: p.flyffGuildName,
      playtime: p.playtime,
      serverText: p.serverText,
    })),
  });

  if (allChanges.length) {
    console.log(
      `[flyff poller] server=${serverId} recorded ${allChanges.length} changes`,
    );
  }

  const guildNames = latest
    .map((p) => p.flyffGuildName)
    .filter((x): x is string => !!x && x.trim().length > 0)
    .map((x) => x.trim());

  await upsertDiscoveredGuilds(serverId, guildNames);

  // ✅ 3) 推送：仍然只给有配置的 guild 推（因为要知道 channel）
  const guildConfigs = allConfigs.filter(
    (c) => (c.flyffServerId ?? DEFAULT_FLYFF_SERVER_ID) === serverId,
  );
  for (const cfg of guildConfigs) {
    await maybeNotifyGuild(client, cfg, allChanges);
  }
}

async function maybeNotifyGuild(
  client: SapphireClient,
  cfg: {
    discordGuildId: string;
    notifyChannelId: string | null;
    flyffServerId: number;
  },
  allChanges: Change[],
) {
  // 没设推送频道就不发（但扫描和快照已完成）
  if (!cfg.notifyChannelId) return;

  // 每次都读最新 watch：watch/unwatch 立刻生效
  const watched = new Set(await listWatchedGuilds(cfg.discordGuildId));

  // 没关注任何公会：默认不推送
  if (watched.size === 0) return;

  // 用 watched 过滤计算差异（现有逻辑）
  const changes = filterChangesByWatched(allChanges, watched); // ✅ O(changes) 过滤
  if (!changes.length) return;

  const channel = await client.channels.fetch(cfg.notifyChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const top = changes.slice(0, 20);
  const omitted = changes.length - top.length;

  console.log(
    `[flyff poller] server=${cfg.flyffServerId} guild=${cfg.discordGuildId} found ${changes.length} changes, notifying...`,
  );

  const pronunciationUrls = await listPronunciationUrls(
    top.flatMap((change) =>
      change.type === 'guild'
        ? [change.username]
        : [change.beforeName, change.afterName],
    ),
  );

  for (let i = 0; i < top.length; i++) {
    const c = top[i];

    if (!c) continue;

    if (c.type === 'guild') {
      const meta = classifyGuildChange(c.before, c.after);

      const embed = new EmbedBuilder()
        .setTitle(`${meta.emoji} ${meta.title}`)
        .setDescription(`**${c.username}**`)
        .addFields(
          { name: 'Before', value: fmtGuild(c.before), inline: true },
          { name: 'After', value: fmtGuild(c.after), inline: true },
        )
        .setFooter({
          text:
            `server=${cfg.flyffServerId}` +
            `｜検出=${changes.length}件` +
            (omitted > 0 ? `（未表示 ${omitted}件）` : '') +
            `｜${i + 1}/${top.length}`,
        })
        .setTimestamp(new Date())
        .setColor(meta.color);

      await channel.send({
        embeds: [embed],
        components: buildPronunciationComponents([
          {
            label: PRONUNCIATION_BUTTON_LABEL,
            url: pronunciationUrls.get(c.username),
          },
        ]),
      });
      continue;
    }

    const embed = new EmbedBuilder()
      .setTitle('📝 改名')
      .setDescription(`**${c.beforeName}** → **${c.afterName}**`)
      .addFields(
        { name: 'Player ID', value: c.playerId, inline: true },
        { name: 'Before Guild', value: fmtGuild(c.beforeGuild), inline: true },
        { name: 'After Guild', value: fmtGuild(c.afterGuild), inline: true },
      )
      .setFooter({
        text:
          `server=${cfg.flyffServerId}` +
          `｜検出=${changes.length}件` +
          (omitted > 0 ? `（未表示 ${omitted}件）` : '') +
          `｜${i + 1}/${top.length}`,
      })
      .setTimestamp(new Date())
      .setColor(0xfee75c);

    await channel.send({
      embeds: [embed],
      components: buildPronunciationComponents([
        { label: 'Before の発音', url: pronunciationUrls.get(c.beforeName) },
        { label: 'After の発音', url: pronunciationUrls.get(c.afterName) },
      ]),
    });
  }
}

function fmtGuild(g: string | null) {
  return g ?? 'なし';
}

// 判定 guild 事件动作
function classifyGuildChange(before: string | null, after: string | null) {
  if (!before && after) {
    return { emoji: '✅', title: 'ギルド加入', color: 0x57f287 };
  }
  if (before && !after) {
    return { emoji: '🚪', title: 'ギルド脱退', color: 0xed4245 };
  }
  if (before && after && before !== after) {
    return { emoji: '🔁', title: 'ギルド移籍', color: 0x5865f2 };
  }
  return { emoji: '📝', title: 'ギルド更新', color: 0x2b2d31 };
}

function buildPronunciationComponents(
  links: Array<{ label: string; url: string | undefined }>,
) {
  const buttons = links
    .filter((link): link is { label: string; url: string } => !!link.url)
    .slice(0, 5)
    .map((link) =>
      new ButtonBuilder()
        .setLabel(link.label)
        .setStyle(ButtonStyle.Link)
        .setURL(link.url),
    );

  if (!buttons.length) return [];

  return [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)];
}
