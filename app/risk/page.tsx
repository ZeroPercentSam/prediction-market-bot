import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldAlert,
  AlertTriangle,
  Activity,
  DollarSign,
  TrendingDown,
  Zap,
} from "lucide-react";

// Mock data — will be replaced with Supabase queries
const mockRisk = {
  bankroll: 10000,
  dailyPnl: -347.5,
  dailyPnlPct: -3.48,
  openPositions: 3,
  maxConcurrentPositions: 15,
  totalExposure: 1200,
  exposureByCategory: {
    Crypto: 500,
    Economics: 300,
    Finance: 400,
  } as Record<string, number>,
  varValue: 820,
  dailyLossLimitPct: 0.15,
  dailyLossUsed: 0.0348,
  killSwitchActive: false,
  maxPositionSizePct: 0.05,
};

export default function RiskPage() {
  const lossLimitProgress =
    (mockRisk.dailyLossUsed / mockRisk.dailyLossLimitPct) * 100;
  const exposurePct = (mockRisk.totalExposure / mockRisk.bankroll) * 100;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Risk Dashboard</h1>
          <p className="text-sm text-zinc-400">
            Portfolio risk monitoring and kill switch controls
          </p>
        </div>
        {mockRisk.killSwitchActive && (
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
            ${mockRisk.totalExposure.toLocaleString()}
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
            {mockRisk.openPositions}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Max: {mockRisk.maxConcurrentPositions}
          </p>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-zinc-400">Value at Risk (VaR)</p>
            <AlertTriangle className="h-4 w-4 text-zinc-500" />
          </div>
          <p className="text-2xl font-bold text-amber-500">
            ${mockRisk.varValue.toLocaleString()}
          </p>
          <p className="text-xs text-zinc-500 mt-1">95% confidence, 1-day</p>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-zinc-400">Daily P&L</p>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-red-500">
            ${mockRisk.dailyPnl.toFixed(2)}
          </p>
          <p className="text-xs text-red-400 mt-1">
            {mockRisk.dailyPnlPct.toFixed(2)}% of bankroll
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
            {(mockRisk.dailyLossUsed * 100).toFixed(2)}% /{" "}
            {(mockRisk.dailyLossLimitPct * 100).toFixed(0)}%
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
            {(mockRisk.dailyLossLimitPct * 100).toFixed(0)}%
          </span>
        </div>
      </Card>

      {/* Exposure by Category & Position Limits */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <h3 className="text-sm font-medium text-zinc-400 mb-4">
            Exposure by Category
          </h3>
          <div className="space-y-3">
            {Object.entries(mockRisk.exposureByCategory).map(
              ([category, amount]) => {
                const pct = (amount / mockRisk.totalExposure) * 100;
                return (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-zinc-300">{category}</span>
                      <span className="text-sm font-mono text-zinc-400">
                        ${amount.toLocaleString()} ({pct.toFixed(0)}%)
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
                {(mockRisk.maxPositionSizePct * 100).toFixed(0)}% of bankroll
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <span className="text-sm text-zinc-300">
                Max Concurrent Positions
              </span>
              <span className="text-sm font-mono text-white">
                {mockRisk.maxConcurrentPositions}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <span className="text-sm text-zinc-300">
                Daily Loss Limit
              </span>
              <span className="text-sm font-mono text-white">
                {(mockRisk.dailyLossLimitPct * 100).toFixed(0)}% of bankroll
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <span className="text-sm text-zinc-300">
                Max Single Position
              </span>
              <span className="text-sm font-mono text-white">
                ${(mockRisk.bankroll * mockRisk.maxPositionSizePct).toLocaleString()}
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
          >
            <ShieldAlert className="h-4 w-4 mr-2" />
            {mockRisk.killSwitchActive
              ? "DEACTIVATE KILL SWITCH"
              : "ACTIVATE KILL SWITCH"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
