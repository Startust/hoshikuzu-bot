import type { ChatMessage } from '../bot/context-store.js';
import { openai, SYSTEM_PROMPT } from './openai.js';

type TextContentBlock = {
  text: string;
};

function isTextContentBlock(value: unknown): value is TextContentBlock {
  return (
    !!value &&
    typeof value === 'object' &&
    'text' in value &&
    typeof value.text === 'string'
  );
}

function normalizeText(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content.trim();

  // 有些 SDK/配置会返回 content 为数组块
  if (Array.isArray(content)) {
    const joined = content
      .map((c) => {
        if (typeof c === 'string') return c;
        if (isTextContentBlock(c)) return c.text;
        return '';
      })
      .join('');
    return joined.trim();
  }

  return '';
}

function compactHistory(history: ChatMessage[], maxMessages = 16): ChatMessage[] {
  // 最普通：只保留最近 N 条，避免 token 爆炸
  if (!history || history.length <= maxMessages) return history;
  return history.slice(-maxMessages);
}

export async function askModel(params: { history: ChatMessage[]; userContent: string }) {
  const { userContent } = params;
  const history = compactHistory(params.history, 16);

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...history,
    { role: 'user' as const, content: userContent },
  ];

  // 第一次请求
  const completion1 = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages,
    max_completion_tokens: 900,
  });

  let text = normalizeText(completion1.choices?.[0]?.message?.content);

  // 兜底：如果空输出，再试一次（同参数即可）
  if (!text) {
    const completion2 = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages,
      max_completion_tokens: 1200,
    });
    text = normalizeText(completion2.choices?.[0]?.message?.content);
  }

  return (
    text ||
    'すみません、うまく回答を生成できませんでした。別の言い方で質問してみてください。'
  );
}
