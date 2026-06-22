/**
 * Regra de precificação por arquivo processado por IA:
 * - Até 1.100 prompt tokens: preço base (default R$ 0,15)
 * - A cada bloco adicional de 500 prompt tokens acima de 1.100: + R$ 0,01
 *
 * Ex.: 1.100 → 0,15 | 1.600 → 0,16 | 2.100 → 0,17 | 2.600 → 0,18 ...
 */
export const AI_PRICE_BASE_THRESHOLD = 1100;
export const AI_PRICE_TIER_STEP = 500;
export const AI_PRICE_TIER_INCREMENT = 0.01;

export function computeAiCost(promptTokens: number, basePrice = 0.15): number {
  const tokens = Math.max(0, Math.floor(promptTokens || 0));
  if (tokens <= AI_PRICE_BASE_THRESHOLD) return Number(basePrice);
  const extraTiers = Math.floor((tokens - AI_PRICE_BASE_THRESHOLD) / AI_PRICE_TIER_STEP);
  return Number(basePrice) + extraTiers * AI_PRICE_TIER_INCREMENT;
}
