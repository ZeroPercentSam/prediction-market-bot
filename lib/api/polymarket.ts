/**
 * Polymarket API Client
 *
 * Uses the Gamma API for enriched market data (prices, volume, liquidity, price changes)
 * Uses the CLOB API for order book depth when needed
 *
 * No authentication required for read-only access.
 */

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const CLOB_BASE_URL = "https://clob.polymarket.com";

// --- Gamma API Types ---

export interface GammaMarket {
  id: string;
  question: string;
  slug: string;
  conditionId: string;
  outcomes: string; // JSON string: '["Yes", "No"]'
  outcomePrices: string; // JSON string: '["0.0975", "0.9025"]'
  bestBid: number;
  bestAsk: number;
  lastTradePrice: number;
  spread: number;
  volume: string;
  volumeNum: number;
  volume24hr: number;
  volume1wk: number;
  volume1mo: number;
  liquidity: string;
  liquidityNum: number;
  oneDayPriceChange: number;
  oneHourPriceChange: number;
  oneWeekPriceChange: number;
  clobTokenIds: string; // JSON string
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
  endDateIso: string;
  startDateIso: string;
  description: string;
  image: string;
  icon: string;
}

// --- Parsed Market ---

export interface ParsedPolymarketMarket {
  platformMarketId: string;
  question: string;
  description: string;
  yesPrice: number;
  noPrice: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  priceChange1h: number;
  priceChange24h: number;
  expiryDate: string;
  isActive: boolean;
  tokenIds: string[];
}

/**
 * Fetch active markets from Polymarket Gamma API
 */
export async function fetchPolymarketMarkets(
  limit: number = 100,
  offset: number = 0
): Promise<ParsedPolymarketMarket[]> {
  const url = new URL(`${GAMMA_BASE_URL}/markets`);
  url.searchParams.set("closed", "false");
  url.searchParams.set("active", "true");
  url.searchParams.set("limit", limit.toString());
  url.searchParams.set("offset", offset.toString());
  url.searchParams.set("order", "volume24hr");
  url.searchParams.set("ascending", "false");

  const response = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Polymarket API error: ${response.status} ${response.statusText}`
    );
  }

  const markets: GammaMarket[] = await response.json();
  return markets.map(parseGammaMarket);
}

/**
 * Fetch all active markets with pagination
 */
export async function fetchAllPolymarketMarkets(
  maxMarkets: number = 500
): Promise<ParsedPolymarketMarket[]> {
  const allMarkets: ParsedPolymarketMarket[] = [];
  const pageSize = 100;
  let offset = 0;

  while (allMarkets.length < maxMarkets) {
    const batch = await fetchPolymarketMarkets(pageSize, offset);
    if (batch.length === 0) break;
    allMarkets.push(...batch);
    offset += pageSize;
    if (batch.length < pageSize) break;
  }

  return allMarkets.slice(0, maxMarkets);
}

/**
 * Fetch order book for a specific token
 */
export async function fetchOrderBook(tokenId: string) {
  const url = `${CLOB_BASE_URL}/book?token_id=${tokenId}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`CLOB API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch midpoint price for a token
 */
export async function fetchMidpoint(tokenId: string): Promise<number> {
  const url = `${CLOB_BASE_URL}/midpoint?token_id=${tokenId}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`CLOB API error: ${response.status}`);
  }

  const data = await response.json();
  return parseFloat(data.mid);
}

// --- Helpers ---

function parseGammaMarket(market: GammaMarket): ParsedPolymarketMarket {
  let yesPrice = 0;
  let noPrice = 0;
  let tokenIds: string[] = [];

  try {
    const prices = JSON.parse(market.outcomePrices || "[]");
    yesPrice = parseFloat(prices[0] || "0");
    noPrice = parseFloat(prices[1] || "0");
  } catch {
    // Fall back to bestBid/bestAsk
    yesPrice = market.bestBid || 0;
    noPrice = 1 - yesPrice;
  }

  try {
    tokenIds = JSON.parse(market.clobTokenIds || "[]");
  } catch {
    tokenIds = [];
  }

  return {
    platformMarketId: market.conditionId,
    question: market.question,
    description: market.description || "",
    yesPrice,
    noPrice,
    bestBid: market.bestBid || 0,
    bestAsk: market.bestAsk || 0,
    spread: market.spread || 0,
    volume24h: market.volume24hr || 0,
    totalVolume: market.volumeNum || 0,
    liquidity: market.liquidityNum || 0,
    priceChange1h: market.oneHourPriceChange || 0,
    priceChange24h: market.oneDayPriceChange || 0,
    expiryDate: market.endDateIso || "",
    isActive: market.active && !market.closed,
    tokenIds,
  };
}
