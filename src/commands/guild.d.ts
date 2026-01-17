import { Subcommand } from '@sapphire/plugin-subcommands';
export declare class GuildCommand extends Subcommand {
    registerApplicationCommands(registry: Subcommand.Registry): void;
    chatInputWatch(interaction: Subcommand.ChatInputCommandInteraction): Promise<void>;
    chatInputUnwatch(interaction: Subcommand.ChatInputCommandInteraction): Promise<void>;
    chatInputList(interaction: Subcommand.ChatInputCommandInteraction): Promise<void>;
}
//# sourceMappingURL=guild.d.ts.map