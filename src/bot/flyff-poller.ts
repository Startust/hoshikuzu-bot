import type { SapphireClient } from '@sapphire/framework';
import { ChannelType } from 'discord.js';

import { diffByUsername } from '../services/flyffRanking/diff.js';
import { fetchAllPlayers } from '../services/flyffRanking/scrape.js';
import {
  listAllConfigs, // 新增：返回所有有配置的 guild（哪怕没 enabled）
  listWatchedGuilds,
  loadSnapshot,
  saveSnapshot,
} from '../services/flyffRanking/store.js';

const runningServer = new Set<number>();

const DEFAULT_SERVER_IDS = [23]; // 你想“默认扫描”的服务器列表；可扩展

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
  for (const cfg of configs) serverIds.add(cfg.flyffServerId ?? 23);

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

  // A) 读取旧快照 + 抓最新榜单
  const oldSnap = await loadSnapshot(serverId);
  const latest = await fetchAllPlayers(serverId);

  console.log(`[flyff poller] server=${serverId} fetched ${latest.length} players`);

  // B) 先更新快照（无论是否推送）
  await saveSnapshot(
    serverId,
    latest.map((p) => ({
      username: p.username,
      rank: p.rank,
      level: p.level,
      job: p.job,
      flyffGuildName: p.flyffGuildName,
      playtime: p.playtime,
      serverText: p.serverText,
    })),
  );

  // C) 针对这个 server 上的每个 discord guild 配置，决定是否推送
  const guildConfigs = allConfigs.filter((c) => (c.flyffServerId ?? 23) === serverId);

  for (const cfg of guildConfigs) {
    await maybeNotifyGuild(client, cfg, oldSnap, latest);
  }
}

async function maybeNotifyGuild(
  client: SapphireClient,
  cfg: {
    discordGuildId: string;
    notifyChannelId: string | null;
    flyffServerId: number;
  },
  oldSnap: Awaited<ReturnType<typeof loadSnapshot>>,
  latest: Awaited<ReturnType<typeof fetchAllPlayers>>,
) {
  // 没设推送频道就不发（但扫描和快照已完成）
  if (!cfg.notifyChannelId) return;

  // 每次都读最新 watch：watch/unwatch 立刻生效
  const watched = new Set(await listWatchedGuilds(cfg.discordGuildId));

  // 没关注任何公会：默认不推送
  if (watched.size === 0) return;

  // 用 watched 过滤计算差异（现有逻辑）
  const changes = diffByUsername(oldSnap, latest, watched);
  if (!changes.length) return;

  const channel = await client.channels.fetch(cfg.notifyChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const lines = changes.slice(0, 20).map((c) => {
    if (c.type === 'guild') {
      return `🏰 公会变动：**${c.username}**（${c.before ?? '无'} → ${c.after ?? '无'}）`;
    }
    return `⚠️ 疑似改名：**${c.beforeName}** → **${c.afterName}**（score=${c.score}，依据=${c.reason.join(',')}）`;
  });

  console.log(
    `[flyff poller] server=${cfg.flyffServerId} guild=${cfg.discordGuildId} found ${changes.length} changes, notifying...`,
  );

  await channel.send(`【Flyff 排行榜变更】${changes.length} 条：\n${lines.join('\n')}`);
}
