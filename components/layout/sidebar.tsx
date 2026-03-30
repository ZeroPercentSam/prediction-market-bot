"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Brain,
  History,
  Home,
  Layers,
  LineChart,
  Search,
  Settings,
  Shield,
  TrendingUp,
  FileText,
  Newspaper,
} from "lucide-react";
import { useDashboardStats } from "@/lib/hooks/use-dashboard-data";

const navigation = [
  { name: "Overview", href: "/", icon: Home },
  { name: "Market Scanner", href: "/markets", icon: Search },
  { name: "Research Hub", href: "/research", icon: Newspaper },
  { name: "Predictions", href: "/predictions", icon: Brain },
  { name: "Active Trades", href: "/trades", icon: TrendingUp },
  { name: "Trade History", href: "/history", icon: History },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Strategies", href: "/strategies", icon: Layers },
  { name: "Risk Dashboard", href: "/risk", icon: Shield },
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Logs", href: "/logs", icon: FileText },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: stats } = useDashboardStats();

  const workerHeartbeat = stats?.workerHeartbeat ?? null;
  const isPipelineActive =
    workerHeartbeat != null &&
    Date.now() - new Date(workerHeartbeat).getTime() < 2 * 60 * 1000;

  return (
    <aside className="flex h-full w-64 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex h-16 items-center gap-2 border-b border-zinc-800 px-6">
        <LineChart className="h-6 w-6 text-emerald-500" />
        <span className="text-lg font-semibold text-white">PredictBot</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-zinc-800 p-4">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-2 w-2 rounded-full",
              isPipelineActive
                ? "bg-emerald-500 animate-pulse"
                : "bg-red-500"
            )}
          />
          <span className="text-xs text-zinc-400">
            {isPipelineActive ? "Pipeline Active" : "Pipeline Inactive"}
          </span>
        </div>
      </div>
    </aside>
  );
}
