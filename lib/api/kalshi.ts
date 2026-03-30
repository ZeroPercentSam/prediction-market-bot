/**
 * Kalshi REST API Client
 *
 * Base URL: https://api.elections.kalshi.com/trade-api/v2
 * No authentication required for read-only market data.
 * Responses cached for 15s by CDN.
 */

const BASE_URL = "https://api.elections.kalshi.com/trade-api/v2";

// --- API Response Types ---

interface KalshiMarketsResponse {
  cursor: string;
  markets: KalshiMarket[];
}

interface KalshiEventsResponse {
  cursor: string;
  events: KalshiEvent[];
}

export interface KalshiMarket {
  ticker: string;
  title: string;
  event_ticker: string;
  status: string;
  market_type: string;
  result: string;
  last_price_dollars: string;
  yes_bid_dollars: string;
  yes_ask_dollars: string;
  no_bid_dollars: string;
  no_ask_dollars: string;
  previous_price_dollars: string;
  notional_value_dollars: string;
  volume_fp: string;
  volume_24h_fp: string;
  open_interest_fp: string;
  liquidity_dollars: string;
  yes_ask_size_fp: string;
  yes_bid_size_fp: string;
  open_time: string;
  close_time: string;
  expiration_time: string;
  expected_expiration_time: string;
  created_time: string;
  updated_time: string;
  yes_sub_title: string;
  no_sub_title: string;
  rules_primary: string;
  can_close_early: boolean;
  tick_size: number;
}

export interface KalshiEvent {
  event_ticker: string;
  title: string;
  sub_title: string;
  category: string;
  series_ticker: string;
  mutually_exclusive: boolean;
  markets?: KalshiMarket[];
}

// --- Parsed Market ---

export interface ParsedKalshiMarket {
  platformMarketId: string;
  question: string;
  description: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  openInterest: number;
  expiryDate: string;
  isActive: boolean;
  eventTicker: string;
}

/**
 * Fetch active markets from Kalshi
 */
export async function fetchKalshiMarkets(
  limit: number = 100,
  cursor?: string
): Promise<{ markets: ParsedKalshiMarket[]; nextCursor: string }> {
  const url = new URL(`${BASE_URL}/markets`);
  url.searchParams.set("status", "open");
  url.searchParams.set("limit", limit.toString());
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const response = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Kalshi API error: ${response.status} ${response.statusText}`
    );
  }

  const data: KalshiMarketsResponse = await response.json();

  return {
    markets: data.markets.map(parseKalshiMarket),
    nextCursor: data.cursor || "",
  };
}

/**
 * Fetch all active markets with pagination
 */
export async function fetchAllKalshiMarkets(
  maxMarkets: number = 500
): Promise<ParsedKalshiMarket[]> {
  const allMarkets: ParsedKalshiMarket[] = [];
  let cursor: string | undefined;

  while (allMarkets.length < maxMarkets) {
    const result = await fetchKalshiMarkets(100, cursor);
    if (result.markets.length === 0) break;
    allMarkets.push(...result.markets);
    cursor = result.nextCursor;
    if (!cursor) break;
  }

  return allMarkets.slice(0, maxMarkets);
}

/**
 * Fetch events with nested markets
 */
export async function fetchKalshiEvents(
  limit: number = 100,
  cursor?: string
): Promise<{ events: KalshiEvent[]; nextCursor: string }> {
  const url = new URL(`${BASE_URL}/events`);
  url.searchParams.set("status", "open");
  url.searchParams.set("with_nested_markets", "true");
  url.searchParams.set("limit", limit.toString());
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const response = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Kalshi API error: ${response.status} ${response.statusText}`
    );
  }

  const data: KalshiEventsResponse = await response.json();
  return {
    events: data.events,
    nextCursor: data.cursor || "",
  };
}

/**
 * Fetch order book for a specific market
 */
export async function fetchKalshiOrderBook(ticker: string) {
  const url = `${BASE_URL}/markets/${ticker}/orderbook`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Kalshi orderbook error: ${response.status}`);
  }

  return response.json();
}

// --- Helpers ---

function parseKalshiMarket(market: KalshiMarket): ParsedKalshiMarket {
  const yesBid = parseFloat(market.yes_bid_dollars || "0");
  const yesAsk = parseFloat(market.yes_ask_dollars || "0");
  const noBid = parseFloat(market.no_bid_dollars || "0");

  // Yes price is midpoint of bid/ask, or last trade price
  const yesPrice =
    yesBid && yesAsk
      ? (yesBid + yesAsk) / 2
      : parseFloat(market.last_price_dollars || "0");

  return {
    platformMarketId: market.ticker,
    question: market.title,
    description: market.rules_primary || "",
    category: "", // Kalshi categories come from the event level
    yesPrice,
    noPrice: 1 - yesPrice,
    bestBid: yesBid,
    bestAsk: yesAsk,
    spread: Math.max(0, yesAsk - yesBid),
    volume24h: parseFloat(market.volume_24h_fp || "0"),
    totalVolume: parseFloat(market.volume_fp || "0"),
    liquidity: parseFloat(market.liquidity_dollars || "0"),
    openInterest: parseFloat(market.open_interest_fp || "0"),
    expiryDate: market.expiration_time || market.close_time || "",
    isActive: market.status === "open" || market.status === "active",
    eventTicker: market.event_ticker,
  };
}
