"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings, Save, RotateCcw, Loader2, Check, X } from "lucide-react";
import { DEFAULT_CONFIG } from "@/types";
import type { AIModel, SystemConfig } from "@/types";
import {
  useSystemConfig,
  useSaveConfig,
} from "@/lib/hooks/use-dashboard-data";

const modelLabels: Record<AIModel, string> = {
  claude: "Claude",
  gpt4o: "GPT-4o",
  grok: "Grok",
  gemini: "Gemini",
  deepseek: "DeepSeek",
};

const CONFIG_KEYS: (keyof SystemConfig)[] = [
  "edgeThreshold",
  "kellyFraction",
  "maxPositionSizePct",
  "maxConcurrentPositions",
  "scanIntervalMin",
  "dailyLossLimitPct",
  "slippageAbortPct",
  "aiDailyBudgetUsd",
  "minMarketVolume",
  "maxExpiryDays",
  "paperTradingMode",
  "modelWeights",
];

function parseConfigValue(
  remoteConfig: Record<string, unknown>,
  key: string,
  fallback: unknown
): unknown {
  const raw = remoteConfig[key];
  if (raw === undefined || raw === null) return fallback;
  // Supabase JSON columns may already be parsed
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return raw;
  }
}

function buildConfigFromRemote(
  remoteConfig: Record<string, unknown>
): SystemConfig {
  return {
    scanIntervalMin: Number(
      parseConfigValue(remoteConfig, "scanIntervalMin", DEFAULT_CONFIG.scanIntervalMin)
    ),
    minMarketVolume: Number(
      parseConfigValue(remoteConfig, "minMarketVolume", DEFAULT_CONFIG.minMarketVolume)
    ),
    maxExpiryDays: Number(
      parseConfigValue(remoteConfig, "maxExpiryDays", DEFAULT_CONFIG.maxExpiryDays)
    ),
    edgeThreshold: Number(
      parseConfigValue(remoteConfig, "edgeThreshold", DEFAULT_CONFIG.edgeThreshold)
    ),
    kellyFraction: Number(
      parseConfigValue(remoteConfig, "kellyFraction", DEFAULT_CONFIG.kellyFraction)
    ),
    maxPositionSizePct: Number(
      parseConfigValue(
        remoteConfig,
        "maxPositionSizePct",
        DEFAULT_CONFIG.maxPositionSizePct
      )
    ),
    maxConcurrentPositions: Number(
      parseConfigValue(
        remoteConfig,
        "maxConcurrentPositions",
        DEFAULT_CONFIG.maxConcurrentPositions
      )
    ),
    dailyLossLimitPct: Number(
      parseConfigValue(
        remoteConfig,
        "dailyLossLimitPct",
        DEFAULT_CONFIG.dailyLossLimitPct
      )
    ),
    slippageAbortPct: Number(
      parseConfigValue(
        remoteConfig,
        "slippageAbortPct",
        DEFAULT_CONFIG.slippageAbortPct
      )
    ),
    aiDailyBudgetUsd: Number(
      parseConfigValue(
        remoteConfig,
        "aiDailyBudgetUsd",
        DEFAULT_CONFIG.aiDailyBudgetUsd
      )
    ),
    paperTradingMode: Boolean(
      parseConfigValue(
        remoteConfig,
        "paperTradingMode",
        DEFAULT_CONFIG.paperTradingMode
      )
    ),
    modelWeights: (parseConfigValue(
      remoteConfig,
      "modelWeights",
      DEFAULT_CONFIG.modelWeights
    ) ?? DEFAULT_CONFIG.modelWeights) as Record<AIModel, number>,
  };
}

