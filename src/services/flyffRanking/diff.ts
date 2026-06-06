import type { ScrapedPlayer } from './scrape.js';
import type { PlayerRow } from './store.js';

export type Change =
  | {
      type: 'guild';
      playerId: string;
      username: string;
      before: string | null;
      after: string | null;
    }
  | {
      type: 'rename';
      playerId: string;
      beforeName: string;
      afterName: string;
      beforeGuild: string | null;
      afterGuild: string | null;
    };

function isWatchedRelated(
  watchedGuilds: Set<string> | undefined,
  before: string | null,
  after: string | null,
) {
  // watchedGuilds 未传 => 全量
  if (!watchedGuilds) return true;

  // watchedGuilds 为空 => 你原逻辑是“不过滤”（等同全量）
  if (watchedGuilds.size === 0) return true;

  return watchedGuilds.has(before ?? '') || watchedGuilds.has(after ?? '');
}

export function diffByPlayerId(
  oldMap: Map<string, PlayerRow>,
  latest: ScrapedPlayer[],
  watchedGuilds?: Set<string>,
): Change[] {
  const changes: Change[] = [];

  const latestMap = new Map(latest.map((p) => [p.playerId, p]));
  // 1) 同 ID 公会/名字变化
  for (const [playerId, old] of oldMap.entries()) {
    const now = latestMap.get(playerId);
    if (!now) continue;

    const before = old.flyffGuildName ?? null;
    const after = now.flyffGuildName ?? null;

    if (old.username !== now.username) {
      if (isWatchedRelated(watchedGuilds, before, after)) {
        changes.push({
          type: 'rename',
          playerId,
          beforeName: old.username,
          afterName: now.username,
          beforeGuild: before,
          afterGuild: after,
        });
      }
    }

    if (before !== after) {
      if (isWatchedRelated(watchedGuilds, before, after)) {
        changes.push({ type: 'guild', playerId, username: now.username, before, after });
      }
    }
  }

  console.log(`[diff] found ${changes.length} changes`);

  return changes;
}

export function filterChangesByWatched(changes: Change[], watched: Set<string>) {
  if (watched.size === 0) return changes;

  return changes.filter((c) => {
    if (c.type === 'guild') {
      return watched.has(c.before ?? '') || watched.has(c.after ?? '');
    }
    return watched.has(c.beforeGuild ?? '') || watched.has(c.afterGuild ?? '');
  });
}
