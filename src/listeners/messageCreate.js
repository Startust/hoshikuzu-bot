import { Listener } from '@sapphire/framework';
import { appendContext, getContext } from '../bot/context-store';
import { askModel } from '../services/ask';
export class MessageCreateListener extends Listener {
    constructor(context, options) {
        super(context, {
            ...options,
            event: 'messageCreate',
        });
    }
    async run(message) {
        // Ignore messages from bots
        if (message.author.bot)
            return;
        // Ignore messages that do not mention the bot
        const me = this.container.client.user;
        if (!me)
            return;
        if (!message.mentions.has(me))
            return;
        const guildId = message.guild?.id;
        if (!guildId)
            return; // Ignore DMs
        const content = message.content
            .replaceAll(`<@${me.id}>`, '')
            .replaceAll(`<@!${me.id}>`, '')
            .trim();
        if (!content) {
            await message.reply('Yes? How can I help you?');
            return;
        }
        // Get context
        const history = getContext(guildId, message.channel.id, message.author.id);
        // store user message in history
        appendContext(guildId, message.channel.id, message.author.id, {
            role: 'user',
            content,
        });
        if ('sendTyping' in message.channel) {
            await message.channel.sendTyping();
        }
        try {
            const reply = await askModel({
                history,
                userContent: content,
            });
            appendContext(guildId, message.channel.id, message.author.id, {
                role: 'assistant',
                content: reply,
            });
            await message.reply(reply);
        }
        catch (err) {
            console.error('Error while processing message:', err);
            await message.reply('エラーが発生しました。少し時間をおいてもう一度試してください。');
        }
    }
}
//# sourceMappingURL=messageCreate.js.map