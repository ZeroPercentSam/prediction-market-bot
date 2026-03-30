"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, DollarSign, Power, Loader2 } from "lucide-react";
import {
  useDashboardStats,
  useToggleKillSwitch,
} from "@/lib/hooks/use-dashboard-data";

export function Header() {
  const { data: stats } = useDashboardStats();
  const killSwitch = useToggleKillSwitch();

  const bankroll = stats?.bankroll ?? 0;
  const dailyPnl = stats?.dailyPnl ?? 0;
  const killSwitchActive = stats?.killSwitchActive ?? false;
  const workerHeartbeat = stats?.workerHeartbeat ?? null;

  const pnlColor = dailyPnl >= 0 ? "text-emerald-500" : "text-red-500";
  const pnlSign = dailyPnl >= 0 ? "+" : "";

  const isWorkerActive =
    workerHeartbeat != null &&
    Date.now() - new Date(workerHeartbeat).getTime() < 2 * 60 * 1000;

  return (
    <header className="flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-6">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-zinc-400" />
          <span className="text-sm text-zinc-400">Bankroll</span>
          <span className="text-sm font-semibold text-white">
            ${bankroll.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">Daily P&L</span>
          <span className={`text-sm font-semibold ${pnlColor}`}>
            {pnlSign}$
            {Math.abs(dailyPnl).toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>
        <Badge variant={killSwitchActive ? "destructive" : "secondary"}>
          {killSwitchActive ? "HALTED" : "PAPER TRADING"}
        </Badge>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              isWorkerActive ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          <span className="text-xs text-zinc-400">
            {isWorkerActive ? "Worker Active" : "Worker Offline"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="text-zinc-400 hover:text-white"
        >
          <Bell className="h-4 w-4" />
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="gap-2"
          onClick={() => killSwitch.mutate(!killSwitchActive)}
          disabled={killSwitch.isPending}
        >
          {killSwitch.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Power className="h-3 w-3" />
          )}
          {killSwitchActive ? "Deactivate" : "Kill Switch"}
        </Button>
      </div>
    </header>
  );
}
