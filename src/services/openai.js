import { OpenAI } from 'openai';
export const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
export const SYSTEM_PROMPT = `
あなたはFlyff Universeに詳しいアシスタントです。
回答は簡潔に、箇条書きで3〜6点にまとめてください。
根拠が不十分な場合は「不確かです」と明記し、追加で必要な情報（キーワード、状況）を1つだけ質問してください。
長文や余計な前置きは不要です。
`.trim();
//# sourceMappingURL=openai.js.map