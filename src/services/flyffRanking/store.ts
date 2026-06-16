import { prisma } from '../../db/prisma.js';
import { DEFAULT_FLYFF_SERVER_ID } from './constants.js';
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
      flyffServerId: DEFAULT_FLYFF_SERVER_ID,
    };
  }

  return {
    discordGuildId: row.discordGuildId,
    notifyChannelId: row.notifyChannelId ?? null,
    flyffServerId: row.flyffServerId ?? DEFAULT_FLYFF_SERVER_ID,
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
  playerId: string;
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
      playerId: true,
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
    map.set(r.playerId, {
      playerId: r.playerId,
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
    }
  });
}

function buildEventRows(
  flyffServerId: number,
  changes: Change[],
  latestByPlayerId: Map<string, ScrapedPlayer>,
) {
  return changes.map((c) => {
    if (c.type === 'guild') {
      const p = latestByPlayerId.get(c.playerId);
      return {
        flyffServerId,
        eventType: 'guild',
        playerId: c.playerId,
        username: c.username,
        beforeValue: c.before ?? null,
        afterValue: c.after ?? null,
        rank: p?.rank ?? null,
        level: p?.level ?? null,
        job: p?.job ?? null,
        flyffGuildName: p?.flyffGuildName ?? null,
      };
    }

    const p = latestByPlayerId.get(c.playerId);

    return {
      flyffServerId,
      eventType: 'rename',
      playerId: c.playerId,
      username: c.afterName,
      beforeName: c.beforeName,
      afterName: c.afterName,
      beforeValue: c.beforeGuild ?? null,
      afterValue: c.afterGuild ?? null,
      rank: p?.rank ?? null,
      level: p?.level ?? null,
      job: p?.job ?? null,
      flyffGuildName: p?.flyffGuildName ?? null,
    };
  });
}

function buildSnapshotRows(flyffServerId: number, players: PlayerRow[]) {
  return players.map((p) => ({
    flyffServerId,
    playerId: p.playerId,
    username: p.username,
    rank: p.rank,
    level: p.level,
    job: p.job,
    flyffGuildName: p.flyffGuildName,
    playtime: p.playtime,
    serverText: p.serverText,
  }));
}

function buildGuildMemberRows(flyffServerId: number, players: PlayerRow[]) {
  return players
    .filter((p) => p.flyffGuildName.trim().length > 0)
    .map((p) => ({
      flyffServerId,
      flyffGuildName: p.flyffGuildName,
      playerId: p.playerId,
      username: p.username,
      rank: p.rank,
      level: p.level,
      job: p.job,
      playtime: p.playtime,
      serverText: p.serverText,
    }));
}

export async function persistChangesAndSnapshot(params: {
  flyffServerId: number;
  changes: Change[];
  latestByPlayerId: Map<string, ScrapedPlayer>;
  players: PlayerRow[];
}) {
  const { flyffServerId, changes, latestByPlayerId, players } = params;

  await prisma.$transaction(async (tx) => {
    await tx.rankingSnapshot.deleteMany({ where: { flyffServerId } });

    if (players.length) {
      await tx.rankingSnapshot.createMany({
        data: buildSnapshotRows(flyffServerId, players),
      });
    }

    await tx.guildMemberSnapshot.deleteMany({ where: { flyffServerId } });
    const guildMemberRows = buildGuildMemberRows(flyffServerId, players);
    if (guildMemberRows.length) {
      await tx.guildMemberSnapshot.createMany({ data: guildMemberRows });
    }

    if (changes.length) {
      await tx.rankingEvent.createMany({
        data: buildEventRows(flyffServerId, changes, latestByPlayerId),
      });
    }
  });
}

export async function listAllConfigs(): Promise<RankingConfig[]> {
  const rows = await prisma.rankingConfig.findMany();

  return rows.map((r) => ({
    discordGuildId: r.discordGuildId,
    notifyChannelId: r.notifyChannelId ?? null,
    flyffServerId: r.flyffServerId ?? DEFAULT_FLYFF_SERVER_ID,
    enabled: true,
  }));
}

export async function appendEvents(
  flyffServerId: number,
  changes: Change[], // 你 diff 的类型
  latestByPlayerId: Map<string, ScrapedPlayer>, // 可选：补充 rank/level/job
) {
  if (!changes.length) return;

  await prisma.rankingEvent.createMany({
    data: buildEventRows(flyffServerId, changes, latestByPlayerId),
  });
}

