"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { fetchDashboardMarkets } from "@/lib/supabase/dashboard-queries";

interface MarketRow {
  id: string;
  platform: string;
  question: string;
  category: string;
  current_yes_price: number;
  volume_24h: number;
  liquidity: number;
  price_change_1h: number;
  anomaly_flags: string[];
  expiry_date: string;
}

export function MarketsTable() {
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardMarkets(100)
      .then((data) => setMarkets(data as MarketRow[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/50 p-12 text-center">
        <p className="text-zinc-500">Loading markets...</p>
      </Card>
    );
  }

  if (markets.length === 0) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/50 p-12 text-center">
        <p className="text-zinc-400 mb-2">No markets found</p>
        <p className="text-zinc-500 text-sm">
          Run the scan pipeline to populate market data. Trigger it at{" "}
          <code className="text-zinc-400">/api/cron/scan</code>
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left">
              <th className="px-4 py-3 font-medium text-zinc-400">Market</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Platform</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Category</th>
              <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                YES Price
              </th>
              <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                24h Volume
              </th>
              <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                Liquidity
              </th>
              <th className="px-4 py-3 font-medium text-zinc-400 text-right">
                1h Change
              </th>
              <th className="px-4 py-3 font-medium text-zinc-400">Alerts</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((market) => (
              <tr
                key={market.id}
                className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3 text-white max-w-xs truncate">
                  {market.question}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-xs capitalize">
                    {market.platform}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-zinc-400">{market.category}</td>
                <td className="px-4 py-3 text-right font-mono text-white">
                  ${Number(market.current_yes_price).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-zinc-300">
                  ${(Number(market.volume_24h) / 1000).toFixed(0)}K
                </td>
                <td className="px-4 py-3 text-right font-mono text-zinc-300">
                  ${(Number(market.liquidity) / 1000).toFixed(0)}K
                </td>
                <td
                  className={`px-4 py-3 text-right font-mono ${
                    Number(market.price_change_1h) >= 0
                      ? "text-emerald-500"
                      : "text-red-500"
                  }`}
                >
                  {Number(market.price_change_1h) >= 0 ? "+" : ""}
                  {(Number(market.price_change_1h) * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-3">
                  {market.anomaly_flags?.length > 0 && (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
