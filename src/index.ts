import 'dotenv/config';

import { Client, Events, GatewayIntentBits, type Message, Partials } from 'discord.js';

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error('DISCORD_TOKEN is missing');

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

  const content = message.content
    .replaceAll(`<@${me.id}>`, '')
    .replaceAll(`<@!${me.id}>`, '')
    .trim();

  if (!content) {
    await message.reply('Yes? How can I help you?');
    return;
  }

  await message.reply(`Got your message: "${content}"`);
});

client.login(token);
