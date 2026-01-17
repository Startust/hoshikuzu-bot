import { Listener } from '@sapphire/framework';
export class ChatInputCommandErrorListener extends Listener {
    constructor(ctx, options) {
        super(ctx, { ...options, event: 'chatInputCommandError' });
    }
    run(error, payload) {
        console.error('chatInputCommandError:', error);
        console.error('command:', payload?.command?.name);
    }
}
//# sourceMappingURL=chatInputCommandError.js.map