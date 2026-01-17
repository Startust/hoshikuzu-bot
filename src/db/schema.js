import { getDb } from './client';
export async function initSchema() {
    const db = await getDb();
    await db.exec(`
    CREATE TABLE IF NOT EXISTS page_cache (
      url TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT,
      text TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      ttl_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_page_cache_source
    ON page_cache(source);

    CREATE TABLE IF NOT EXISTS search_cache (
      source TEXT NOT NULL, 
      query TEXT NOT NULL,
      results_json TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      ttl_ms INTEGER NOT NULL,
      PRIMARY KEY (source, query)
    );

    CREATE INDEX IF NOT EXISTS idx_search_cache_source
    ON search_cache(source);

    -- ===== Flyff Ranking Watch =====

    CREATE TABLE IF NOT EXISTS ranking_config (
                                                discord_guild_id TEXT PRIMARY KEY,
                                                notify_channel_id TEXT,
                                                flyff_server_id INTEGER NOT NULL DEFAULT 23,
                                                interval_minutes INTEGER NOT NULL DEFAULT 10,
                                                enabled INTEGER NOT NULL DEFAULT 0,
                                                updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watched_flyff_guilds (
                                                      discord_guild_id TEXT NOT NULL,
                                                      flyff_guild_name TEXT NOT NULL,
                                                      created_at INTEGER NOT NULL,
                                                      PRIMARY KEY (discord_guild_id, flyff_guild_name)
      );

    -- 快照：按用户名（因为你说找不到稳定ID）
    CREATE TABLE IF NOT EXISTS ranking_snapshot (
                                                  discord_guild_id TEXT NOT NULL,
                                                  flyff_server_id INTEGER NOT NULL,
                                                  username TEXT NOT NULL,
                                                  rank INTEGER,
                                                  level INTEGER,
                                                  job TEXT,
                                                  flyff_guild_name TEXT,
                                                  playtime TEXT,
                                                  server_text TEXT,
                                                  updated_at INTEGER NOT NULL,
                                                  PRIMARY KEY (discord_guild_id, flyff_server_id, username)
      );

    CREATE INDEX IF NOT EXISTS idx_ranking_snapshot_guild_server
      ON ranking_snapshot(discord_guild_id, flyff_server_id);
  `);
}
//# sourceMappingURL=schema.js.map