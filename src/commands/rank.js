var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ChannelType } from 'discord.js';
import { fetchAllPlayers } from '../services/flyffRanking/scrape';
import { getConfig, upsertConfig } from '../services/flyffRanking/store';
let RankCommand = (() => {
    let _classDecorators = [ApplyOptions({
            name: 'rank',
            description: 'Flyff 排行榜监控',
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = Command;
    var RankCommand = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            RankCommand = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        registerApplicationCommands(registry) {
            registry.registerChatInputCommand((builder) => builder
                .setName('rank')
                .setDescription('Flyff 排行榜监控')
                .addSubcommand((sc) => sc
                .setName('channel')
                .setDescription('设置推送频道')
                .addChannelOption((o) => o
                .setName('target')
                .setDescription('推送到哪个频道')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)))
                .addSubcommand((sc) => sc.setName('now').setDescription('立刻抓取一次（调试用）')));
        }
        async chatInputRun(interaction) {
            const sub = interaction.options.getSubcommand(true);
            const discordGuildId = interaction.guildId;
            if (sub === 'channel') {
                const ch = interaction.options.getChannel('target', true);
                await upsertConfig({ discordGuildId, notifyChannelId: ch.id });
                await interaction.reply(`✅ 已设置推送频道：<#${ch.id}>`);
                return;
            }
            if (sub === 'now') {
                const config = await getConfig(discordGuildId);
                await interaction.deferReply({ ephemeral: true });
                const players = await fetchAllPlayers(config.flyffServerId);
                const preview = players
                    .slice(0, 5)
                    .map((p) => `#${p.rank ?? '?'} ${p.username} | lv=${p.level ?? '?'} | job=${p.job ?? '?'} | guild=${p.flyffGuildName ?? '无'}`);
                await interaction.editReply(`抓取成功：共 ${players.length} 条。\n` +
                    preview.join('\n') +
                    `\n\n（如果这里全是空，说明解析 selector 需要校准）`);
                return;
            }
        }
    };
    return RankCommand = _classThis;
})();
export { RankCommand };
//# sourceMappingURL=rank.js.map