export default function SettingsPage() {
  const { data: remoteConfig, isLoading } = useSystemConfig();
  const saveConfig = useSaveConfig();

  const [config, setConfig] = useState<SystemConfig>(DEFAULT_CONFIG);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Sync remote config into local state when loaded
  useEffect(() => {
    if (remoteConfig) {
      setConfig(buildConfigFromRemote(remoteConfig));
    }
  }, [remoteConfig]);

  // Clear feedback after 3 seconds
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  function updateField<K extends keyof SystemConfig>(
    key: K,
    value: SystemConfig[K]
  ) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function updateModelWeight(model: AIModel, weight: number) {
    setConfig((prev) => ({
      ...prev,
      modelWeights: { ...prev.modelWeights, [model]: weight },
    }));
  }

  async function handleSave() {
    const entries = CONFIG_KEYS.map((key) => ({
      key,
      value: config[key],
    }));
    try {
      await saveConfig.mutateAsync(entries);
      setFeedback({ type: "success", message: "Settings saved successfully" });
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : "Failed to save settings",
      });
    }
  }

  async function handleReset() {
    setConfig(DEFAULT_CONFIG);
    const entries = CONFIG_KEYS.map((key) => ({
      key,
      value: DEFAULT_CONFIG[key],
    }));
    try {
      await saveConfig.mutateAsync(entries);
      setFeedback({ type: "success", message: "Settings reset to defaults" });
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : "Failed to reset settings",
      });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

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
          {feedback && (
            <Badge
              className={
                feedback.type === "success"
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1"
                  : "bg-red-500/10 text-red-500 border-red-500/20 gap-1"
              }
            >
              {feedback.type === "success" ? (
                <Check className="h-3 w-3" />
              ) : (
                <X className="h-3 w-3" />
              )}
              {feedback.message}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={handleReset}
            disabled={saveConfig.isPending}
          >
            <RotateCcw className="h-3 w-3" />
            Reset Defaults
          </Button>
          <Button
            size="sm"
            className="gap-1"
            onClick={handleSave}
            disabled={saveConfig.isPending}
          >
            {saveConfig.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
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
          <button
            type="button"
            onClick={() =>
              updateField("paperTradingMode", !config.paperTradingMode)
            }
            className="cursor-pointer"
          >
            <Badge
              className={
                config.paperTradingMode
                  ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                  : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
              }
            >
              {config.paperTradingMode ? "PAPER MODE" : "LIVE TRADING"}
            </Badge>
          </button>
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
                  value={config.edgeThreshold}
                  onChange={(e) =>
                    updateField("edgeThreshold", parseFloat(e.target.value))
                  }
                  className="flex-1 accent-blue-500"
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
                  value={config.kellyFraction}
                  onChange={(e) =>
                    updateField("kellyFraction", parseFloat(e.target.value))
                  }
                  className="flex-1 accent-blue-500"
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
                  value={config.maxPositionSizePct}
                  onChange={(e) =>
                    updateField(
                      "maxPositionSizePct",
                      parseFloat(e.target.value)
                    )
                  }
                  className="flex-1 accent-blue-500"
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
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={config.maxConcurrentPositions}
                  onChange={(e) =>
                    updateField(
                      "maxConcurrentPositions",
                      parseInt(e.target.value, 10)
                    )
                  }
                  className="bg-transparent text-sm font-mono text-white w-full outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                Scan Interval (minutes)
              </label>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={config.scanIntervalMin}
                  onChange={(e) =>
                    updateField(
                      "scanIntervalMin",
                      parseInt(e.target.value, 10)
                    )
                  }
                  className="bg-transparent text-sm font-mono text-white w-full outline-none"
                />
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
                      value={weight}
                      onChange={(e) =>
                        updateModelWeight(model, parseFloat(e.target.value))
                      }
                      className="flex-1 accent-blue-500"
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
                  value={config.dailyLossLimitPct}
                  onChange={(e) =>
                    updateField(
                      "dailyLossLimitPct",
                      parseFloat(e.target.value)
                    )
                  }
                  className="flex-1 accent-blue-500"
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
                  value={config.slippageAbortPct}
                  onChange={(e) =>
                    updateField(
                      "slippageAbortPct",
                      parseFloat(e.target.value)
                    )
                  }
                  className="flex-1 accent-blue-500"
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
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={config.aiDailyBudgetUsd}
                  onChange={(e) =>
                    updateField(
                      "aiDailyBudgetUsd",
                      parseInt(e.target.value, 10)
                    )
                  }
                  className="bg-transparent text-sm font-mono text-white w-full outline-none"
                />
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
                <input
                  type="number"
                  min="0"
                  max="100000"
                  value={config.minMarketVolume}
                  onChange={(e) =>
                    updateField(
                      "minMarketVolume",
                      parseInt(e.target.value, 10)
                    )
                  }
                  className="bg-transparent text-sm font-mono text-white w-full outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                Max Expiry (days)
              </label>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={config.maxExpiryDays}
                  onChange={(e) =>
                    updateField(
                      "maxExpiryDays",
                      parseInt(e.target.value, 10)
                    )
                  }
                  className="bg-transparent text-sm font-mono text-white w-full outline-none"
                />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
