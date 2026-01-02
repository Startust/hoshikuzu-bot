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
  `);
}
