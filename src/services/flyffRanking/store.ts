import { prisma } from '../../db/prisma.js';
import type { Change } from './diff';
import type { ScrapedPlayer } from './scrape';

export type RankingConfig = {
  discordGuildId: string;
  notifyChannelId: string | null;
  flyffServerId: number;
};

export async function upsertConfig(
  partial: Partial<RankingConfig> & { discordGuildId: string },
) {
  // 你原来逻辑：先确保有一行，再按 partial 更新指定字段
  // Prisma 的 upsert 正好一次搞定：update 里只放你传进来的字段
  const data: Record<string, string | number | boolean | null> = {};

  if (partial.notifyChannelId !== undefined) {
    data.notifyChannelId = partial.notifyChannelId;
  }
  if (partial.flyffServerId !== undefined) {
    data.flyffServerId = partial.flyffServerId;
  }

  // 即使 data 为空，也会触发 updatedAt 自动更新（因为 @updatedAt）
  await prisma.rankingConfig.upsert({
    where: { discordGuildId: partial.discordGuildId },
    create: {
      discordGuildId: partial.discordGuildId,
      // create 时如果 partial 没给，就吃 schema 默认值
      ...(partial.notifyChannelId !== undefined
        ? { notifyChannelId: partial.notifyChannelId }
        : {}),
      ...(partial.flyffServerId !== undefined
        ? { flyffServerId: partial.flyffServerId }
        : {}),
    },
    update: data,
  });
}

export async function getConfig(discordGuildId: string): Promise<RankingConfig> {
  const row = await prisma.rankingConfig.findUnique({
    where: { discordGuildId },
    select: {
      discordGuildId: true,
      notifyChannelId: true,
      flyffServerId: true,
    },
  });

  // 你原逻辑：没有行也返回默认值（并不创建）
  if (!row) {
    return {
      discordGuildId,
      notifyChannelId: null,
      flyffServerId: 23,
    };
  }

  return {
    discordGuildId: row.discordGuildId,
    notifyChannelId: row.notifyChannelId ?? null,
    flyffServerId: row.flyffServerId ?? 23,
  };
}

export async function listWatchedGuilds(discordGuildId: string): Promise<string[]> {
  const rows = await prisma.watchedFlyffGuild.findMany({
    where: { discordGuildId },
    select: { flyffGuildName: true },
  });
  return rows.map((r) => r.flyffGuildName);
}

export async function watchGuild(discordGuildId: string, flyffGuildName: string) {
  // SQLite: INSERT OR IGNORE
  // Prisma: create + catch unique / 或 upsert（但 upsert 需要唯一 where）
  // 这里你的表是复合主键 @@id([discordGuildId, flyffGuildName])，所以可以用 upsert：
  await prisma.watchedFlyffGuild.upsert({
    where: {
      discordGuildId_flyffGuildName: { discordGuildId, flyffGuildName },
    },
    create: { discordGuildId, flyffGuildName },
    update: {}, // 已存在就啥也不做
  });
}

export async function unwatchGuild(discordGuildId: string, flyffGuildName: string) {
  // SQLite: DELETE ...
  // Prisma: delete (如果不存在会抛错)；想完全贴近 SQLite（不存在也算成功）就用 deleteMany
  await prisma.watchedFlyffGuild.deleteMany({
    where: { discordGuildId, flyffGuildName },
  });
}

export type PlayerRow = {
  username: string;
  rank: number;
  level: number;
  job: string;
  flyffGuildName: string;
  playtime: string;
  serverText: string;
};

export async function loadSnapshot(flyffServerId: number) {
  const rows = await prisma.rankingSnapshot.findMany({
    where: { flyffServerId },
    orderBy: { rank: 'asc' },
    select: {
      username: true,
      rank: true,
      level: true,
      job: true,
      flyffGuildName: true,
      playtime: true,
      serverText: true,
    },
  });

  const map = new Map<string, PlayerRow>();
  for (const r of rows) {
    map.set(r.username, {
      username: r.username,
      rank: r.rank,
      level: r.level,
      job: r.job,
      flyffGuildName: r.flyffGuildName ?? '',
      playtime: r.playtime ?? '',
      serverText: r.serverText ?? '',
    });
  }
  return map;
}

export async function saveSnapshot(flyffServerId: number, players: PlayerRow[]) {
  // 简单可靠：transaction 内 deleteMany + createMany
  await prisma.$transaction(async (tx) => {
    await tx.rankingSnapshot.deleteMany({ where: { flyffServerId } });

    if (players.length) {
      await tx.rankingSnapshot.createMany({
        data: players.map((p) => ({
          flyffServerId,
          username: p.username,
          rank: p.rank,
          level: p.level,
          job: p.job,
          flyffGuildName: p.flyffGuildName,
          playtime: p.playtime,
          serverText: p.serverText,
        })),
      });
    }
  });
}

export async function listAllConfigs(): Promise<RankingConfig[]> {
  const rows = await prisma.rankingConfig.findMany();

  return rows.map((r) => ({
    discordGuildId: r.discordGuildId,
    notifyChannelId: r.notifyChannelId ?? null,
    flyffServerId: r.flyffServerId ?? 23,
    enabled: true,
  }));
}

export async function appendEvents(
  flyffServerId: number,
  changes: Change[], // 你 diff 的类型
  latestByUsername: Map<string, ScrapedPlayer>, // 可选：补充 rank/level/job
) {
  if (!changes.length) return;

  await prisma.rankingEvent.createMany({
    data: changes.map((c) => {
      if (c.type === 'guild') {
        const p = latestByUsername.get(c.username);
        return {
          flyffServerId,
          eventType: 'guild',
          username: c.username,
          beforeValue: c.before ?? null,
          afterValue: c.after ?? null,
          rank: p?.rank ?? null,
          level: p?.level ?? null,
          job: p?.job ?? null,
          flyffGuildName: p?.flyffGuildName ?? null,
        };
      }
      // rename
      return {
        flyffServerId,
        eventType: 'suspected-rename',
        beforeName: c.beforeName,
        afterName: c.afterName,
        score: c.score ?? null,
        reasonJson: JSON.stringify(c.reason ?? []),
        beforeValue: c.beforeGuild ?? null,
        afterValue: c.afterGuild ?? null,
      };
    }),
  });
}

export type GuildHistoryRow = {
  createdAt: Date;
  eventType: 'guild' | 'suspected-rename';
  username: string | null;
  beforeValue: string | null;
  afterValue: string | null;
  beforeName: string | null;
  afterName: string | null;
  score: number | null;
  reasonJson: string | null;
  rank: number | null;
  level: number | null;
  job: string | null;
};

export async function listGuildHistoryEvents(params: {
  flyffServerId: number;
  guildName: string;
  limit: number;
}): Promise<GuildHistoryRow[]> {
  const { flyffServerId, guildName } = params;
  const limit = Math.min(Math.max(params.limit, 1), 50);

  const rows = await prisma.rankingEvent.findMany({
    where: {
      flyffServerId,
      OR: [
        // guild-change: before/after 命中
        {
          eventType: 'guild',
          OR: [{ beforeValue: guildName }, { afterValue: guildName }],
        },

        // suspected-rename: 也用 beforeValue/afterValue 存公会前/后，所以同样筛
        {
          eventType: 'suspected-rename',
          OR: [{ beforeValue: guildName }, { afterValue: guildName }],
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      createdAt: true,
      eventType: true,
      username: true,
      beforeValue: true,
      afterValue: true,
      beforeName: true,
      afterName: true,
      score: true,
      reasonJson: true,
      rank: true,
      level: true,
      job: true,
    },
  });

  return rows as any;
}
