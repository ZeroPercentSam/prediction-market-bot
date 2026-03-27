import { StatCard } from "@/components/dashboard/stat-card";
import { PipelineStatus } from "@/components/dashboard/pipeline-status";
import { Card } from "@/components/ui/card";
import {
  DollarSign,
  TrendingUp,
  Target,
  BarChart3,
  Activity,
  AlertTriangle,
  Brain,
  Search,
} from "lucide-react";

// Mock data — will be replaced with Supabase queries
const mockStats = {
  bankroll: 10000,
  dailyPnl: 127.5,
  dailyPnlPct: 1.28,
  openPositions: 3,
  activeMarkets: 47,
  pendingSignals: 2,
  winRate: 64.3,
  sharpeRatio: 2.14,
};

const mockPipelineStatus = {
  scan: "idle" as const,
  research: "idle" as const,
  predict: "idle" as const,
  execute: "idle" as const,
  compound: "idle" as const,
};

const mockRecentActivity = [
  {
    id: 1,
    type: "trade",
    message: 'Bought YES on "Will BTC exceed $100K by April?" at $0.42',
    time: "2 min ago",
  },
  {
    id: 2,
    type: "signal",
    message: 'New signal: 8.2% edge detected on "Fed rate cut in May"',
    time: "5 min ago",
  },
  {
    id: 3,
    type: "scan",
    message: "Scanned 312 markets across Polymarket and Kalshi",
    time: "10 min ago",
  },
  {
    id: 4,
    type: "research",
    message: 'Analyzed 23 news sources for "2026 Presidential Election"',
    time: "15 min ago",
  },
  {
    id: 5,
    type: "prediction",
    message:
      "Ensemble model predicts 72% YES vs market price 63% (9% edge)",
    time: "15 min ago",
  },
];

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard Overview</h1>
        <p className="text-sm text-zinc-400">
          Real-time view of your prediction market trading bot
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Bankroll"
          value={`$${mockStats.bankroll.toLocaleString()}`}
          icon={DollarSign}
        />
        <StatCard
          title="Daily P&L"
          value={`+$${mockStats.dailyPnl}`}
          change={`+${mockStats.dailyPnlPct}%`}
          changeType="positive"
          icon={TrendingUp}
        />
        <StatCard
          title="Win Rate"
          value={`${mockStats.winRate}%`}
          change="Target: 60%+"
          changeType="positive"
          icon={Target}
          description="Last 30 days"
        />
        <StatCard
          title="Sharpe Ratio"
          value={mockStats.sharpeRatio.toFixed(2)}
          change="Target: >2.0"
          changeType="positive"
          icon={BarChart3}
          description="Annualized"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Open Positions"
          value={mockStats.openPositions.toString()}
          description="Max 15 concurrent"
          icon={Activity}
        />
        <StatCard
          title="Active Markets"
          value={mockStats.activeMarkets.toString()}
          description="Passing filters"
          icon={Search}
        />
        <StatCard
          title="Pending Signals"
          value={mockStats.pendingSignals.toString()}
          description="Awaiting execution"
          icon={Brain}
        />
      </div>

      {/* Pipeline Status */}
      <PipelineStatus statuses={mockPipelineStatus} />

      {/* Recent Activity & Equity Curve */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900/50 p-6">
          <h3 className="mb-4 text-sm font-medium text-zinc-400">
            Recent Activity
          </h3>
          <div className="space-y-3">
            {mockRecentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3"
              >
                <div className="mt-0.5">
                  {activity.type === "trade" && (
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  )}
                  {activity.type === "signal" && (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                  {activity.type === "scan" && (
                    <Search className="h-4 w-4 text-blue-500" />
                  )}
                  {activity.type === "research" && (
                    <Brain className="h-4 w-4 text-purple-500" />
                  )}
                  {activity.type === "prediction" && (
                    <Target className="h-4 w-4 text-cyan-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300">{activity.message}</p>
                  <p className="text-xs text-zinc-500">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 p-6">
          <h3 className="mb-4 text-sm font-medium text-zinc-400">
            Equity Curve
          </h3>
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-zinc-700">
            <p className="text-sm text-zinc-500">
              Chart will render with live data from Supabase
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
