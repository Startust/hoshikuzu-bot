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

const running = new Set<string>();
const nextRunAt = new Map<string, number>();

export function startFlyffPoller(client: SapphireClient) {
  setInterval(async () => {
    const configs = await listAllConfigs(); // 只要有配置行就跑

    for (const cfg of configs) {
      const key = cfg.discordGuildId;
      const now = Date.now();

      const due = nextRunAt.get(key) ?? 0;
      if (now < due) continue;
      if (running.has(key)) continue;

      running.add(key);
      nextRunAt.set(key, now + cfg.intervalMinutes * 60_000);

      try {
        console.log(
          `[flyff poller] running for guild ${key} at ${new Date().toISOString()}`,
        );

        // ⚠️ 每次都读最新 watch 列表：watch/unwatch 立刻影响
        const watched = new Set(await listWatchedGuilds(cfg.discordGuildId));

        const oldSnap = await loadSnapshot(cfg.discordGuildId, cfg.flyffServerId);
        const latest = await fetchAllPlayers(cfg.flyffServerId);

        const changes = diffByUsername(oldSnap, latest, watched);

        await saveSnapshot(
          cfg.discordGuildId,
          cfg.flyffServerId,
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

        // 没设推送频道就不发
        if (!cfg.notifyChannelId) continue;

        // 没关注任何公会：默认不推送（但仍更新快照）
        if (watched.size === 0) continue;

        if (changes.length) {
          const channel = await client.channels
            .fetch(cfg.notifyChannelId)
            .catch(() => null);
          if (!channel || channel.type !== ChannelType.GuildText) continue;

          const lines = changes.slice(0, 20).map((c) => {
            if (c.type === 'guild') {
              return `🏰 公会变动：**${c.username}**（${c.before ?? '无'} → ${c.after ?? '无'}）`;
            }
            return `⚠️ 疑似改名：**${c.beforeName}** → **${c.afterName}**（score=${c.score}，依据=${c.reason.join(',')}）`;
          });

          await channel.send(
            `【Flyff 排行榜变更】${changes.length} 条：\n${lines.join('\n')}`,
          );
        }
      } catch (e) {
        console.error('[flyff poller]', e);
      } finally {
        running.delete(key);
        console.log(
          `[flyff poller] next run for guild ${key} at ${new Date().toISOString()}`,
        );
      }
    }
  }, 30_000);
}
