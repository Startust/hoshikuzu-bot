const MAX_ROUNDS = 3; // Maximum number of message rounds to keep in context
const MAX_MESSAGES = MAX_ROUNDS * 2; // Each round has a user message and an assistant message
const store = new Map();
function makeKey(guildId, channelId, userId) {
    return `${guildId}:${channelId}:${userId}`;
}
export function getContext(guildId, channelId, userId) {
    const key = makeKey(guildId, channelId, userId);
    return store.get(key) ?? [];
}
export function appendContext(guildId, channelId, userId, message) {
    const key = makeKey(guildId, channelId, userId);
    const prev = store.get(key) ?? [];
    const next = [...prev, message].slice(-MAX_MESSAGES);
    store.set(key, next);
}
//# sourceMappingURL=context-store.js.map