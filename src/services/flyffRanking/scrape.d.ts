export type ScrapedPlayer = {
    username: string;
    rank: number | null;
    level: number | null;
    job: string | null;
    flyffGuildName: string | null;
    playtime: string | null;
    serverText: string | null;
};
export declare function fetchAllPlayers(serverId: number): Promise<ScrapedPlayer[]>;
//# sourceMappingURL=scrape.d.ts.map