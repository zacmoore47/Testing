export const config = {
  models: {
    fast: process.env.FAST_MODEL || "claude-haiku-4-5-20251001",
    analyst: process.env.ANALYST_MODEL || "claude-sonnet-4-6",
    heavy: process.env.HEAVY_MODEL || "claude-opus-4-8",
  },
  maxRounds: parseInt(process.env.MAX_ROUNDS || "3", 10),
  marketDataApiKey: process.env.MARKET_DATA_API_KEY || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
};

export function validateConfig(): string[] {
  const errors: string[] = [];
  if (!config.anthropicApiKey) errors.push("ANTHROPIC_API_KEY is not set");
  if (!config.marketDataApiKey) errors.push("MARKET_DATA_API_KEY is not set");
  return errors;
}
