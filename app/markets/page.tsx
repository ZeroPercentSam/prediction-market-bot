import { Badge } from "@/components/ui/badge";
import { Search, Filter } from "lucide-react";
import { MarketsTable } from "@/components/dashboard/markets-table";

export default function MarketsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Market Scanner</h1>
          <p className="text-sm text-zinc-400">
            Live markets from Polymarket & Kalshi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Search className="h-3 w-3" />
            Auto-scan every 5 min
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Filter className="h-3 w-3" />
            Filters active
          </Badge>
        </div>
      </div>

      <MarketsTable />
    </div>
  );
}
