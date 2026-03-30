"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Inbox, Loader2 } from "lucide-react";
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

const classificationConfig: Record<
  string,
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
    className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
};

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded bg-zinc-800 animate-pulse" />
          <div className="h-4 w-80 rounded bg-zinc-800/60 animate-pulse" />
        </div>
        <div className="h-6 w-24 rounded bg-zinc-800 animate-pulse" />
      </div>
      <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="p-4 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 flex-1 rounded bg-zinc-800 animate-pulse" />
              <div className="h-4 w-16 rounded bg-zinc-800 animate-pulse" />
              <div className="h-4 w-16 rounded bg-zinc-800 animate-pulse" />
              <div className="h-4 w-20 rounded bg-zinc-800 animate-pulse" />
              <div className="h-4 w-28 rounded bg-zinc-800 animate-pulse" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function HistoryPage() {
  const { data: trades, isLoading, error } = useTrades("settled", 50);

  if (isLoading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Trade History</h1>
        <Card className="border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-red-400 text-sm">Failed to load history: {(error as Error).message}</p>
        </Card>
      </div>
    );
  }

  const settledTrades = trades ?? [];
  const totalPnl = settledTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const wins = settledTrades.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = settledTrades.length > 0 ? (wins / settledTrades.length) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trade History</h1>
          <p className="text-sm text-zinc-400">
            {settledTrades.length} closed trade{settledTrades.length !== 1 ? "s" : ""} | Win rate:{" "}
            {winRate.toFixed(0)}% | Total P&L:{" "}
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

      {settledTrades.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900/50 p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <Inbox className="h-10 w-10 text-zinc-600 mb-3" />
            <p className="text-sm font-medium text-zinc-400">No settled trades yet</p>
            <p className="text-xs text-zinc-500 mt-1">
              Settled trades will appear here once positions are closed.
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
                {settledTrades.map((trade) => {
                  const config =
                    classificationConfig[trade.classification ?? ""] ?? {
                      label: trade.classification ?? "Unknown",
                      className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
                    };
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
                        ${(trade.fill_price ?? 0).toFixed(2)}
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
                            {trade.pnl_pct.toFixed(1)}%
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${config.className}`}>
                          {config.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {trade.settled_at
                          ? new Date(trade.settled_at).toLocaleDateString()
                          : "--"}
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
