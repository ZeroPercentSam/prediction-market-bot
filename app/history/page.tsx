"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Inbox, Layers } from "lucide-react";
import { useTrades } from "@/lib/hooks/use-dashboard-data";

type StatusFilter = "all" | "filled" | "settled";

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
    label: "Incorrect",
    className: "bg-red-500/10 text-red-500 border-red-500/20",
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const { data: trades, isLoading, error } = useTrades(
    statusFilter === "all" ? undefined : statusFilter,
    100
  );

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

  const allTrades = trades ?? [];
  const settledTrades = allTrades.filter((t) => t.status === "settled");
  const totalPnl = settledTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const wins = settledTrades.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = settledTrades.length > 0 ? (wins / settledTrades.length) * 100 : 0;

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: `All (${allTrades.length})` },
    { key: "filled", label: "Open" },
    { key: "settled", label: "Settled" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trade History</h1>
          <p className="text-sm text-zinc-400">
            {allTrades.length} total trade{allTrades.length !== 1 ? "s" : ""} |{" "}
            {settledTrades.length} settled | Win rate: {winRate.toFixed(0)}% | Realized P&L:{" "}
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

      {/* Status Filter */}
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-zinc-500" />
        <span className="text-xs text-zinc-500 mr-1">Status:</span>
        {statusFilters.map((f) => (
          <Button
            key={f.key}
            variant={statusFilter === f.key ? "default" : "secondary"}
            size="sm"
            className={`text-xs h-7 ${
              statusFilter === f.key ? "" : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {allTrades.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900/50 p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <Inbox className="h-10 w-10 text-zinc-600 mb-3" />
            <p className="text-sm font-medium text-zinc-400">No trades yet</p>
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
                  <th className="px-4 py-3 font-medium text-zinc-400">Strategy</th>
                  <th className="px-4 py-3 font-medium text-zinc-400">Direction</th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">Entry</th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">Exit</th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">Size</th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right">P&L</th>
                  <th className="px-4 py-3 font-medium text-zinc-400">Status</th>
                  <th className="px-4 py-3 font-medium text-zinc-400">Date</th>
                </tr>
              </thead>
              <tbody>
                {allTrades.map((trade) => {
                  const strategy = classifyStrategy(trade.notes);
                  const isSettled = trade.status === "settled";
                  const classification = classificationConfig[trade.classification ?? ""];
                  const pnl = trade.pnl ?? 0;

                  return (
                    <tr
                      key={trade.id}
                      className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-white max-w-xs truncate">
                        {trade.markets?.question ?? "Unknown market"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs capitalize ${STRATEGY_COLORS[strategy]}`}>
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
                          {trade.direction === "buy_yes" ? "YES" : "NO"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">
                        ${(trade.entry_price ?? 0).toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">
                        {isSettled && trade.exit_price != null
                          ? `$${Number(trade.exit_price).toFixed(2)}`
                          : <span className="text-zinc-500">--</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">
                        ${(trade.position_size ?? 0).toFixed(0)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-semibold ${
                          pnl >= 0 ? "text-emerald-500" : "text-red-500"
                        }`}
                      >
                        <div>
                          {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                        </div>
                        {trade.pnl_pct != null && (
                          <div className="text-xs font-normal">
                            {Number(trade.pnl_pct) >= 0 ? "+" : ""}
                            {Number(trade.pnl_pct).toFixed(1)}%
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isSettled && classification ? (
                          <Badge className={`text-xs ${classification.className}`}>
                            {classification.label}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs capitalize">
                            {trade.status}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {trade.settled_at
                          ? new Date(trade.settled_at).toLocaleDateString()
                          : trade.created_at
                          ? formatRelativeTime(trade.created_at)
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