export type GuildHistoryRow = {
  createdAt: Date;
  eventType: 'guild' | 'rename' | 'suspected-rename';
  playerId: string | null;
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

export type PlayerHistoryRow = GuildHistoryRow;

export type GuildMemberRow = {
  playerId: string;
  username: string;
  rank: number;
  level: number;
  job: string;
  playtime: string | null;
  serverText: string | null;
  updatedAt: Date;
};

function toHistoryEventType(value: string): GuildHistoryRow['eventType'] {
  if (value === 'rename' || value === 'suspected-rename') return value;
  return 'guild';
}

export async function listGuildMembers(params: {
  flyffServerId: number;
  guildName: string;
}): Promise<GuildMemberRow[]> {
  const rows = await prisma.guildMemberSnapshot.findMany({
    where: {
      flyffServerId: params.flyffServerId,
      flyffGuildName: params.guildName,
    },
    orderBy: [{ rank: 'asc' }, { username: 'asc' }],
    select: {
      playerId: true,
      username: true,
      rank: true,
      level: true,
      job: true,
      playtime: true,
      serverText: true,
      updatedAt: true,
    },
  });

  return rows;
}

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

        // rename/suspected-rename: 也用 beforeValue/afterValue 存公会前/后，所以同样筛
        {
          eventType: { in: ['rename', 'suspected-rename'] },
          OR: [{ beforeValue: guildName }, { afterValue: guildName }],
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      createdAt: true,
      eventType: true,
      playerId: true,
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

  return rows.map((r) => ({
    ...r,
    eventType: toHistoryEventType(r.eventType),
  }));
}

async function findPlayerIdsByName(flyffServerId: number, playerName: string) {
  const [snapshotRows, eventRows] = await Promise.all([
    prisma.rankingSnapshot.findMany({
      where: { flyffServerId, username: playerName },
      take: 25,
      select: { playerId: true },
    }),
    prisma.rankingEvent.findMany({
      where: {
        flyffServerId,
        OR: [
          { username: playerName },
          { beforeName: playerName },
          { afterName: playerName },
        ],
      },
      take: 50,
      select: { playerId: true },
    }),
  ]);

  return Array.from(
    new Set(
      [...snapshotRows, ...eventRows]
        .map((row) => row.playerId)
        .filter((playerId): playerId is string => Boolean(playerId)),
    ),
  );
}

export async function listPlayerHistoryEvents(params: {
  flyffServerId: number;
  playerName: string;
  limit: number;
}): Promise<PlayerHistoryRow[]> {
  const { flyffServerId, playerName } = params;
  const limit = Math.min(Math.max(params.limit, 1), 50);
  const playerIds = await findPlayerIdsByName(flyffServerId, playerName);

  const rows = await prisma.rankingEvent.findMany({
    where: {
      flyffServerId,
      OR: [
        ...(playerIds.length ? [{ playerId: { in: playerIds } }] : []),
        { username: playerName },
        { beforeName: playerName },
        { afterName: playerName },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      createdAt: true,
      eventType: true,
      playerId: true,
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

  return rows.map((r) => ({
    ...r,
    eventType: toHistoryEventType(r.eventType),
  }));
}

export async function searchKnownPlayers(
  flyffServerId: number,
  q: string,
  limit = 25,
): Promise<string[]> {
  const query = q.trim();
  const names: string[] = [];

  const pushName = (name: string | null) => {
    const trimmed = name?.trim();
    if (trimmed && !names.includes(trimmed)) names.push(trimmed);
  };

  const snapshotRows = await prisma.rankingSnapshot.findMany({
    where: {
      flyffServerId,
      ...(query ? { username: { contains: query } } : {}),
    },
    orderBy: { rank: 'asc' },
    take: limit,
    select: { username: true },
  });

  for (const row of snapshotRows) pushName(row.username);
  if (names.length >= limit) return names.slice(0, limit);

  const eventRows = await prisma.rankingEvent.findMany({
    where: {
      flyffServerId,
      ...(query
        ? {
            OR: [
              { username: { contains: query } },
              { beforeName: { contains: query } },
              { afterName: { contains: query } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit * 3,
    select: {
      username: true,
      beforeName: true,
      afterName: true,
    },
  });

  for (const row of eventRows) {
    pushName(row.username);
    pushName(row.beforeName);
    pushName(row.afterName);
    if (names.length >= limit) break;
  }

  const lower = query.toLowerCase();
  return names
    .sort((a, b) => {
      if (!lower) return 0;
      const ap = a.toLowerCase().startsWith(lower) ? 0 : 1;
      const bp = b.toLowerCase().startsWith(lower) ? 0 : 1;
      return ap - bp;
    })
    .slice(0, limit);
}

export async function upsertDiscoveredGuilds(flyffServerId: number, names: string[]) {
  const unique = Array.from(new Set(names.map((x) => x.trim()).filter(Boolean)));
  if (unique.length === 0) return;

  // 1) 先插入不存在的（重复跳过）
  await prisma.discoveredFlyffGuild.createMany({
    data: unique.map((n) => ({ flyffServerId, flyffGuildName: n })),
    skipDuplicates: true,
  });

  // 2) 再把这些 guild 的 lastSeenAt 刷新到 now
  //    @updatedAt 会在 update 时自动刷新
  await prisma.discoveredFlyffGuild.updateMany({
    where: { flyffServerId, flyffGuildName: { in: unique } },
    data: {}, // 触发 updatedAt
  });
}

export async function searchDiscoveredGuilds(
  flyffServerId: number,
  q: string,
  limit = 25,
): Promise<string[]> {
  if (!q) {
    const rows = await prisma.discoveredFlyffGuild.findMany({
      where: { flyffServerId },
      orderBy: { lastSeenAt: 'desc' },
      take: limit,
      select: { flyffGuildName: true },
    });
    return rows.map((r) => r.flyffGuildName);
  }

  // MySQL：contains 默认大小写是否敏感取决于 collation；
  // 一般 utf8mb4_general_ci / _ai_ci 是不敏感的，够用。
  const rows = await prisma.discoveredFlyffGuild.findMany({
    where: {
      flyffServerId,
      flyffGuildName: { contains: q },
    },
    orderBy: { lastSeenAt: 'desc' },
    take: limit,
    select: { flyffGuildName: true },
  });

  // 可选：把“前缀命中”排前面（更像智能补全）
  const lower = q.toLowerCase();
  return rows
    .map((r) => r.flyffGuildName)
    .sort((a, b) => {
      const ap = a.toLowerCase().startsWith(lower) ? 0 : 1;
      const bp = b.toLowerCase().startsWith(lower) ? 0 : 1;
      return ap - bp;
    })
    .slice(0, limit);
}
