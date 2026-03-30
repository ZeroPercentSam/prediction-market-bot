"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Loader2,
  Inbox,
  BarChart3,
  Layers,
} from "lucide-react";
import { useTrades, useLivePnl } from "@/lib/hooks/use-dashboard-data";

type StrategyFilter = "all" | "prediction" | "arbitrage" | "certainty";

function classifyStrategy(notes: string | null | undefined): string {
  if (!notes) return "prediction";
  if (notes.includes("arb_pair")) return "arbitrage";
  if (notes === "certainty_trade") return "certainty";
  return "prediction";
}

const STRATEGY_COLORS: Record<string, string> = {
  prediction: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  arbitrage: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  certainty: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded bg-zinc-800 animate-pulse" />
          <div className="h-4 w-72 rounded bg-zinc-800/60 animate-pulse" />
        </div>
        <div className="h-6 w-36 rounded bg-zinc-800 animate-pulse" />
      </div>
      <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="p-4 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 flex-1 rounded bg-zinc-800 animate-pulse" />
              <div className="h-4 w-20 rounded bg-zinc-800 animate-pulse" />
              <div className="h-4 w-16 rounded bg-zinc-800 animate-pulse" />
              <div className="h-4 w-24 rounded bg-zinc-800 animate-pulse" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function TradesPage() {
  const { data: trades, isLoading, error } = useTrades("filled", 100);
  const { data: livePnl } = useLivePnl();
  const [filter, setFilter] = useState<StrategyFilter>("all");

  if (isLoading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Active Trades</h1>
        <Card className="border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-red-400 text-sm">Failed to load trades: {(error as Error).message}</p>
        </Card>
      </div>
    );
  }

  const allTrades = trades ?? [];
  const openTrades =
    filter === "all"
      ? allTrades
      : allTrades.filter((t) => classifyStrategy(t.notes) === filter);

  const totalExposure = livePnl?.totalExposure ?? allTrades.reduce((sum, t) => sum + (t.position_size ?? 0), 0);
  const totalPnl = livePnl?.totalUnrealizedPnl ?? allTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  // Strategy counts for filter buttons
  const strategyCounts = allTrades.reduce(
    (acc, t) => {
      const s = classifyStrategy(t.notes);
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Build a lookup map from live P&L data for per-trade current prices
  const livePnlMap = new Map<string, { currentPrice: number; unrealizedPnl: number; unrealizedPnlPct: number }>();
  if (livePnl) {
    for (const t of livePnl.trades) {
      livePnlMap.set(t.tradeId, {
        currentPrice: t.currentPrice,
        unrealizedPnl: t.unrealizedPnl,
        unrealizedPnlPct: t.unrealizedPnlPct,
      });
    }
  }

  const filters: { key: StrategyFilter; label: string }[] = [
    { key: "all", label: `All (${allTrades.length})` },
    { key: "prediction", label: `Prediction (${strategyCounts.prediction ?? 0})` },
    { key: "arbitrage", label: `Arbitrage (${strategyCounts.arbitrage ?? 0})` },
    { key: "certainty", label: `Certainty (${strategyCounts.certainty ?? 0})` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Active Trades</h1>
          <p className="text-sm text-zinc-400">
            {allTrades.length} open position{allTrades.length !== 1 ? "s" : ""} | Total exposure: $
            {totalExposure.toLocaleString()}
          </p>
        </div>
        {allTrades.length > 0 && (
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
        )}
      </div>

      {/* Live P&L Summary */}
      {allTrades.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
              <BarChart3 className="h-3 w-3" />
              Unrealized P&L
            </div>
            <div
              className={`text-2xl font-bold font-mono ${
                totalPnl >= 0 ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
            </div>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/50 p-4">
            <div className="text-xs text-zinc-400 mb-1">Total Exposure</div>
            <div className="text-2xl font-bold font-mono text-white">
              ${totalExposure.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/50 p-4">
            <div className="text-xs text-zinc-400 mb-1">Open Positions</div>
            <div className="text-2xl font-bold font-mono text-white">
              {livePnl?.tradeCount ?? allTrades.length}
            </div>
          </Card>
        </div>
      )}

      {/* Strategy Filter Buttons */}
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-zinc-500" />
        <span className="text-xs text-zinc-500 mr-1">Strategy:</span>
        {filters.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "default" : "secondary"}
            size="sm"
            className={`text-xs h-7 ${
              filter === f.key ? "" : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {openTrades.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900/50 p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <Inbox className="h-10 w-10 text-zinc-600 mb-3" />
            <p className="text-sm font-medium text-zinc-400">
              {filter === "all"
                ? "No open positions"
                : `No ${filter} trades`}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {filter === "all"
                ? "Trades will appear here once the pipeline generates and fills signals."
                : "Try a different filter or wait for the bot to place trades."}
            </p>
          </div>
        </Card>
      ) : (
        <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-3 font-medium text-zinc-400">Market</th>
                  <th className="px-4 py-3 font-medium text-zinc-400">Strategy</th>
                  <th className="px-4 py-3 font-medium text-zinc-400">Direction</th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                    Entry Price
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                    Current Price
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                    Position Size
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                    Unrealized P&L
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                    P&L %
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-400">Status</th>
                  <th className="px-4 py-3 font-medium text-zinc-400">Opened</th>
                </tr>
              </thead>
              <tbody>
                {openTrades.map((trade) => {
                  const live = livePnlMap.get(trade.id);
                  const pnl = live?.unrealizedPnl ?? (trade.pnl ?? 0);
                  const pnlPct = live?.unrealizedPnlPct ?? (trade.pnl_pct ?? 0);
                  const currentPrice = live?.currentPrice ?? null;
                  const strategy = classifyStrategy(trade.notes);

                  return (
                    <tr
                      key={trade.id}
                      className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-white max-w-xs truncate">
                        {trade.markets?.question ?? "Unknown market"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={`text-xs capitalize ${STRATEGY_COLORS[strategy]}`}
                        >
                          {strategy}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={`text-xs ${
                            trade.direction === "buy_yes"
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : "bg-red-500/10 text-red-500 border-red-500/20"
                          }`}
                        >
                          {trade.direction === "buy_yes" ? "BUY YES" : "BUY NO"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">
                        ${(trade.entry_price ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">
                        {currentPrice != null ? (
                          <span
                            className={
                              currentPrice > (trade.entry_price ?? 0)
                                ? "text-emerald-400"
                                : currentPrice < (trade.entry_price ?? 0)
                                ? "text-red-400"
                                : "text-zinc-300"
                            }
                          >
                            ${currentPrice.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-zinc-500">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">
                        <div>${(trade.position_size ?? 0).toLocaleString()}</div>
                        <div className="text-xs text-zinc-500">
                          {((trade.position_size_pct ?? 0) * 100).toFixed(1)}% of bankroll
                        </div>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-semibold ${
                          pnl >= 0 ? "text-emerald-500" : "text-red-500"
                        }`}
                      >
                        {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono text-xs ${
                          pnlPct >= 0 ? "text-emerald-500" : "text-red-500"
                        }`}
                      >
                        {pnlPct >= 0 ? "+" : ""}
                        {pnlPct.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-xs capitalize">
                          <Activity className="h-3 w-3 mr-1" />
                          {trade.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {trade.created_at ? formatRelativeTime(trade.created_at) : "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
