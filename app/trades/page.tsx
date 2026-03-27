import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, TrendingDown } from "lucide-react";
import type { TradeDirection, TradeStatus, Platform } from "@/types";

// Mock data — will be replaced with Supabase queries
const mockTrades = [
  {
    id: "t1",
    market: "Will BTC exceed $100K by April 2026?",
    platform: "polymarket" as Platform,
    direction: "buy_yes" as TradeDirection,
    entryPrice: 0.42,
    currentPrice: 0.48,
    pnl: 72.0,
    pnlPct: 14.29,
    positionSize: 500,
    positionSizePct: 0.05,
    kellyFraction: 0.18,
    status: "filled" as TradeStatus,
    createdAt: "2026-03-25T14:30:00Z",
  },
  {
    id: "t2",
    market: "Fed rate cut in May 2026?",
    platform: "kalshi" as Platform,
    direction: "buy_no" as TradeDirection,
    entryPrice: 0.37,
    currentPrice: 0.41,
    pnl: 32.4,
    pnlPct: 10.81,
    positionSize: 300,
    positionSizePct: 0.03,
    kellyFraction: 0.12,
    status: "filled" as TradeStatus,
    createdAt: "2026-03-26T09:15:00Z",
  },
  {
    id: "t3",
    market: "S&P 500 above 6000 by end of Q2?",
    platform: "kalshi" as Platform,
    direction: "buy_yes" as TradeDirection,
    entryPrice: 0.55,
    currentPrice: 0.52,
    pnl: -21.82,
    pnlPct: -5.45,
    positionSize: 400,
    positionSizePct: 0.04,
    kellyFraction: 0.14,
    status: "filled" as TradeStatus,
    createdAt: "2026-03-26T16:45:00Z",
  },
];

export default function TradesPage() {
  const totalExposure = mockTrades.reduce((sum, t) => sum + t.positionSize, 0);
  const totalPnl = mockTrades.reduce((sum, t) => sum + t.pnl, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Active Trades</h1>
          <p className="text-sm text-zinc-400">
            {mockTrades.length} open positions | Total exposure: $
            {totalExposure.toLocaleString()}
          </p>
        </div>
        <Badge
          className={`gap-1 ${
            totalPnl >= 0
              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
              : "bg-red-500/10 text-red-500 border-red-500/20"
          }`}
        >
          {totalPnl >= 0 ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          Total P&L: {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
        </Badge>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="px-4 py-3 font-medium text-zinc-400">Market</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Platform</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Direction</th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                  Entry Price
                </th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                  Current Price
                </th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                  P&L
                </th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                  Position Size
                </th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                  Kelly f
                </th>
                <th className="px-4 py-3 font-medium text-zinc-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {mockTrades.map((trade) => (
                <tr
                  key={trade.id}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                >
                  <td className="px-4 py-3 text-white max-w-xs truncate">
                    {trade.market}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs capitalize">
                      {trade.platform}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      className={`text-xs ${
                        trade.direction === "buy_yes"
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                      }`}
                    >
                      {trade.direction === "buy_yes" ? "BUY YES" : "BUY NO"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-300">
                    ${trade.entryPrice.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white">
                    ${trade.currentPrice.toFixed(2)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono font-semibold ${
                      trade.pnl >= 0 ? "text-emerald-500" : "text-red-500"
                    }`}
                  >
                    <div>
                      {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                    </div>
                    <div className="text-xs font-normal">
                      {trade.pnlPct >= 0 ? "+" : ""}
                      {trade.pnlPct.toFixed(2)}%
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-300">
                    <div>${trade.positionSize.toLocaleString()}</div>
                    <div className="text-xs text-zinc-500">
                      {(trade.positionSizePct * 100).toFixed(1)}% of bankroll
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-300">
                    {(trade.kellyFraction * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="text-xs capitalize">
                      <Activity className="h-3 w-3 mr-1" />
                      {trade.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
