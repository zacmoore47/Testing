const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.00 },
  "claude-sonnet-4-6": { input: 3.00, output: 15.00 },
  "claude-opus-4-8": { input: 15.00, output: 75.00 },
};

export function estimateCost(
  models: { fast: string; analyst: string; heavy: string }
): { low: number; high: number; breakdown: string } {
  const fast = PRICING[models.fast] || PRICING["claude-haiku-4-5-20251001"];
  const analyst = PRICING[models.analyst] || PRICING["claude-sonnet-4-6"];
  const heavy = PRICING[models.heavy] || PRICING["claude-opus-4-8"];

  // Researcher: ~2k in, ~2k out (fast)
  // Judge: ~3k in, ~0.5k out x2 rounds (fast)
  // 4 analysts x 2-3 rounds: ~3k in, ~1k out each (analyst)
  // Risk manager: ~6k in, ~1k out (heavy)
  // Decision maker: ~8k in, ~1k out (heavy)

  const researcherCost = (2000 * fast.input + 2000 * fast.output) / 1_000_000;
  const judgeCost = 2 * (3000 * fast.input + 500 * fast.output) / 1_000_000;
  const analystCostPerRound = 4 * (3000 * analyst.input + 1000 * analyst.output) / 1_000_000;
  const riskCost = (6000 * heavy.input + 1000 * heavy.output) / 1_000_000;
  const decisionCost = (8000 * heavy.input + 1000 * heavy.output) / 1_000_000;

  const lowRounds = 2;
  const highRounds = 3;

  const low = researcherCost + judgeCost + analystCostPerRound * lowRounds + riskCost + decisionCost;
  const high = researcherCost + judgeCost * 1.5 + analystCostPerRound * highRounds + riskCost + decisionCost;

  return {
    low: Math.round(low * 100) / 100,
    high: Math.round(high * 100) / 100,
    breakdown: `Research: ~$${researcherCost.toFixed(3)} | Analysts/round: ~$${analystCostPerRound.toFixed(3)} | Risk+PM: ~$${(riskCost + decisionCost).toFixed(3)}`,
  };
}
