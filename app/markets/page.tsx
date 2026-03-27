import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, AlertTriangle } from "lucide-react";

// Mock data — will be replaced with Supabase queries
const mockMarkets = [
  {
    id: "1",
    platform: "polymarket",
    question: "Will BTC exceed $100K by April 2026?",
    category: "Crypto",
    yesPrice: 0.42,
    volume24h: 125000,
    liquidity: 450000,
    priceChange1h: 3.2,
    anomalyFlags: ["volume_surge"],
    expiryDate: "2026-04-30",
  },
  {
    id: "2",
    platform: "kalshi",
    question: "Fed rate cut in May 2026?",
    category: "Economics",
    yesPrice: 0.63,
    volume24h: 89000,
    liquidity: 320000,
    priceChange1h: -1.5,
    anomalyFlags: [],
    expiryDate: "2026-05-15",
  },
  {
    id: "3",
    platform: "polymarket",
    question: "Will AI pass the Turing Test by 2027?",
    category: "Technology",
    yesPrice: 0.28,
    volume24h: 67000,
    liquidity: 210000,
    priceChange1h: 0.8,
    anomalyFlags: ["spread_wide"],
    expiryDate: "2027-01-01",
  },
  {
    id: "4",
    platform: "kalshi",
    question: "S&P 500 above 6000 by end of Q2?",
    category: "Finance",
    yesPrice: 0.55,
    volume24h: 230000,
    liquidity: 780000,
    priceChange1h: -2.1,
    anomalyFlags: ["price_spike"],
    expiryDate: "2026-06-30",
  },
];

export default function MarketsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Market Scanner</h1>
          <p className="text-sm text-zinc-400">
            Scanning {mockMarkets.length} markets across Polymarket & Kalshi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Search className="h-3 w-3" />
            Last scan: 2 min ago
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Filter className="h-3 w-3" />
            Filters active
          </Badge>
        </div>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="px-4 py-3 font-medium text-zinc-400">Market</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Platform</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Category</th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-right">YES Price</th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-right">24h Volume</th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-right">Liquidity</th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-right">1h Change</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Alerts</th>
              </tr>
            </thead>
            <tbody>
              {mockMarkets.map((market) => (
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
                    ${market.yesPrice.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-300">
                    ${(market.volume24h / 1000).toFixed(0)}K
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-300">
                    ${(market.liquidity / 1000).toFixed(0)}K
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono ${
                      market.priceChange1h >= 0
                        ? "text-emerald-500"
                        : "text-red-500"
                    }`}
                  >
                    {market.priceChange1h >= 0 ? "+" : ""}
                    {market.priceChange1h.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3">
                    {market.anomalyFlags.length > 0 && (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
