/**
 * Cross-Platform Arbitrage Detector
 *
 * Finds the same event priced differently on Polymarket vs Kalshi.
 * Spreads >5% occur ~15-20% of the time across matched markets.
 *
 * Example: Event YES at $0.58 on Kalshi + NO at $0.35 on Polymarket
 * = $0.93 combined = 7.53% locked-in return regardless of outcome.
 */

import { supabase } from "./config.js";
import { queryModel } from "./openrouter.js";

export interface ArbOpportunity {
  polymarketMarketId: string;
  kalshiMarketId: string;
  polymarketQuestion: string;
  kalshiQuestion: string;
  polyYesPrice: number;
  kalshiYesPrice: number;
  spread: number; // absolute difference
  combinedPrice: number; // should be < 1.0 for arb
  potentialReturn: number; // percentage return
  direction: "buy_poly_yes_kalshi_no" | "buy_poly_no_kalshi_yes";
}

/**
 * Scan for arbitrage opportunities between Polymarket and Kalshi
 */
export async function findArbOpportunities(): Promise<ArbOpportunity[]> {
  // Get all active markets from both platforms
  const { data: polyMarkets } = await supabase
    .from("markets")
    .select("id, platform_market_id, question, current_yes_price, current_no_price")
    .eq("platform", "polymarket")
    .eq("is_active", true);

  const { data: kalshiMarkets } = await supabase
    .from("markets")
    .select("id, platform_market_id, question, current_yes_price, current_no_price")
    .eq("platform", "kalshi")
    .eq("is_active", true);

  if (!polyMarkets || !kalshiMarkets) return [];

  // Match markets across platforms using AI similarity
  const opportunities: ArbOpportunity[] = [];

  // First pass: simple keyword matching
  for (const poly of polyMarkets) {
    const polyQ = poly.question.toLowerCase();
    const polyPrice = Number(poly.current_yes_price);

    for (const kalshi of kalshiMarkets) {
      const kalshiQ = kalshi.question.toLowerCase();
      const kalshiPrice = Number(kalshi.current_yes_price);

      // Quick similarity check: shared significant words
      const similarity = calculateSimilarity(polyQ, kalshiQ);
      if (similarity < 0.4) continue;

      // Verify with AI that markets are truly the same event
      let matchVerified = false;
      try {
        const match = await verifyMarketMatch(poly.question, kalshi.question);
        if (!match.isMatch || match.confidence < 0.7) continue;
        matchVerified = true;
      } catch (e) {
        console.warn(`[arbitrage] Market match verification failed, skipping pair:`, e instanceof Error ? e.message : e);
        continue;
      }

      // Check for arbitrage: buy YES on cheaper, NO on more expensive
      // Arb exists if: cheaperYES + cheaperNO < 1.0 across platforms
      const polyNo = Number(poly.current_no_price) || 1 - polyPrice;
      const kalshiNo = Number(kalshi.current_no_price) || 1 - kalshiPrice;

      // Strategy 1: Buy YES on Poly + NO on Kalshi
      const combined1 = polyPrice + kalshiNo;
      if (combined1 < 0.97) {
        // 3% minimum after fees
        const profit1 = ((1 - combined1) / combined1) * 100;
        console.log(
          `[arbitrage] ARB DETECTED: Poly '${poly.question}' vs Kalshi '${kalshi.question}' — combined: $${combined1.toFixed(4)}, profit: ${profit1.toFixed(2)}% (buy_poly_yes + buy_kalshi_no)`
        );
        opportunities.push({
          polymarketMarketId: poly.id,
          kalshiMarketId: kalshi.id,
          polymarketQuestion: poly.question,
          kalshiQuestion: kalshi.question,
          polyYesPrice: polyPrice,
          kalshiYesPrice: kalshiPrice,
          spread: Math.abs(polyPrice - kalshiPrice),
          combinedPrice: combined1,
          potentialReturn: profit1,
          direction: "buy_poly_yes_kalshi_no",
        });
      }

      // Strategy 2: Buy NO on Poly + YES on Kalshi
      const combined2 = polyNo + kalshiPrice;
      if (combined2 < 0.97) {
        const profit2 = ((1 - combined2) / combined2) * 100;
        console.log(
          `[arbitrage] ARB DETECTED: Poly '${poly.question}' vs Kalshi '${kalshi.question}' — combined: $${combined2.toFixed(4)}, profit: ${profit2.toFixed(2)}% (buy_poly_no + buy_kalshi_yes)`
        );
        opportunities.push({
          polymarketMarketId: poly.id,
          kalshiMarketId: kalshi.id,
          polymarketQuestion: poly.question,
          kalshiQuestion: kalshi.question,
          polyYesPrice: polyPrice,
          kalshiYesPrice: kalshiPrice,
          spread: Math.abs(polyPrice - kalshiPrice),
          combinedPrice: combined2,
          potentialReturn: profit2,
          direction: "buy_poly_no_kalshi_yes",
        });
      }
    }
  }

  // Sort by potential return
  opportunities.sort((a, b) => b.potentialReturn - a.potentialReturn);

  // Store top opportunities
  if (opportunities.length > 0) {
    await storeOpportunities(opportunities.slice(0, 20));
  }

  return opportunities;
}

/**
 * Use AI to verify that two markets are truly the same event
 * (prevents resolution risk from different platform interpretations)
 */
export async function verifyMarketMatch(
  polyQuestion: string,
  kalshiQuestion: string
): Promise<{ isMatch: boolean; confidence: number; risk: string }> {
  const result = await queryModel(
    "gemini",
    "You determine if two prediction market questions refer to the same event. Respond with: MATCH: <yes|no>\\nCONFIDENCE: <0.0-1.0>\\nRISK: <brief description of any resolution risk>",
    `Are these the same event?\n\nPolymarket: "${polyQuestion}"\nKalshi: "${kalshiQuestion}"`
  );

  const matchStr = result.reasoning.match(/MATCH:\s*(yes|no)/i);
  const confStr = result.reasoning.match(/CONFIDENCE:\s*([\d.]+)/i);
  const riskStr = result.reasoning.match(/RISK:\s*([\s\S]+)/i);

  return {
    isMatch: matchStr?.[1]?.toLowerCase() === "yes",
    confidence: confStr ? parseFloat(confStr[1]) : 0.5,
    risk: riskStr?.[1]?.trim().slice(0, 200) || "Unknown resolution risk",
  };
}

// --- Helpers ---

function calculateSimilarity(a: string, b: string): number {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "will", "be", "by", "in",
    "on", "at", "to", "of", "for", "with", "and", "or", "not", "this", "that",
    "it", "its", "do", "does", "did", "has", "have", "had", "been",
  ]);

  const wordsA = a
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
  const wordsB = b
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);

  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;

  return union > 0 ? intersection / union : 0;
}

async function storeOpportunities(opps: ArbOpportunity[]): Promise<void> {
  try {
    const rows = opps.map((o) => ({
      poly_market_id: o.polymarketMarketId,
      kalshi_market_id: o.kalshiMarketId,
      poly_yes_price: o.polyYesPrice,
      kalshi_yes_price: o.kalshiYesPrice,
      spread: o.spread,
      combined_price: o.combinedPrice,
      potential_return: o.potentialReturn,
      direction: o.direction,
      status: "detected",
      detected_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("arb_opportunities").insert(rows);
    if (error) {
      console.error(`[arbitrage] Failed to store opportunities:`, error.message);
    }
  } catch (e) {
    console.error(`[arbitrage] storeOpportunities threw:`, e instanceof Error ? e.message : e);
  }
}
