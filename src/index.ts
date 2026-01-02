import 'dotenv/config';

import { Client, Events, GatewayIntentBits, type Message, Partials } from 'discord.js';

import { appendContext, getContext } from './bot/context-store';
import { initSchema } from './db/schema';
import { askModel } from './services/ask';

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error('DISCORD_TOKEN is missing');

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message: Message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  // Ignore messages that do not mention the bot
  const me = client.user;
  if (!me) return;
  if (!message.mentions.has(me)) return;

  const guildId = message.guild?.id;
  if (!guildId) return; // Ignore DMs

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
  } catch (err) {
    console.error('Error while processing message:', err);
    await message.reply('エラーが発生しました。少し時間をおいてもう一度試してください。');
  }
});

initSchema();
console.log('✅ DB schema initialized');
client.login(token);
