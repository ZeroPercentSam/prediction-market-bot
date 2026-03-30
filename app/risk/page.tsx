"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldAlert,
  AlertTriangle,
  Activity,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Zap,
  Loader2,
} from "lucide-react";
import { useRiskData, useLivePnl, useToggleKillSwitch } from "@/lib/hooks/use-dashboard-data";

export default function RiskPage() {
  const { data: risk, isLoading, error } = useRiskData();
  const { data: livePnl } = useLivePnl();
  const killSwitch = useToggleKillSwitch();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-500">Failed to load risk data: {error.message}</p>
      </div>
    );
  }

  if (!risk) return null;

  const totalUnrealized = livePnl?.totalUnrealizedPnl ?? 0;
  const combinedDailyPnl = risk.dailyPnl + totalUnrealized;
  const liveExposure = livePnl?.totalExposure ?? risk.totalExposure;
  const combinedDailyPnlPct = risk.bankroll > 0 ? (combinedDailyPnl / risk.bankroll) * 100 : 0;

  const dailyLossUsed = risk.bankroll
    ? Math.abs(combinedDailyPnl) / risk.bankroll
    : 0;
  const lossLimitProgress =
    risk.dailyLossLimitPct > 0
      ? (dailyLossUsed / risk.dailyLossLimitPct) * 100
      : 0;
  const exposurePct =
    risk.bankroll > 0 ? (liveExposure / risk.bankroll) * 100 : 0;
  const pnlIsNegative = combinedDailyPnl < 0;
  const PnlIcon = pnlIsNegative ? TrendingDown : TrendingUp;

  function handleKillSwitch() {
    killSwitch.mutate(!risk!.killSwitchActive);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Risk Dashboard</h1>
          <p className="text-sm text-zinc-400">
            Portfolio risk monitoring and kill switch controls
          </p>
        </div>
        {risk.killSwitchActive && (
          <Badge className="bg-red-500/10 text-red-500 border-red-500/20 gap-1">
            <ShieldAlert className="h-3 w-3" />
            KILL SWITCH ACTIVE
          </Badge>
        )}
      </div>

      {/* Exposure Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-zinc-400">Total Exposure</p>
            <DollarSign className="h-4 w-4 text-zinc-500" />
          </div>
          <p className="text-2xl font-bold text-white">
            ${liveExposure.toLocaleString()}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {exposurePct.toFixed(1)}% of bankroll
          </p>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-zinc-400">Open Positions</p>
            <Activity className="h-4 w-4 text-zinc-500" />
          </div>
          <p className="text-2xl font-bold text-white">
            {risk.openPositions}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Max: {risk.maxConcurrentPositions}
          </p>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-zinc-400">Value at Risk (VaR)</p>
            <AlertTriangle className="h-4 w-4 text-zinc-500" />
          </div>
          <p className="text-2xl font-bold text-amber-500">
            ${risk.varValue.toLocaleString()}
          </p>
          <p className="text-xs text-zinc-500 mt-1">95% confidence, 1-day</p>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-zinc-400">Daily P&L</p>
            <PnlIcon
              className={`h-4 w-4 ${pnlIsNegative ? "text-red-500" : "text-emerald-500"}`}
            />
          </div>
          <p
            className={`text-2xl font-bold ${pnlIsNegative ? "text-red-500" : "text-emerald-500"}`}
          >
            ${combinedDailyPnl.toFixed(2)}
          </p>
          <p
            className={`text-xs mt-1 ${pnlIsNegative ? "text-red-400" : "text-emerald-400"}`}
          >
            {combinedDailyPnlPct.toFixed(2)}% of bankroll
            {totalUnrealized !== 0 && ` (${totalUnrealized >= 0 ? "+" : ""}$${totalUnrealized.toFixed(2)} unrealized)`}
          </p>
        </Card>
      </div>

      {/* Daily Loss Limit Progress */}
      <Card className="border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-400">
            Daily Loss Limit
          </h3>
          <span className="text-sm font-mono text-zinc-300">
            {(dailyLossUsed * 100).toFixed(2)}% /{" "}
            {(risk.dailyLossLimitPct * 100).toFixed(0)}%
          </span>
        </div>
        <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              lossLimitProgress > 75
                ? "bg-red-500"
                : lossLimitProgress > 50
                  ? "bg-amber-500"
                  : "bg-emerald-500"
            }`}
            style={{ width: `${Math.min(lossLimitProgress, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-zinc-500">0%</span>
          <span className="text-xs text-zinc-500">
            Kill switch at{" "}
            {(risk.dailyLossLimitPct * 100).toFixed(0)}%
          </span>
        </div>
      </Card>

      {/* Exposure by Platform & Position Limits */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <h3 className="text-sm font-medium text-zinc-400 mb-4">
            Exposure by Platform
          </h3>
          <div className="space-y-3">
            {Object.keys(risk.exposureByPlatform).length === 0 ? (
              <p className="text-sm text-zinc-500">No active positions</p>
            ) : (
              Object.entries(risk.exposureByPlatform).map(
                ([platform, amount]) => {
                  const total = Object.values(risk.exposureByPlatform).reduce(
                    (a, b) => a + b,
                    0
                  );
                  const pct = total > 0 ? (amount / total) * 100 : 0;
                  return (
                    <div key={platform}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-zinc-300 capitalize">
                          {platform}
                        </span>
                        <span className="text-sm font-mono text-zinc-400">
                          ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                }
              )
            )}
          </div>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <h3 className="text-sm font-medium text-zinc-400 mb-4">
            Position Limits
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <span className="text-sm text-zinc-300">
                Max Position Size
              </span>
              <span className="text-sm font-mono text-white">
                {(risk.maxPositionSizePct * 100).toFixed(0)}% of bankroll
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <span className="text-sm text-zinc-300">
                Max Concurrent Positions
              </span>
              <span className="text-sm font-mono text-white">
                {risk.maxConcurrentPositions}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <span className="text-sm text-zinc-300">
                Daily Loss Limit
              </span>
              <span className="text-sm font-mono text-white">
                {(risk.dailyLossLimitPct * 100).toFixed(0)}% of bankroll
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <span className="text-sm text-zinc-300">
                Max Single Position
              </span>
              <span className="text-sm font-mono text-white">
                $
                {(
                  risk.bankroll * risk.maxPositionSizePct
                ).toLocaleString()}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Kill Switch */}
      <Card className="border-red-500/30 bg-red-500/5 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="h-6 w-6 text-red-500" />
            <div>
              <h3 className="text-lg font-semibold text-white">
                Emergency Kill Switch
              </h3>
              <p className="text-sm text-zinc-400">
                Immediately halt all trading and cancel pending orders
              </p>
            </div>
          </div>
          <Button
            variant="destructive"
            size="lg"
            className="bg-red-600 hover:bg-red-700 text-white font-bold px-8"
            onClick={handleKillSwitch}
            disabled={killSwitch.isPending}
          >
            {killSwitch.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ShieldAlert className="h-4 w-4 mr-2" />
            )}
            {risk.killSwitchActive
              ? "DEACTIVATE KILL SWITCH"
              : "ACTIVATE KILL SWITCH"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
