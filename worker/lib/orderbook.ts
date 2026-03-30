/**
 * Orderbook Flow Analysis
 *
 * Uses clob.polymarket.com/book for full depth orderbook data.
 * Detects:
 * - Order flow imbalance (bid vs ask pressure)
 * - Large resting orders (walls)
 * - Spread changes
 * - VWAP divergence from last trade
 *
 * These signals predict price direction 30s to 5min before moves.
 */

import { supabase } from "./config.js";

const CLOB_API = "https://clob.polymarket.com";

export interface OrderbookAnalysis {
  marketId: string;
  tokenId: string;
  bidDepthUsd: number;
  askDepthUsd: number;
  imbalance: number; // -1 (all asks) to +1 (all bids)
  spread: number;
  midPrice: number;
  lastTradePrice: number;
  vwapBid: number;
  vwapAsk: number;
  largestBid: { price: number; size: number };
  largestAsk: { price: number; size: number };
  bidLevels: number;
  askLevels: number;
  signal: "bullish" | "bearish" | "neutral";
  signalStrength: number; // 0 to 1
}

/**
 * Analyze orderbook for a specific token
 */
export async function analyzeOrderbook(
  tokenId: string,
  marketId: string
): Promise<OrderbookAnalysis | null> {
  try {
    const url = `${CLOB_API}/book?token_id=${tokenId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

    if (!res.ok) return null;
    const book = await res.json();

    const bids: Array<{ price: number; size: number }> = (book.bids || []).map(
      (b: { price: string; size: string }) => ({
        price: parseFloat(b.price),
        size: parseFloat(b.size),
      })
    );

    const asks: Array<{ price: number; size: number }> = (book.asks || []).map(
      (a: { price: string; size: string }) => ({
        price: parseFloat(a.price),
        size: parseFloat(a.size),
      })
    );

    if (bids.length === 0 && asks.length === 0) return null;

    // Calculate depth (total USD on each side)
    const bidDepthUsd = bids.reduce((s, b) => s + b.price * b.size, 0);
    const askDepthUsd = asks.reduce((s, a) => s + a.price * a.size, 0);
    const totalDepth = bidDepthUsd + askDepthUsd;

    // Imbalance: -1 (all asks) to +1 (all bids)
    const imbalance =
      totalDepth > 0 ? (bidDepthUsd - askDepthUsd) / totalDepth : 0;

    // Spread
    const bestBid = bids.length > 0 ? bids[0].price : 0;
    const bestAsk = asks.length > 0 ? asks[0].price : 1;
    const spread = bestAsk - bestBid;
    const midPrice = (bestBid + bestAsk) / 2;

    // VWAP (volume-weighted average price for top 10 levels)
    const topBids = bids.slice(0, 10);
    const topAsks = asks.slice(0, 10);
    const bidVol = topBids.reduce((s, b) => s + b.size, 0);
    const askVol = topAsks.reduce((s, a) => s + a.size, 0);
    const vwapBid =
      bidVol > 0
        ? topBids.reduce((s, b) => s + b.price * b.size, 0) / bidVol
        : 0;
    const vwapAsk =
      askVol > 0
        ? topAsks.reduce((s, a) => s + a.price * a.size, 0) / askVol
        : 0;

    // Find largest resting orders
    const largestBid = bids.reduce(
      (max, b) => (b.size > max.size ? b : max),
      { price: 0, size: 0 }
    );
    const largestAsk = asks.reduce(
      (max, a) => (a.size > max.size ? a : max),
      { price: 0, size: 0 }
    );

    // Last trade price
    const lastTradePrice = parseFloat(book.last_trade_price || "0") || midPrice;

    // Signal determination
    let signal: "bullish" | "bearish" | "neutral" = "neutral";
    let signalStrength = 0;

    // Strong imbalance = signal
    if (Math.abs(imbalance) > 0.2) {
      signal = imbalance > 0 ? "bullish" : "bearish";
      signalStrength = Math.min(1, Math.abs(imbalance));
    }

    // VWAP divergence reinforces signal
    if (vwapBid > 0 && vwapAsk > 0) {
      const vwapMid = (vwapBid + vwapAsk) / 2;
      if (vwapMid > midPrice * 1.01) {
        // VWAP above mid = hidden buying pressure
        if (signal === "bullish") signalStrength = Math.min(1, signalStrength + 0.2);
        else if (signal === "neutral") {
          signal = "bullish";
          signalStrength = 0.3;
        }
      } else if (vwapMid < midPrice * 0.99) {
        if (signal === "bearish") signalStrength = Math.min(1, signalStrength + 0.2);
        else if (signal === "neutral") {
          signal = "bearish";
          signalStrength = 0.3;
        }
      }
    }

    const analysis: OrderbookAnalysis = {
      marketId,
      tokenId,
      bidDepthUsd,
      askDepthUsd,
      imbalance,
      spread,
      midPrice,
      lastTradePrice,
      vwapBid,
      vwapAsk,
      largestBid,
      largestAsk,
      bidLevels: bids.length,
      askLevels: asks.length,
      signal,
      signalStrength,
    };

    // Store snapshot (non-fatal)
    try {
      await supabase.from("orderbook_snapshots").insert({
        market_id: marketId,
        bid_depth: bidDepthUsd,
        ask_depth: askDepthUsd,
        imbalance,
        spread,
        mid_price: midPrice,
        last_trade_price: lastTradePrice,
        vwap_bid: vwapBid,
        vwap_ask: vwapAsk,
        bid_levels: bids.length,
        ask_levels: asks.length,
        signal,
        signal_strength: signalStrength,
      });
    } catch { /* non-fatal */ }

    return analysis;
  } catch (error) {
    console.warn(
      `[orderbook] Failed for ${tokenId}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Apply orderbook signal to probability estimate
 * Subtle adjustment — orderbook signals are short-term
 */
export function applyOrderbookAdjustment(
  probability: number,
  analysis: OrderbookAnalysis | null
): { adjustedProbability: number; orderbookAdjustment: number } {
  if (!analysis || analysis.signal === "neutral" || analysis.signalStrength < 0.3) {
    return { adjustedProbability: probability, orderbookAdjustment: 0 };
  }

  // Max 3% adjustment from orderbook (short-term signal)
  const maxAdjust = 0.03;
  const adjustment =
    analysis.signal === "bullish"
      ? maxAdjust * analysis.signalStrength
      : -maxAdjust * analysis.signalStrength;

  const adjusted = Math.max(0.01, Math.min(0.99, probability + adjustment));
  return { adjustedProbability: adjusted, orderbookAdjustment: adjustment };
}
