import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import type { TradeDirection, TradeClassification, Platform } from "@/types";

// Mock data — will be replaced with Supabase queries
const mockHistory = [
  {
    id: "h1",
    market: "Will ETH merge to PoS by March 2026?",
    platform: "polymarket" as Platform,
    direction: "buy_yes" as TradeDirection,
    entryPrice: 0.72,
    exitPrice: 1.0,
    pnl: 140.0,
    pnlPct: 38.89,
    positionSize: 500,
    classification: "correct_profitable" as TradeClassification,
    settledAt: "2026-03-15T00:00:00Z",
    createdAt: "2026-02-20T10:30:00Z",
  },
  {
    id: "h2",
    market: "US GDP growth above 3% in Q4 2025?",
    platform: "kalshi" as Platform,
    direction: "buy_yes" as TradeDirection,
    entryPrice: 0.55,
    exitPrice: 0.0,
    pnl: -275.0,
    pnlPct: -100.0,
    positionSize: 275,
    classification: "incorrect_prediction" as TradeClassification,
    settledAt: "2026-01-30T00:00:00Z",
    createdAt: "2025-12-15T08:00:00Z",
  },
  {
    id: "h3",
    market: "Apple stock above $250 by Feb 2026?",
    platform: "kalshi" as Platform,
    direction: "buy_no" as TradeDirection,
    entryPrice: 0.45,
    exitPrice: 1.0,
    pnl: 220.0,
    pnlPct: 122.22,
    positionSize: 400,
    classification: "correct_profitable" as TradeClassification,
    settledAt: "2026-02-28T00:00:00Z",
    createdAt: "2026-01-10T14:20:00Z",
  },
  {
    id: "h4",
    market: "Fed rate hike in Jan 2026?",
    platform: "polymarket" as Platform,
    direction: "buy_yes" as TradeDirection,
    entryPrice: 0.18,
    exitPrice: 0.0,
    pnl: -54.0,
    pnlPct: -100.0,
    positionSize: 54,
    classification: "edge_disappeared" as TradeClassification,
    settledAt: "2026-01-31T00:00:00Z",
    createdAt: "2026-01-05T11:00:00Z",
  },
  {
    id: "h5",
    market: "Bitcoin ETF daily volume exceeds $5B in Feb?",
    platform: "polymarket" as Platform,
    direction: "buy_yes" as TradeDirection,
    entryPrice: 0.62,
    exitPrice: 1.0,
    pnl: 76.0,
    pnlPct: 61.29,
    positionSize: 200,
    classification: "correct_unprofitable" as TradeClassification,
    settledAt: "2026-02-28T00:00:00Z",
    createdAt: "2026-02-01T09:45:00Z",
  },
];

const classificationConfig: Record<
  TradeClassification,
  { label: string; className: string }
> = {
  correct_profitable: {
    label: "Correct & Profitable",
    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  },
  correct_unprofitable: {
    label: "Correct, Low Profit",
    className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
  incorrect_prediction: {
    label: "Incorrect Prediction",
    className: "bg-red-500/10 text-red-500 border-red-500/20",
  },
  edge_disappeared: {
    label: "Edge Disappeared",
    className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  },
};

export default function HistoryPage() {
  const totalPnl = mockHistory.reduce((sum, t) => sum + t.pnl, 0);
  const wins = mockHistory.filter((t) => t.pnl > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trade History</h1>
          <p className="text-sm text-zinc-400">
            {mockHistory.length} closed trades | Win rate:{" "}
            {((wins / mockHistory.length) * 100).toFixed(0)}% | Total P&L:{" "}
            <span
              className={totalPnl >= 0 ? "text-emerald-500" : "text-red-500"}
            >
              {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
            </span>
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" />
          All time
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
                  Entry
                </th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                  Exit
                </th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                  P&L
                </th>
                <th className="px-4 py-3 font-medium text-zinc-400">
                  Classification
                </th>
                <th className="px-4 py-3 font-medium text-zinc-400">Settled</th>
              </tr>
            </thead>
            <tbody>
              {mockHistory.map((trade) => {
                const config = classificationConfig[trade.classification];
                return (
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
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">
                      ${trade.exitPrice.toFixed(2)}
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
                        {trade.pnlPct.toFixed(1)}%
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs ${config.className}`}>
                        {config.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {new Date(trade.settledAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
