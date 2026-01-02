import { getDb } from './client';

function nowMs() {
  return Date.now();
}

export type CachedPage = {
  url: string;
  source: string;
  title: string | null;
  text: string;
  fetchedAt: number;
  ttlMs: number;
};

type PageRow = {
  url: string;
  source: string;
  title: string | null;
  text: string;
  fetchedAt: number;
  ttlMs: number;
};

export async function getPage(url: string): Promise<CachedPage | null> {
  const db = await getDb();

  const row = await db.get<PageRow>(
    `SELECT url, source, title, text,
            fetched_at as fetchedAt,
            ttl_ms as ttlMs
     FROM page_cache
     WHERE url = ?`,
    url,
  );

  if (!row) return null;

  const expired = nowMs() > row.fetchedAt + row.ttlMs;
  if (expired) return null;

  return row;
}

export async function setPage(params: {
  url: string;
  source: string;
  title?: string | null;
  text: string;
  ttlMs: number;
}): Promise<void> {
  const db = await getDb();
  const { url, source, title = null, text, ttlMs } = params;

  await db.run(
    `INSERT INTO page_cache(url, source, title, text, fetched_at, ttl_ms)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET
       source=excluded.source,
       title=excluded.title,
       text=excluded.text,
       fetched_at=excluded.fetched_at,
       ttl_ms=excluded.ttl_ms`,
    url,
    source,
    title,
    text,
    nowMs(),
    ttlMs,
  );
}

type SearchRow = {
  resultsJson: string;
  fetchedAt: number;
  ttlMs: number;
};

export async function getSearch(source: string, query: string): Promise<unknown | null> {
  const db = await getDb();

  const row = await db.get<SearchRow>(
    `SELECT results_json as resultsJson,
            fetched_at as fetchedAt,
            ttl_ms as ttlMs
     FROM search_cache
     WHERE source = ? AND query = ?`,
    source,
    query,
  );

  if (!row) return null;

  const expired = nowMs() > row.fetchedAt + row.ttlMs;
  if (expired) return null;

  try {
    return JSON.parse(row.resultsJson);
  } catch {
    return null;
  }
}

export async function setSearch(params: {
  source: string;
  query: string;
  results: unknown;
  ttlMs: number;
}): Promise<void> {
  const db = await getDb();
  const { source, query, results, ttlMs } = params;

  await db.run(
    `INSERT INTO search_cache(source, query, results_json, fetched_at, ttl_ms)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source, query) DO UPDATE SET
       results_json=excluded.results_json,
       fetched_at=excluded.fetched_at,
       ttl_ms=excluded.ttl_ms`,
    source,
    query,
    JSON.stringify(results),
    nowMs(),
    ttlMs,
  );
}
