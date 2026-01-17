export type CachedPage = {
    url: string;
    source: string;
    title: string | null;
    text: string;
    fetchedAt: number;
    ttlMs: number;
};
export declare function getPage(url: string): Promise<CachedPage | null>;
export declare function setPage(params: {
    url: string;
    source: string;
    title?: string | null;
    text: string;
    ttlMs: number;
}): Promise<void>;
export declare function getSearch(source: string, query: string): Promise<unknown | null>;
export declare function setSearch(params: {
    source: string;
    query: string;
    results: unknown;
    ttlMs: number;
}): Promise<void>;
//# sourceMappingURL=cache.d.ts.map