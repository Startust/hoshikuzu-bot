import type { ChatMessage } from '../bot/context-store';
import { openai, SYSTEM_PROMPT } from './openai';

function normalizeText(s: unknown) {
  return typeof s === 'string' ? s.trim() : '';
}

export async function askModel(params: { history: ChatMessage[]; userContent: string }) {
  const { history, userContent } = params;

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

  // ✅ 兜底：如果空输出，再试一次（降低温度/提高 tokens）
  if (!text) {
    const completion2 = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages,
      max_completion_tokens: Math.max(900, 1200),
    });
    text = normalizeText(completion2.choices?.[0]?.message?.content);
  }

  return (
    text ||
    'すみません、うまく回答を生成できませんでした。別の言い方で質問してみてください。'
  );
}
