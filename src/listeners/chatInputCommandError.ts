import { Listener } from '@sapphire/framework';

type ChatInputCommandErrorPayload = {
  command?: {
    name?: string;
  };
};

export class ChatInputCommandErrorListener extends Listener {
  public constructor(ctx: Listener.LoaderContext, options: Listener.Options) {
    super(ctx, { ...options, event: 'chatInputCommandError' });
  }

  public run(error: unknown, payload: ChatInputCommandErrorPayload) {
    console.error('chatInputCommandError:', error);
    console.error('command:', payload?.command?.name);
  }
}
