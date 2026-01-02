export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const MAX_ROUNDS = 3; // Maximum number of message rounds to keep in context
const MAX_MESSAGES = MAX_ROUNDS * 2; // Each round has a user message and an assistant message

const store = new Map<string, ChatMessage[]>();

function makeKey(guildId: string, channelId: string, userId: string) {
  return `${guildId}:${channelId}:${userId}`;
}

export function getContext(
  guildId: string,
  channelId: string,
  userId: string,
): ChatMessage[] {
  const key = makeKey(guildId, channelId, userId);
  return store.get(key) ?? [];
}

export function appendContext(
  guildId: string,
  channelId: string,
  userId: string,
  message: ChatMessage,
) {
  const key = makeKey(guildId, channelId, userId);
  const prev = store.get(key) ?? [];
  const next = [...prev, message].slice(-MAX_MESSAGES);
  store.set(key, next);
}
