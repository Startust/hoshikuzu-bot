import { OpenAI } from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const SYSTEM_PROMPT = `
あなたは有能で簡潔なアシスタントです。
質問に直接答え、不要な前置きや繰り返しは避けてください。
不確かな場合は無理に断定せず、その旨を短く伝えてください。
`.trim();
