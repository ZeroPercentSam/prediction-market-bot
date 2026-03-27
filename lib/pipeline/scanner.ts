import {
  fetchAllPolymarketMarkets,
  type ParsedPolymarketMarket,
} from "@/lib/api/polymarket";
import {
  fetchAllKalshiMarkets,
  type ParsedKalshiMarket,
} from "@/lib/api/kalshi";
import {
  upsertMarkets,
  insertMarketSnapshots,
  insertAnomalies,
  getActiveMarkets,
} from "@/lib/supabase/queries";
import type { Anomaly } from "@/types";

interface ScanConfig {
  minVolume: number;
  maxExpiryDays: number;
  priceSpikePct: number;   // anomaly threshold for 1h price change
  spreadThreshold: number; // anomaly threshold for spread in cents
  volumeSpikeMultiplier: number; // volume surge multiplier
}

const DEFAULT_SCAN_CONFIG: ScanConfig = {
  minVolume: 200,
  maxExpiryDays: 30,
  priceSpikePct: 10,
  spreadThreshold: 5,
  volumeSpikeMultiplier: 3,
};

export interface ScanResult {
  totalScanned: number;
  polymarketCount: number;
  kalshiCount: number;
  passedFilters: number;
  anomaliesDetected: number;
}

/**
 * Main scanner function — fetches markets from both platforms,
 * filters them, detects anomalies, and stores everything in Supabase.
 */
export async function runMarketScan(
  config: Partial<ScanConfig> = {}
): Promise<ScanResult> {
  const cfg = { ...DEFAULT_SCAN_CONFIG, ...config };

  // Fetch from both platforms in parallel
  const [polymarkets, kalshiMarkets] = await Promise.all([
    fetchAllPolymarketMarkets(300).catch((err) => {
      console.error("Polymarket fetch failed:", err);
      return [] as ParsedPolymarketMarket[];
    }),
    fetchAllKalshiMarkets(300).catch((err) => {
      console.error("Kalshi fetch failed:", err);
      return [] as ParsedKalshiMarket[];
    }),
  ]);

  const totalScanned = polymarkets.length + kalshiMarkets.length;

  // Normalize to common format and apply filters
  const normalizedPoly = polymarkets
    .filter((m) => filterMarket(m.volume24h, m.expiryDate, cfg))
    .map((m) => normalizePolymarket(m));

  const normalizedKalshi = kalshiMarkets
    .filter((m) => filterMarket(m.volume24h, m.expiryDate, cfg))
    .map((m) => normalizeKalshi(m));

  const allFiltered = [...normalizedPoly, ...normalizedKalshi];

  // Upsert markets into Supabase
  let upserted: { id: string; platform_market_id: string }[] = [];
  if (allFiltered.length > 0) {
    upserted = await upsertMarkets(allFiltered);
  }

  // Create ID map for snapshots and anomalies
  const idMap = new Map<string, string>();
  for (const row of upserted) {
    idMap.set(row.platform_market_id, row.id);
  }

  // Insert price snapshots
  const snapshots = allFiltered
    .map((m) => {
      const dbId = idMap.get(m.platformMarketId);
      if (!dbId) return null;
      return {
        marketId: dbId,
        yesPrice: m.currentYesPrice,
        noPrice: m.currentNoPrice,
        volume: m.volume24h,
        liquidity: m.liquidity,
      };
    })
    .filter(Boolean) as {
    marketId: string;
    yesPrice: number;
    noPrice: number;
    volume: number;
    liquidity: number;
  }[];

  if (snapshots.length > 0) {
    await insertMarketSnapshots(snapshots);
  }

  // Detect anomalies
  const anomalies = detectAnomalies(allFiltered, idMap, cfg);
  if (anomalies.length > 0) {
    await insertAnomalies(anomalies);
  }

  return {
    totalScanned,
    polymarketCount: polymarkets.length,
    kalshiCount: kalshiMarkets.length,
    passedFilters: allFiltered.length,
    anomaliesDetected: anomalies.length,
  };
}

// --- Filters ---

