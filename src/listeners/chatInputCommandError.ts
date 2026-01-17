import { Listener } from '@sapphire/framework';

export class ChatInputCommandErrorListener extends Listener {
  public constructor(ctx: Listener.LoaderContext, options: Listener.Options) {
    super(ctx, { ...options, event: 'chatInputCommandError' });
  }

  public run(error: unknown, payload: any) {
    console.error('chatInputCommandError:', error);
    console.error('command:', payload?.command?.name);
  }
}
