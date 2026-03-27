import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, TrendingDown } from "lucide-react";

// Mock predictions data
const mockPredictions = [
  {
    id: "1",
    market: "Will BTC exceed $100K by April 2026?",
    marketPrice: 0.42,
    ensembleProbability: 0.51,
    edge: 0.09,
    ev: 0.184,
    signalGenerated: true,
    signalDirection: "buy_yes",
    models: [
      { name: "Claude", probability: 0.48, weight: 0.2 },
      { name: "GPT-4o", probability: 0.52, weight: 0.2 },
      { name: "Grok", probability: 0.55, weight: 0.3 },
      { name: "Gemini", probability: 0.47, weight: 0.15 },
      { name: "DeepSeek", probability: 0.49, weight: 0.15 },
    ],
  },
  {
    id: "2",
    market: "Fed rate cut in May 2026?",
    marketPrice: 0.63,
    ensembleProbability: 0.58,
    edge: -0.05,
    ev: -0.078,
    signalGenerated: false,
    signalDirection: null,
    models: [
      { name: "Claude", probability: 0.6, weight: 0.2 },
      { name: "GPT-4o", probability: 0.55, weight: 0.2 },
      { name: "Grok", probability: 0.58, weight: 0.3 },
      { name: "Gemini", probability: 0.61, weight: 0.15 },
      { name: "DeepSeek", probability: 0.56, weight: 0.15 },
    ],
  },
];

export default function PredictionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">AI Predictions</h1>
        <p className="text-sm text-zinc-400">
          Ensemble model estimates with full math breakdown
        </p>
      </div>

      <div className="space-y-4">
        {mockPredictions.map((prediction) => (
          <Card
            key={prediction.id}
            className="border-zinc-800 bg-zinc-900/50 p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {prediction.market}
                </h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm text-zinc-400">
                    Market: {(prediction.marketPrice * 100).toFixed(0)}%
                  </span>
                  <span className="text-sm text-zinc-400">
                    AI Ensemble:{" "}
                    {(prediction.ensembleProbability * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              {prediction.signalGenerated ? (
                <Badge className="gap-1 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                  <TrendingUp className="h-3 w-3" />
                  Signal: {prediction.edge > 0 ? "BUY YES" : "BUY NO"} (
                  {(prediction.edge * 100).toFixed(1)}% edge)
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="gap-1 text-zinc-400"
                >
                  No signal ({(prediction.edge * 100).toFixed(1)}% edge)
                </Badge>
              )}
            </div>

            {/* Model Breakdown */}
            <div className="grid grid-cols-5 gap-3 mb-4">
              {prediction.models.map((model) => (
                <div
                  key={model.name}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-center"
                >
                  <p className="text-xs text-zinc-500 mb-1">{model.name}</p>
                  <p className="text-lg font-mono font-semibold text-white">
                    {(model.probability * 100).toFixed(0)}%
                  </p>
                  <p className="text-xs text-zinc-600">
                    Weight: {(model.weight * 100).toFixed(0)}%
                  </p>
                </div>
              ))}
            </div>

            {/* Math Breakdown */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-sm">
              <p className="text-zinc-500 mb-2">// Math Breakdown</p>
              <p className="text-zinc-300">
                <span className="text-zinc-500">Market Price (p_market):</span>{" "}
                {prediction.marketPrice}
              </p>
              <p className="text-zinc-300">
                <span className="text-zinc-500">Ensemble Prob (p_model):</span>{" "}
                {prediction.ensembleProbability.toFixed(4)}
              </p>
              <p className="text-zinc-300">
                <span className="text-zinc-500">
                  Edge (p_model - p_market):
                </span>{" "}
                <span
                  className={
                    prediction.edge > 0 ? "text-emerald-500" : "text-red-500"
                  }
                >
                  {prediction.edge > 0 ? "+" : ""}
                  {(prediction.edge * 100).toFixed(2)}%
                </span>
              </p>
              <p className="text-zinc-300">
                <span className="text-zinc-500">
                  Decimal Odds (1/p_market):
                </span>{" "}
                {(1 / prediction.marketPrice).toFixed(4)}
              </p>
              <p className="text-zinc-300">
                <span className="text-zinc-500">EV = p*b - (1-p):</span>{" "}
                <span
                  className={
                    prediction.ev > 0 ? "text-emerald-500" : "text-red-500"
                  }
                >
                  {prediction.ev > 0 ? "+" : ""}
                  {prediction.ev.toFixed(4)}
                </span>
              </p>
              <p className="text-zinc-300 mt-2">
                <span className="text-zinc-500">Signal:</span>{" "}
                {prediction.signalGenerated
                  ? `TRADE (edge ${(prediction.edge * 100).toFixed(1)}% > threshold 4%)`
                  : `NO TRADE (edge ${Math.abs(prediction.edge * 100).toFixed(1)}% < threshold 4%)`}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
