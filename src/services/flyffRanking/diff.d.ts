import type { ScrapedPlayer } from './scrape';
import type { PlayerRow } from './store';
export type Change = {
    type: 'guild';
    username: string;
    before: string | null;
    after: string | null;
} | {
    type: 'suspected-rename';
    beforeName: string;
    afterName: string;
    score: number;
    reason: string[];
};
export declare function diffByUsername(oldMap: Map<string, PlayerRow>, latest: ScrapedPlayer[], watchedGuilds: Set<string>): Change[];
//# sourceMappingURL=diff.d.ts.map