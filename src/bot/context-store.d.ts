export type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
};
export declare function getContext(guildId: string, channelId: string, userId: string): ChatMessage[];
export declare function appendContext(guildId: string, channelId: string, userId: string, message: ChatMessage): void;
//# sourceMappingURL=context-store.d.ts.map