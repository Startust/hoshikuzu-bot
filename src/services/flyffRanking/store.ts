import { prisma } from '../../db/prisma.js';

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
