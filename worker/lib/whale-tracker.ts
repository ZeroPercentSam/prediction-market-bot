/**
 * Whale Tracker
 *
 * Tracks large trades on Polymarket to detect smart money signals.
 * 14 of the 20 most profitable Polymarket wallets are bots.
 *
 * Signal integration:
 * - Whales agree with model → +8% edge boost
 * - Whales disagree → -2% penalty
 */

import { supabase } from "./config.js";

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const MIN_TRADE_SIZE = 5000; // $5K minimum to count as whale

export interface WhaleSignal {
  marketId: string;
  whaleCount: number;
  netDirection: "bullish" | "bearish" | "neutral";
  convictionScore: number; // whale_count × avg_dollar_size
  totalVolume: number;
  topWallets: string[];
}

/**
 * Get whale signals for a specific Polymarket market
 */
export async function getWhaleSignal(
  conditionId: string,
  marketId: string
): Promise<WhaleSignal | null> {
  try {
    // Fetch recent large trades from Polymarket
    const trades = await fetchRecentTrades(conditionId);

    if (trades.length === 0) return null;

    // Filter for whale-sized trades
    const whaleTrades = trades.filter((t) => t.size >= MIN_TRADE_SIZE);
    if (whaleTrades.length === 0) return null;

    // Analyze direction
    const buyVolume = whaleTrades
      .filter((t) => t.side === "buy")
      .reduce((s, t) => s + t.size, 0);
    const sellVolume = whaleTrades
      .filter((t) => t.side === "sell")
      .reduce((s, t) => s + t.size, 0);

    const totalVolume = buyVolume + sellVolume;
    const netDirection =
      buyVolume > sellVolume * 1.2
        ? "bullish"
        : sellVolume > buyVolume * 1.2
        ? "bearish"
        : "neutral";

    // Unique wallets
    const uniqueWallets = [...new Set(whaleTrades.map((t) => t.maker))];
    const avgSize = totalVolume / whaleTrades.length;
    const convictionScore = uniqueWallets.length * avgSize;

    const signal: WhaleSignal = {
      marketId,
      whaleCount: uniqueWallets.length,
      netDirection,
      convictionScore,
      totalVolume,
      topWallets: uniqueWallets.slice(0, 5),
    };

    // Store signal in database
    await storeWhaleSignal(signal);

    return signal;
  } catch (error) {
    console.error(`[whale-tracker] Failed for ${conditionId}:`, error);
    return null;
  }
}

/**
 * Apply whale signal to a probability estimate
 *
 * +8% boost if whales agree with model direction
 * -2% penalty if whales disagree
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

  // Scale adjustment by conviction (more whales + bigger trades = stronger signal)
  const baseAdjustment = Math.min(0.08, signal.convictionScore / 1_000_000);

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

// --- Internal ---

interface Trade {
  id: string;
  maker: string;
  size: number;
  price: number;
  side: "buy" | "sell";
  timestamp: string;
}

async function fetchRecentTrades(conditionId: string): Promise<Trade[]> {
  try {
    // Use Gamma API activity endpoint
    const url = `${GAMMA_BASE_URL}/activity?market=${conditionId}&limit=100`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data
      .filter((t: Record<string, unknown>) => t.type === "trade" || t.action === "trade")
      .map((t: Record<string, unknown>) => ({
        id: String(t.id || ""),
        maker: String(t.maker || t.user || ""),
        size: Number(t.amount || t.size || 0),
        price: Number(t.price || 0),
        side: (String(t.side || t.action || "buy").toLowerCase().includes("sell")
          ? "sell"
          : "buy") as "buy" | "sell",
        timestamp: String(t.timestamp || t.createdAt || new Date().toISOString()),
      }))
      .filter((t: Trade) => t.size > 0);
  } catch {
    return [];
  }
}

async function storeWhaleSignal(signal: WhaleSignal): Promise<void> {
  try {
    await supabase.from("whale_signals").upsert(
      {
        market_id: signal.marketId,
        whale_count: signal.whaleCount,
        net_direction: signal.netDirection,
        conviction_score: signal.convictionScore,
        total_volume: signal.totalVolume,
        detected_at: new Date().toISOString(),
      },
      { onConflict: "market_id" }
    );
  } catch {
    // Table might not exist yet — that's OK
  }
}
