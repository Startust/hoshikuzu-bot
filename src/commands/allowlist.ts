import { ApplyOptions } from '@sapphire/decorators';
import type { Command } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import type { SlashCommandBuilder } from 'discord.js';

import {
  addGuildToAllowlist,
  listAllowedGuilds,
  removeGuildFromAllowlist,
} from '../services/guildAllowList';

function isValidGuildId(id: string): boolean {
  // Discord snowflake: 通常 17-20 位数字
  return /^[0-9]{16,22}$/.test(id);
}

@ApplyOptions<Subcommand.Options>({
  name: 'allowlist',
  description: '管理允许 bot 加入的服务器白名单（仅 Owner）',
  subcommands: [
    { name: 'add', chatInputRun: 'chatInputAdd' },
    { name: 'remove', chatInputRun: 'chatInputRemove' },
    { name: 'list', chatInputRun: 'chatInputList' },
  ],
})
export class AllowlistCommand extends Subcommand {
  private readonly adminGuildId = process.env.ALLOWLIST_ADMIN_GUILD_ID;

  public override registerApplicationCommands(registry: Subcommand.Registry) {
    if (!this.adminGuildId) {
      this.container.logger.warn(
        '[allowlist] ALLOWLIST_ADMIN_GUILD_ID not set, command will NOT be registered',
      );
      return;
    }

    const command = (builder: SlashCommandBuilder) =>
      builder
        .setName('allowlist')
        .setDescription('管理允许 bot 加入的服务器白名单（仅 Owner）')
        .addSubcommand((sc) =>
          sc
            .setName('add')
            .setDescription('添加一个 Guild ID 到白名单')
            .addStringOption((o) =>
              o
                .setName('guild_id')
                .setDescription('Discord Guild ID（服务器 ID）')
                .setRequired(true),
            )
            .addStringOption((o) =>
              o.setName('note').setDescription('备注（可选）').setRequired(false),
            ),
        )
        .addSubcommand((sc) =>
          sc
            .setName('remove')
            .setDescription('从白名单移除一个 Guild ID')
            .addStringOption((o) =>
              o
                .setName('guild_id')
                .setDescription('Discord Guild ID（服务器 ID）')
                .setRequired(true),
            ),
        )
        .addSubcommand((sc) =>
          sc
            .setName('list')
            .setDescription('查看白名单')
            .addIntegerOption((o) =>
              o
                .setName('limit')
                .setDescription('最多显示多少条（默认 20，最大 100）')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(false),
            ),
        );

    registry.registerChatInputCommand(command, {
      guildIds: [this.adminGuildId],
    });
  }

  public async chatInputAdd(interaction: Command.ChatInputCommandInteraction) {
    const guildId = interaction.options.getString('guild_id', true).trim();
    const note = interaction.options.getString('note')?.trim();

    if (!isValidGuildId(guildId)) {
      await interaction.reply({
        content: `❌ guild_id 格式不正确：\`${guildId}\``,
        flags: ['Ephemeral'],
      });
      return;
    }

    await addGuildToAllowlist(guildId, note);

    await interaction.reply({
      content: `✅ 已加入白名单：\`${guildId}\`` + (note ? `\n备注：${note}` : ''),
      flags: ['Ephemeral'],
    });
  }

  public async chatInputRemove(interaction: Command.ChatInputCommandInteraction) {
    const guildId = interaction.options.getString('guild_id', true).trim();

    if (!isValidGuildId(guildId)) {
      await interaction.reply({
        content: `❌ guild_id 格式不正确：\`${guildId}\``,
        flags: ['Ephemeral'],
      });
      return;
    }

    await removeGuildFromAllowlist(guildId);

    await interaction.reply({
      content: `🗑️ 已从白名单移除：\`${guildId}\``,
      flags: ['Ephemeral'],
    });
  }

  public async chatInputList(interaction: Command.ChatInputCommandInteraction) {
    const limit = interaction.options.getInteger('limit') ?? 20;

    const rows = await listAllowedGuilds();

    if (rows.length === 0) {
      await interaction.reply({
        content: '白名单目前为空。',
        flags: ['Ephemeral'],
      });
      return;
    }

    const lines = rows.slice(0, limit).map((r, i) => {
      const note = r.note ? ` | ${r.note}` : '';
      return `${String(i + 1).padStart(2, '0')}. ${r.discordGuildId}${note}`;
    });

    await interaction.reply({
      content:
        `📋 白名单（${rows.length} 条）\n` + '```text\n' + lines.join('\n') + '\n```',
      flags: ['Ephemeral'],
    });
  }
}
