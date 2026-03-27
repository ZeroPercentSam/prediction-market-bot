import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings, Save, RotateCcw } from "lucide-react";
import { DEFAULT_CONFIG } from "@/types";
import type { AIModel } from "@/types";

const modelLabels: Record<AIModel, string> = {
  claude: "Claude",
  gpt4o: "GPT-4o",
  grok: "Grok",
  gemini: "Gemini",
  deepseek: "DeepSeek",
};

export default function SettingsPage() {
  const config = DEFAULT_CONFIG;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-sm text-zinc-400">
            Configure trading parameters, model weights, and risk limits
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1">
            <RotateCcw className="h-3 w-3" />
            Reset Defaults
          </Button>
          <Button size="sm" className="gap-1">
            <Save className="h-3 w-3" />
            Save Changes
          </Button>
        </div>
      </div>

      {/* Paper Trading Toggle */}
      <Card className="border-amber-500/30 bg-amber-500/5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Paper Trading Mode
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              When enabled, trades are simulated and no real money is at risk
            </p>
          </div>
          <Badge
            className={
              config.paperTradingMode
                ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
            }
          >
            {config.paperTradingMode ? "PAPER MODE" : "LIVE TRADING"}
          </Badge>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Trading Parameters */}
        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="h-4 w-4 text-zinc-400" />
            <h3 className="text-sm font-medium text-zinc-400">
              Trading Parameters
            </h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                Edge Threshold
              </label>
              <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <input
                  type="range"
                  min="0.01"
                  max="0.15"
                  step="0.01"
                  defaultValue={config.edgeThreshold}
                  className="flex-1 accent-blue-500"
                  disabled
                />
                <span className="text-sm font-mono text-white w-12 text-right">
                  {(config.edgeThreshold * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                Kelly Fraction
              </label>
              <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <input
                  type="range"
                  min="0.05"
                  max="0.5"
                  step="0.05"
                  defaultValue={config.kellyFraction}
                  className="flex-1 accent-blue-500"
                  disabled
                />
                <span className="text-sm font-mono text-white w-12 text-right">
                  {(config.kellyFraction * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                Max Position Size
              </label>
              <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <input
                  type="range"
                  min="0.01"
                  max="0.1"
                  step="0.01"
                  defaultValue={config.maxPositionSizePct}
                  className="flex-1 accent-blue-500"
                  disabled
                />
                <span className="text-sm font-mono text-white w-12 text-right">
                  {(config.maxPositionSizePct * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                Max Concurrent Positions
              </label>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <span className="text-sm font-mono text-white">
                  {config.maxConcurrentPositions}
                </span>
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                Scan Interval (minutes)
              </label>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <span className="text-sm font-mono text-white">
                  {config.scanIntervalMin}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Model Weights */}
        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="h-4 w-4 text-zinc-400" />
            <h3 className="text-sm font-medium text-zinc-400">
              Model Weights
            </h3>
            <span className="text-xs text-zinc-600 ml-auto">
              Total:{" "}
              {(
                Object.values(config.modelWeights).reduce((a, b) => a + b, 0) *
                100
              ).toFixed(0)}
              %
            </span>
          </div>
          <div className="space-y-4">
            {(Object.entries(config.modelWeights) as [AIModel, number][]).map(
              ([model, weight]) => (
                <div key={model}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-zinc-500">
                      {modelLabels[model]}
                    </label>
                    <span className="text-xs font-mono text-zinc-300">
                      {(weight * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                    <input
                      type="range"
                      min="0"
                      max="0.5"
                      step="0.05"
                      defaultValue={weight}
                      className="flex-1 accent-blue-500"
                      disabled
                    />
                  </div>
                </div>
              )
            )}
          </div>
        </Card>

        {/* Risk Limits */}
        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="h-4 w-4 text-zinc-400" />
            <h3 className="text-sm font-medium text-zinc-400">Risk Limits</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                Daily Loss Limit
              </label>
              <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <input
                  type="range"
                  min="0.05"
                  max="0.3"
                  step="0.05"
                  defaultValue={config.dailyLossLimitPct}
                  className="flex-1 accent-blue-500"
                  disabled
                />
                <span className="text-sm font-mono text-white w-12 text-right">
                  {(config.dailyLossLimitPct * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                Slippage Abort Threshold
              </label>
              <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <input
                  type="range"
                  min="0.01"
                  max="0.05"
                  step="0.005"
                  defaultValue={config.slippageAbortPct}
                  className="flex-1 accent-blue-500"
                  disabled
                />
                <span className="text-sm font-mono text-white w-12 text-right">
                  {(config.slippageAbortPct * 100).toFixed(1)}%
                </span>
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                AI Daily Budget (USD)
              </label>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <span className="text-sm font-mono text-white">
                  ${config.aiDailyBudgetUsd}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Market Filters */}
        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="h-4 w-4 text-zinc-400" />
            <h3 className="text-sm font-medium text-zinc-400">
              Market Filters
            </h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                Min Market Volume ($)
              </label>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <span className="text-sm font-mono text-white">
                  ${config.minMarketVolume.toLocaleString()}
                </span>
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                Max Expiry (days)
              </label>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <span className="text-sm font-mono text-white">
                  {config.maxExpiryDays}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
