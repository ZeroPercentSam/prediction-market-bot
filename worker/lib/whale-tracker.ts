/**
 * Whale Tracker — Real Polymarket Trade Data
 *
 * Uses data-api.polymarket.com/trades to detect large trades ($5K+)
 * Uses data-api.polymarket.com/holders to identify top holders
 *
 * Signal integration:
 * - Whales agree with model → boost edge
 * - Whales disagree → penalty
 */

import { supabase } from "./config.js";

const DATA_API = "https://data-api.polymarket.com";
const MIN_WHALE_TRADE_USD = 5000;

export interface WhaleSignal {
  marketId: string;
  conditionId: string;
  whaleCount: number;
  netDirection: "bullish" | "bearish" | "neutral";
  convictionScore: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  recentTrades: WhaleTrade[];
}

interface WhaleTrade {
  wallet: string;
  name: string;
  side: "BUY" | "SELL";
  size: number;
  price: number;
  outcome: string;
  timestamp: number;
  dollarValue: number;
}

/**
 * Get whale signals for a Polymarket market
 */
export async function getWhaleSignal(
  conditionId: string,
  marketId: string
): Promise<WhaleSignal | null> {
  try {
    // Fetch large trades ($5K+) for this market
    const url = `${DATA_API}/trades?market=${conditionId}&limit=100&filterType=CASH&filterAmount=${MIN_WHALE_TRADE_USD}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

    if (!res.ok) return null;
    const trades: Array<Record<string, unknown>> = await res.json();
    if (!Array.isArray(trades) || trades.length === 0) return null;

    // Parse whale trades
    const whaleTrades: WhaleTrade[] = trades.map((t) => ({
      wallet: String(t.proxyWallet || ""),
      name: String(t.name || t.pseudonym || "anon"),
      side: String(t.side || "BUY").toUpperCase() as "BUY" | "SELL",
      size: Number(t.size || 0),
      price: Number(t.price || 0),
      outcome: String(t.outcome || "Yes"),
      timestamp: Number(t.timestamp || 0),
      dollarValue: Number(t.size || 0) * Number(t.price || 0),
    }));

    // Aggregate buy vs sell volume
    const buyTrades = whaleTrades.filter((t) => t.side === "BUY");
    const sellTrades = whaleTrades.filter((t) => t.side === "SELL");
    const totalBuy = buyTrades.reduce((s, t) => s + t.dollarValue, 0);
    const totalSell = sellTrades.reduce((s, t) => s + t.dollarValue, 0);

    // Determine direction (20% threshold for significance)
    let netDirection: "bullish" | "bearish" | "neutral" = "neutral";
    if (totalBuy > totalSell * 1.2) netDirection = "bullish";
    else if (totalSell > totalBuy * 1.2) netDirection = "bearish";

    // Count unique whale wallets
    const uniqueWallets = new Set(whaleTrades.map((t) => t.wallet));
    const convictionScore =
      uniqueWallets.size * ((totalBuy + totalSell) / Math.max(1, whaleTrades.length));

    const signal: WhaleSignal = {
      marketId,
      conditionId,
      whaleCount: uniqueWallets.size,
      netDirection,
      convictionScore,
      totalBuyVolume: totalBuy,
      totalSellVolume: totalSell,
      recentTrades: whaleTrades.slice(0, 10),
    };

    // Store in database (non-fatal)
    try {
      await supabase.from("whale_signals").upsert(
        {
          market_id: marketId,
          whale_count: signal.whaleCount,
          net_direction: signal.netDirection,
          conviction_score: signal.convictionScore,
          total_volume: totalBuy + totalSell,
          detected_at: new Date().toISOString(),
        },
        { onConflict: "market_id" }
      );
    } catch { /* non-fatal */ }

    return signal;
  } catch (error) {
    console.warn(`[whale] Failed for ${conditionId}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Get top holders for a market (shows who has the biggest positions)
 */
export async function getTopHolders(
  conditionId: string,
  limit: number = 20
): Promise<Array<{ wallet: string; name: string; amount: number }>> {
  try {
    const url = `${DATA_API}/holders?market=${conditionId}&limit=${limit}&minBalance=100`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

    if (!res.ok) return [];
    const data = await res.json();

    // Holders response has arrays per token
    const holders: Array<{ wallet: string; name: string; amount: number }> = [];

    for (const tokenHolders of Object.values(data) as Array<Array<Record<string, unknown>>>) {
      if (!Array.isArray(tokenHolders)) continue;
      for (const h of tokenHolders) {
        holders.push({
          wallet: String(h.proxyWallet || ""),
          name: String(h.name || h.pseudonym || "anon"),
          amount: Number(h.amount || 0),
        });
      }
    }

    return holders.sort((a, b) => b.amount - a.amount).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Apply whale signal adjustment to probability
 */
export function applyWhaleAdjustment(
  probability: number,
  marketPrice: number,
  signal: WhaleSignal | null
): { adjustedProbability: number; whaleAdjustment: number } {
  if (!signal || signal.netDirection === "neutral" || signal.whaleCount < 2) {
    return { adjustedProbability: probability, whaleAdjustment: 0 };
  }

  const modelBullish = probability > marketPrice;
  const whalesBullish = signal.netDirection === "bullish";

  // Scale adjustment by conviction (capped at 8%)
  const baseAdjustment = Math.min(0.08, signal.convictionScore / 500_000);

  let adjustment: number;
  if (modelBullish === whalesBullish) {
    // Agreement: boost in the model's direction
    adjustment = modelBullish ? baseAdjustment : -baseAdjustment;
  } else {
    // Disagreement: small penalty toward whale direction
    adjustment = whalesBullish ? 0.02 : -0.02;
  }

  const adjusted = Math.max(0.01, Math.min(0.99, probability + adjustment));
  return { adjustedProbability: adjusted, whaleAdjustment: adjustment };
}
