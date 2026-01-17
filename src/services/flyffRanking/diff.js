export function diffByUsername(oldMap, latest, watchedGuilds) {
    const changes = [];
    const latestMap = new Map(latest.map((p) => [p.username, p]));
    // 1) 确定：同名公会变化
    for (const [username, old] of oldMap.entries()) {
        const now = latestMap.get(username);
        if (!now)
            continue;
        const before = old.flyffGuildName ?? null;
        const after = now.flyffGuildName ?? null;
        if (before !== after) {
            if (watchedGuilds.size === 0 ||
                watchedGuilds.has(before ?? '') ||
                watchedGuilds.has(after ?? '')) {
                changes.push({ type: 'guild', username, before, after });
            }
        }
    }
    // 2) 可选：疑似改名（基于特征匹配）
    // 只有当你确实想要“改名提醒”，才开启这个逻辑
    // 这里默认开启且阈值较高，避免误报
    const disappeared = [];
    const appeared = [];
    for (const [username, old] of oldMap.entries()) {
        if (!latestMap.has(username))
            disappeared.push(old);
    }
    for (const p of latest) {
        if (!oldMap.has(p.username))
            appeared.push(p);
    }
    const threshold = 6; // 分数阈值，越高越保守
    for (const old of disappeared) {
        let best = null;
        for (const p of appeared) {
            const reason = [];
            let score = 0;
            if (old.level && p.level && old.level === p.level) {
                score += 2;
                reason.push('level');
            }
            if (old.job && p.job && old.job === p.job) {
                score += 2;
                reason.push('job');
            }
            if (old.playtime && p.playtime && old.playtime === p.playtime) {
                score += 3;
                reason.push('playtime');
            }
            if (old.rank && p.rank && old.rank === p.rank) {
                score += 1;
                reason.push('rank');
            }
            if (old.flyffGuildName &&
                p.flyffGuildName &&
                old.flyffGuildName === p.flyffGuildName) {
                score += 1;
                reason.push('guild');
            }
            if (!best || score > best.score)
                best = { p, score, reason };
        }
        if (best && best.score >= threshold) {
            // 只在关注公会相关时发（从/到关注公会）
            const beforeG = old.flyffGuildName ?? '';
            const afterG = best.p.flyffGuildName ?? '';
            const related = watchedGuilds.size === 0 ||
                watchedGuilds.has(beforeG) ||
                watchedGuilds.has(afterG);
            if (related) {
                changes.push({
                    type: 'suspected-rename',
                    beforeName: old.username,
                    afterName: best.p.username,
                    score: best.score,
                    reason: best.reason,
                });
            }
        }
    }
    return changes;
}
//# sourceMappingURL=diff.js.map