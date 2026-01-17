export type RankingConfig = {
    discordGuildId: string;
    notifyChannelId: string | null;
    flyffServerId: number;
    intervalMinutes: number;
    enabled: boolean;
};
export declare function upsertConfig(partial: Partial<RankingConfig> & {
    discordGuildId: string;
}): Promise<void>;
export declare function getConfig(discordGuildId: string): Promise<RankingConfig>;
export declare function listWatchedGuilds(discordGuildId: string): Promise<string[]>;
export declare function watchGuild(discordGuildId: string, flyffGuildName: string): Promise<void>;
export declare function unwatchGuild(discordGuildId: string, flyffGuildName: string): Promise<void>;
export type PlayerRow = {
    username: string;
    rank: number | null;
    level: number | null;
    job: string | null;
    flyffGuildName: string | null;
    playtime: string | null;
    serverText: string | null;
};
export declare function loadSnapshot(discordGuildId: string, flyffServerId: number): Promise<Map<string, PlayerRow>>;
export declare function saveSnapshot(discordGuildId: string, flyffServerId: number, players: PlayerRow[]): Promise<void>;
export declare function listEnabledConfigs(): Promise<RankingConfig[]>;
export declare function listAllConfigs(): Promise<RankingConfig[]>;
//# sourceMappingURL=store.d.ts.map