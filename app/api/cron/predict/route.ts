import { runPredictions } from "@/lib/pipeline/predictor";
import {
  startPipelineRun,
  completePipelineRun,
  isKillSwitchActive,
  getConfig,
} from "@/lib/supabase/queries";
import { createServerClient } from "@/lib/supabase/client";

export const runtime = "edge";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (await isKillSwitchActive()) {
    return Response.json({
      status: "skipped",
      pipeline: "predict",
      reason: "Kill switch active",
    });
  }

  const runId = await startPipelineRun("predict");
  const startTime = Date.now();

  try {
    const supabase = createServerClient();

    // Get markets with research that need predictions
    // Prioritize markets with high narrative gaps or anomalies
    const { data: markets } = await supabase
      .from("markets")
      .select(
        `
        id, question, current_yes_price,
        research_summaries(aggregate_sentiment, key_themes, narrative_gap)
      `
      )
      .eq("is_active", true)
      .order("volume_24h", { ascending: false })
      .limit(5); // Predict top 5 markets per cycle to manage API costs

    if (!markets || markets.length === 0) {
      await completePipelineRun(runId, {
        status: "success",
        marketsProcessed: 0,
        durationMs: Date.now() - startTime,
      });
      return Response.json({
        status: "success",
        pipeline: "predict",
        marketsPredicted: 0,
      });
    }

    // Load model weights from config
    const modelWeights = await getConfig("model_weights").catch(
      () => null
    );
    const edgeThreshold = await getConfig("edge_threshold").catch(
      () => 0.04
    );

    // Build research context for each market
    const marketsWithContext = markets.map((m) => {
      const research = Array.isArray(m.research_summaries)
        ? m.research_summaries[0]
        : m.research_summaries;

      const researchContext = research
        ? `Sentiment: ${research.aggregate_sentiment > 0 ? "bullish" : research.aggregate_sentiment < 0 ? "bearish" : "neutral"} (${research.aggregate_sentiment?.toFixed(2)}). Key themes: ${(research.key_themes || []).join(", ")}. Narrative gap: ${research.narrative_gap?.toFixed(2)}.`
        : "";

      return {
        id: m.id,
        question: m.question,
        current_yes_price: m.current_yes_price,
        researchContext,
      };
    });

    const results = await runPredictions(marketsWithContext, {
      edgeThreshold: Number(edgeThreshold) || 0.04,
      modelWeights: modelWeights || undefined,
    });

    const signalsGenerated = results.filter((r) => r.signalGenerated).length;
    const totalCost = results.reduce((sum, r) => sum + r.totalCostUsd, 0);
    const duration = Date.now() - startTime;

    await completePipelineRun(runId, {
      status: "success",
      marketsProcessed: results.length,
      durationMs: duration,
    });

    return Response.json({
      status: "success",
      pipeline: "predict",
      marketsPredicted: results.length,
      signalsGenerated,
      totalCostUsd: totalCost.toFixed(4),
      durationMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error";

    await completePipelineRun(runId, {
      status: "error",
      marketsProcessed: 0,
      durationMs: duration,
      error: errorMsg,
    });

    console.error("[Cron:Predict] Pipeline error:", error);
    return Response.json(
      { status: "error", pipeline: "predict", error: errorMsg },
      { status: 500 }
    );
  }
}
