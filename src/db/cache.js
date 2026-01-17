import { getDb } from './client';
function nowMs() {
    return Date.now();
}
export async function getPage(url) {
    const db = await getDb();
    const row = await db.get(`SELECT url, source, title, text,
            fetched_at as fetchedAt,
            ttl_ms as ttlMs
     FROM page_cache
     WHERE url = ?`, url);
    if (!row)
        return null;
    const expired = nowMs() > row.fetchedAt + row.ttlMs;
    if (expired)
        return null;
    return row;
}
export async function setPage(params) {
    const db = await getDb();
    const { url, source, title = null, text, ttlMs } = params;
    await db.run(`INSERT INTO page_cache(url, source, title, text, fetched_at, ttl_ms)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET
       source=excluded.source,
       title=excluded.title,
       text=excluded.text,
       fetched_at=excluded.fetched_at,
       ttl_ms=excluded.ttl_ms`, url, source, title, text, nowMs(), ttlMs);
}
export async function getSearch(source, query) {
    const db = await getDb();
    const row = await db.get(`SELECT results_json as resultsJson,
            fetched_at as fetchedAt,
            ttl_ms as ttlMs
     FROM search_cache
     WHERE source = ? AND query = ?`, source, query);
    if (!row)
        return null;
    const expired = nowMs() > row.fetchedAt + row.ttlMs;
    if (expired)
        return null;
    try {
        return JSON.parse(row.resultsJson);
    }
    catch {
        return null;
    }
}
export async function setSearch(params) {
    const db = await getDb();
    const { source, query, results, ttlMs } = params;
    await db.run(`INSERT INTO search_cache(source, query, results_json, fetched_at, ttl_ms)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source, query) DO UPDATE SET
       results_json=excluded.results_json,
       fetched_at=excluded.fetched_at,
       ttl_ms=excluded.ttl_ms`, source, query, JSON.stringify(results), nowMs(), ttlMs);
}
//# sourceMappingURL=cache.js.map