function filterMarket(
  volume24h: number,
  expiryDate: string,
  cfg: ScanConfig
): boolean {
  // Minimum volume filter
  if (volume24h < cfg.minVolume) return false;

  // Max expiry filter
  if (expiryDate) {
    const expiry = new Date(expiryDate);
    const now = new Date();
    const daysUntilExpiry =
      (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysUntilExpiry > cfg.maxExpiryDays) return false;
    if (daysUntilExpiry < 0) return false; // Already expired
  }

  return true;
}

// --- Anomaly Detection ---

function detectAnomalies(
  markets: Array<{
    platformMarketId: string;
    priceChange1h: number;
    spreadCents: number;
    volume24h: number;
  }>,
  idMap: Map<string, string>,
  cfg: ScanConfig
): Omit<Anomaly, "id" | "detectedAt">[] {
  const anomalies: Omit<Anomaly, "id" | "detectedAt">[] = [];

  for (const market of markets) {
    const dbId = idMap.get(market.platformMarketId);
    if (!dbId) continue;

    // Price spike detection
    const absChange = Math.abs(market.priceChange1h * 100);
    if (absChange > cfg.priceSpikePct) {
      anomalies.push({
        marketId: dbId,
        type: "price_spike",
        severity: absChange > 20 ? "high" : absChange > 15 ? "medium" : "low",
        description: `Price moved ${market.priceChange1h > 0 ? "+" : ""}${(market.priceChange1h * 100).toFixed(1)}% in 1 hour`,
        value: absChange,
        threshold: cfg.priceSpikePct,
      });
    }

    // Wide spread detection
    const spreadCents = market.spreadCents;
    if (spreadCents > cfg.spreadThreshold) {
      anomalies.push({
        marketId: dbId,
        type: "spread_wide",
        severity:
          spreadCents > 10 ? "high" : spreadCents > 7 ? "medium" : "low",
        description: `Bid-ask spread is ${spreadCents.toFixed(1)} cents`,
        value: spreadCents,
        threshold: cfg.spreadThreshold,
      });
    }

    // Volume surge detection (simple: flag if 24h volume > totalVolume * multiplier threshold)
    // In production, compare against historical average
    if (market.volume24h > 50000) {
      // Only flag high-volume markets as surges for now
      anomalies.push({
        marketId: dbId,
        type: "volume_surge",
        severity:
          market.volume24h > 200000
            ? "high"
            : market.volume24h > 100000
            ? "medium"
            : "low",
        description: `24h volume is $${(market.volume24h / 1000).toFixed(0)}K`,
        value: market.volume24h,
        threshold: 50000,
      });
    }
  }

  return anomalies;
}

// --- Normalizers ---

function normalizePolymarket(m: ParsedPolymarketMarket) {
  return {
    platform: "polymarket" as const,
    platformMarketId: m.platformMarketId,
    question: m.question,
    description: m.description,
    category: "other", // Polymarket doesn't provide structured categories
    currentYesPrice: m.yesPrice,
    currentNoPrice: m.noPrice,
    volume24h: m.volume24h,
    totalVolume: m.totalVolume,
    liquidity: m.liquidity,
    expiryDate: m.expiryDate,
    spreadCents: m.spread * 100, // Convert decimal to cents
    priceChange1h: m.priceChange1h,
    priceChange24h: m.priceChange24h,
    anomalyFlags: [] as string[],
    isActive: m.isActive,
    lastScanned: new Date().toISOString(),
  };
}

function normalizeKalshi(m: ParsedKalshiMarket) {
  return {
    platform: "kalshi" as const,
    platformMarketId: m.platformMarketId,
    question: m.question,
    description: m.description,
    category: m.category || "other",
    currentYesPrice: m.yesPrice,
    currentNoPrice: m.noPrice,
    volume24h: m.volume24h,
    totalVolume: m.totalVolume,
    liquidity: m.liquidity,
    expiryDate: m.expiryDate,
    spreadCents: m.spread * 100,
    priceChange1h: 0, // Kalshi doesn't provide 1h change directly
    priceChange24h: 0,
    anomalyFlags: [] as string[],
    isActive: m.isActive,
    lastScanned: new Date().toISOString(),
  };
}
