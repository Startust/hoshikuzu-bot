import { Listener } from '@sapphire/framework';
import type { Message } from 'discord.js';

import { appendContext, getContext } from '../bot/context-store.js';
import { askModel } from '../services/ask.js';

export class MessageCreateListener extends Listener {
  public constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      event: 'messageCreate',
    });
  }

  public async run(message: Message) {
    // 1. Ignore bots
    if (message.author.bot) return;

    // 2. Only respond when mentioned
    const me = this.container.client.user;
    if (!me) return;
    if (!message.mentions.has(me)) return;

    // 3. Ignore DMs
    const guildId = message.guild?.id;
    if (!guildId) return;

    // 4. Extract clean content
    const content = message.content
      .replaceAll(`<@${me.id}>`, '')
      .replaceAll(`<@!${me.id}>`, '')
      .trim();

    if (!content) {
      await message.reply('ご用件をどうぞ。');
      return;
    }

    const channelId = message.channel.id;
    const userId = message.author.id;

    // ✅ 5. 先取“过去的 history”（不包含本条消息）
    const history = getContext(guildId, channelId, userId);

    // 6. 打字中提示
    if ('sendTyping' in message.channel) {
      await message.channel.sendTyping();
    }

    try {
      // 7. 调用模型（history + 当前 user content）
      const reply = await askModel({
        history,
        userContent: content,
      });

      // ✅ 8. 按顺序写入上下文（user → assistant）
      appendContext(guildId, channelId, userId, {
        role: 'user',
        content,
      });

      appendContext(guildId, channelId, userId, {
        role: 'assistant',
        content: reply,
      });

      // 9. 回复
      await message.reply(reply);
    } catch (err) {
      console.error('Error while processing message:', err);
      await message.reply(
        'エラーが発生しました。少し時間をおいてもう一度試してください。',
      );
    }
  }
}
