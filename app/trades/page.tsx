"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, TrendingDown, Loader2, Inbox } from "lucide-react";
import { useTrades } from "@/lib/hooks/use-dashboard-data";

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
  const { data: trades, isLoading, error } = useTrades("filled", 50);

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

  const openTrades = trades ?? [];
  const totalExposure = openTrades.reduce((sum, t) => sum + (t.position_size ?? 0), 0);
  const totalPnl = openTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Active Trades</h1>
          <p className="text-sm text-zinc-400">
            {openTrades.length} open position{openTrades.length !== 1 ? "s" : ""} | Total exposure: $
            {totalExposure.toLocaleString()}
          </p>
        </div>
        {openTrades.length > 0 && (
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

      {openTrades.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900/50 p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <Inbox className="h-10 w-10 text-zinc-600 mb-3" />
            <p className="text-sm font-medium text-zinc-400">No open positions</p>
            <p className="text-xs text-zinc-500 mt-1">
              Trades will appear here once the pipeline generates and fills signals.
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
                  <th className="px-4 py-3 font-medium text-zinc-400">Direction</th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                    Entry Price
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                    Position Size
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                    Kelly f
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                    P&L
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-400">Status</th>
                  <th className="px-4 py-3 font-medium text-zinc-400">Opened</th>
                </tr>
              </thead>
              <tbody>
                {openTrades.map((trade) => (
                  <tr
                    key={trade.id}
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-white max-w-xs truncate">
                      {trade.markets?.question ?? "Unknown market"}
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
                      <div>${(trade.position_size ?? 0).toLocaleString()}</div>
                      <div className="text-xs text-zinc-500">
                        {((trade.position_size_pct ?? 0) * 100).toFixed(1)}% of bankroll
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">
                      {((trade.kelly_fraction ?? 0) * 100).toFixed(1)}%
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-semibold ${
                        (trade.pnl ?? 0) >= 0 ? "text-emerald-500" : "text-red-500"
                      }`}
                    >
                      <div>
                        {(trade.pnl ?? 0) >= 0 ? "+" : ""}${(trade.pnl ?? 0).toFixed(2)}
                      </div>
                      {trade.pnl_pct != null && (
                        <div className="text-xs font-normal">
                          {trade.pnl_pct >= 0 ? "+" : ""}
                          {trade.pnl_pct.toFixed(2)}%
                        </div>
                      )}
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
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
