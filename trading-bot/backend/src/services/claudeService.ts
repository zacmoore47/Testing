import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

const MODEL = 'claude-sonnet-4-5';

export async function callClaudeJSON<T = any>(system: string, user: string, fallback: T): Promise<T> {
  if (!client) return fallback;
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: system + '\n\nRespond ONLY with valid JSON. No markdown, no explanation.',
      messages: [{ role: 'user', content: user }],
    });
    const text = msg.content.filter(b => b.type === 'text').map((b: any) => b.text).join('');
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart < 0) return fallback;
    return JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as T;
  } catch (e) {
    console.warn('[claude] fallback used:', (e as Error).message);
    return fallback;
  }
}

export const claudeAvailable = () => !!client;
