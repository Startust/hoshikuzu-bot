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
    }
  | {
      type: 'suspected-rename';
      playerId: string;
      beforeName: string;
      afterName: string;
      score: number;
      reason: string[];
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

  console.log(
    `[diff] found ${changes.length} guild changes, checking for suspected renames...`,
  );

  // 2) 疑似改名（不传 watched => 全量记录）
  const disappeared: PlayerRow[] = [];
  const appeared: ScrapedPlayer[] = [];

  for (const [playerId, old] of oldMap.entries()) {
    if (!latestMap.has(playerId)) disappeared.push(old);
  }
  for (const p of latest) {
    if (!oldMap.has(p.playerId)) appeared.push(p);
  }

  const threshold = 6; // 分数阈值，越高越保守
  for (const old of disappeared) {
    let best: { p: ScrapedPlayer; score: number; reason: string[] } | null = null;

    for (const p of appeared) {
      const reason: string[] = [];
      let score = 0;

      if (old.level && p.level && old.level === p.level) {
        score += 2;
        reason.push('level');
      }
      if (old.job && p.job && old.job === p.job) {
        score += 2;
        reason.push('job');
      }
      if (old.playtime && p.playtime && old.playtime === p.playtime) {
        score += 3;
        reason.push('playtime');
      }
      if (old.rank && p.rank && old.rank === p.rank) {
        score += 1;
        reason.push('rank');
      }
      if (
        old.flyffGuildName &&
        p.flyffGuildName &&
        old.flyffGuildName === p.flyffGuildName
      ) {
        score += 1;
        reason.push('guild');
      }

      if (!best || score > best.score) best = { p, score, reason };
    }

    if (best && best.score >= threshold) {
      const beforeG = old.flyffGuildName ?? null;
      const afterG = best.p.flyffGuildName ?? null;

      if (isWatchedRelated(watchedGuilds, beforeG, afterG)) {
        changes.push({
          type: 'suspected-rename',
          playerId: best.p.playerId,
          beforeName: old.username,
          afterName: best.p.username,
          score: best.score,
          reason: best.reason,
          beforeGuild: beforeG,
          afterGuild: afterG,
        });
      }
    }
  }

  console.log(
    `[diff] found ${changes.length} total changes (including suspected renames)`,
  );

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
