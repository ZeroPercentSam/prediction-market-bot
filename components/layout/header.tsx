"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Bell, DollarSign, Power } from "lucide-react";

interface HeaderProps {
  bankroll?: number;
  dailyPnl?: number;
  killSwitchActive?: boolean;
}

export function Header({
  bankroll = 0,
  dailyPnl = 0,
  killSwitchActive = false,
}: HeaderProps) {
  const pnlColor = dailyPnl >= 0 ? "text-emerald-500" : "text-red-500";
  const pnlSign = dailyPnl >= 0 ? "+" : "";

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
            {pnlSign}${Math.abs(dailyPnl).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>
        <Badge variant={killSwitchActive ? "destructive" : "secondary"}>
          {killSwitchActive ? "HALTED" : "PAPER TRADING"}
        </Badge>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
          <Bell className="h-4 w-4" />
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="gap-2"
        >
          <Power className="h-3 w-3" />
          Kill Switch
        </Button>
      </div>
    </header>
  );
}
