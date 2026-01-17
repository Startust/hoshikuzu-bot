import { getDb } from '../../db/client.js';

export type RankingConfig = {
  discordGuildId: string;
  notifyChannelId: string | null;
  flyffServerId: number;
  intervalMinutes: number;
  enabled: boolean;
};

export async function upsertConfig(
  partial: Partial<RankingConfig> & { discordGuildId: string },
) {
  const db = await getDb();
  const now = Date.now();

  // 先确保有一行
  await db.run(
    `INSERT INTO ranking_config(discord_guild_id, updated_at) VALUES (?, ?)
     ON CONFLICT(discord_guild_id) DO UPDATE SET updated_at=excluded.updated_at`,
    [partial.discordGuildId, now],
  );

  const fields: string[] = [];
  const values: any[] = [];

  if (partial.notifyChannelId !== undefined) {
    fields.push('notify_channel_id = ?');
    values.push(partial.notifyChannelId);
  }
  if (partial.flyffServerId !== undefined) {
    fields.push('flyff_server_id = ?');
    values.push(partial.flyffServerId);
  }
  if (partial.intervalMinutes !== undefined) {
    fields.push('interval_minutes = ?');
    values.push(partial.intervalMinutes);
  }
  if (partial.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(partial.enabled ? 1 : 0);
  }

  if (fields.length) {
    values.push(now);
    values.push(partial.discordGuildId);
    await db.run(
      `UPDATE ranking_config SET ${fields.join(', ')}, updated_at=? WHERE discord_guild_id=?`,
      values,
    );
  }
}

export async function getConfig(discordGuildId: string): Promise<RankingConfig> {
  const db = await getDb();
  const row = await db.get(
    `SELECT discord_guild_id, notify_channel_id, flyff_server_id, interval_minutes, enabled
     FROM ranking_config WHERE discord_guild_id=?`,
    [discordGuildId],
  );

  return {
    discordGuildId,
    notifyChannelId: row?.notify_channel_id ?? null,
    flyffServerId: row?.flyff_server_id ?? 23,
    intervalMinutes: row?.interval_minutes ?? 10,
    enabled: (row?.enabled ?? 0) === 1,
  };
}

export async function listWatchedGuilds(discordGuildId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.all(
    `SELECT flyff_guild_name FROM watched_flyff_guilds WHERE discord_guild_id=? ORDER BY flyff_guild_name`,
    [discordGuildId],
  );
  return rows.map((r: any) => r.flyff_guild_name);
}

export async function watchGuild(discordGuildId: string, flyffGuildName: string) {
  const db = await getDb();
  await db.run(
    `INSERT OR IGNORE INTO watched_flyff_guilds(discord_guild_id, flyff_guild_name, created_at)
     VALUES (?, ?, ?)`,
    [discordGuildId, flyffGuildName, Date.now()],
  );
}

export async function unwatchGuild(discordGuildId: string, flyffGuildName: string) {
  const db = await getDb();
  await db.run(
    `DELETE FROM watched_flyff_guilds WHERE discord_guild_id=? AND flyff_guild_name=?`,
    [discordGuildId, flyffGuildName],
  );
}

export type PlayerRow = {
  username: string;
  rank: number | null;
  level: number | null;
  job: string | null;
  flyffGuildName: string | null;
  playtime: string | null;
  serverText: string | null;
};

export async function loadSnapshot(
  discordGuildId: string,
  flyffServerId: number,
): Promise<Map<string, PlayerRow>> {
  const db = await getDb();
  const rows = await db.all(
    `SELECT username, rank, level, job, flyff_guild_name, playtime, server_text
     FROM ranking_snapshot WHERE discord_guild_id=? AND flyff_server_id=?`,
    [discordGuildId, flyffServerId],
  );

  const map = new Map<string, PlayerRow>();
  for (const r of rows) {
    map.set(r.username, {
      username: r.username,
      rank: r.rank ?? null,
      level: r.level ?? null,
      job: r.job ?? null,
      flyffGuildName: r.flyff_guild_name ?? null,
      playtime: r.playtime ?? null,
      serverText: r.server_text ?? null,
    });
  }
  return map;
}

export async function saveSnapshot(
  discordGuildId: string,
  flyffServerId: number,
  players: PlayerRow[],
) {
  const db = await getDb();
  const now = Date.now();

  await db.exec('BEGIN');
  try {
    const stmt = await db.prepare(
      `INSERT INTO ranking_snapshot(
         discord_guild_id, flyff_server_id, username, rank, level, job, flyff_guild_name, playtime, server_text, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(discord_guild_id, flyff_server_id, username)
       DO UPDATE SET rank=excluded.rank, level=excluded.level, job=excluded.job,
                    flyff_guild_name=excluded.flyff_guild_name, playtime=excluded.playtime,
                    server_text=excluded.server_text, updated_at=excluded.updated_at`,
    );

    for (const p of players) {
      await stmt.run([
        discordGuildId,
        flyffServerId,
        p.username,
        p.rank,
        p.level,
        p.job,
        p.flyffGuildName,
        p.playtime,
        p.serverText,
        now,
      ]);
    }

    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

export async function listEnabledConfigs(): Promise<RankingConfig[]> {
  const db = await getDb();
  const rows = await db.all(
    `SELECT discord_guild_id, notify_channel_id, flyff_server_id, interval_minutes, enabled
     FROM ranking_config
     WHERE enabled=1 AND notify_channel_id IS NOT NULL`,
  );

  return rows.map((r: any) => ({
    discordGuildId: r.discord_guild_id,
    notifyChannelId: r.notify_channel_id,
    flyffServerId: r.flyff_server_id ?? 23,
    intervalMinutes: r.interval_minutes ?? 10,
    enabled: true,
  }));
}

export async function listAllConfigs(): Promise<RankingConfig[]> {
  const db = await getDb();
  const rows = await db.all(
    `SELECT discord_guild_id, notify_channel_id, flyff_server_id, interval_minutes
     FROM ranking_config`,
  );

  return rows.map((r: any) => ({
    discordGuildId: r.discord_guild_id,
    notifyChannelId: r.notify_channel_id ?? null,
    flyffServerId: r.flyff_server_id ?? 23,
    intervalMinutes: r.interval_minutes ?? 10,
    enabled: true, // 不再用，填啥都行
  }));
}
