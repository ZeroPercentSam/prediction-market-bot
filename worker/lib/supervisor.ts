/**
 * Supervisor Agent
 *
 * Based on the AIA Forecaster approach (Brier score 0.1125):
 * 1. Multiple independent agents generate probability estimates with reasoning
 * 2. Supervisor examines reasoning traces for disagreements
 * 3. Supervisor generates targeted research to resolve conflicts
 * 4. Final reconciled probability based on evidence, not just averaging
 *
 * This is the single biggest improvement for prediction accuracy.
 */

import { queryModel, type AIModel, type ModelPrediction } from "./openrouter.js";

export interface SupervisorResult {
  reconciledProbability: number;
  reconciledConfidence: number;
  reconciledReasoning: string;
  disagreements: string[];
  resolutionSearches: string[];
  adjustmentMade: number; // how much the supervisor shifted the probability
}

const SUPERVISOR_SYSTEM_PROMPT = `You are a prediction market supervisor agent. Your job is to reconcile disagreements between multiple AI forecasters.

You will be given:
1. A prediction market question
2. The current market price
3. Multiple independent AI forecaster estimates with their reasoning

Your tasks:
1. Identify the KEY DISAGREEMENTS between forecasters (not minor differences)
2. Determine which forecaster has the strongest evidence-based reasoning
3. Identify what ADDITIONAL INFORMATION would resolve the disagreements
4. Produce a RECONCILED probability estimate that weighs evidence quality, not just averaging

Respond in this exact format:
DISAGREEMENTS:
- <disagreement 1>
- <disagreement 2>

STRONGEST_EVIDENCE: <which model and why their reasoning is strongest>

RESOLUTION_SEARCHES:
- <what to search to resolve disagreement 1>
- <what to search to resolve disagreement 2>

RECONCILED_PROBABILITY: <number between 0.01 and 0.99>
RECONCILED_CONFIDENCE: <number between 0.0 and 1.0>
REASONING: <2-3 sentences explaining the reconciled estimate, referencing specific evidence>`;

/**
 * Run supervisor reconciliation on model estimates
 *
 * Only activates when there's meaningful disagreement (spread > 0.08)
 * Otherwise, standard weighted average is sufficient
 */
export async function runSupervisor(
  marketQuestion: string,
  marketPrice: number,
  estimates: ModelPrediction[],
  researchContext: string
): Promise<SupervisorResult | null> {
  // Calculate spread to determine if supervisor is needed
  const validEstimates = estimates.filter((e) => e.confidence > 0);
  if (validEstimates.length < 3) return null;

  const probs = validEstimates.map((e) => e.probability);
  const mean = probs.reduce((s, p) => s + p, 0) / probs.length;
  const spread = Math.sqrt(
    probs.reduce((s, p) => s + (p - mean) ** 2, 0) / probs.length
  );

  // Only run supervisor if disagreement is significant (>8%)
  if (spread < 0.08) return null;

  // Build the prompt with all model estimates and reasoning
  const estimateSummary = validEstimates
    .map(
      (e) =>
        `${e.model.toUpperCase()}: ${(e.probability * 100).toFixed(1)}% (confidence: ${e.confidence.toFixed(2)})\nReasoning: ${e.reasoning}`
    )
    .join("\n\n");

  const userPrompt = `Market Question: "${marketQuestion}"
Current Market Price: $${marketPrice.toFixed(4)} (implied: ${(marketPrice * 100).toFixed(1)}%)

Research Context: ${researchContext || "None available"}

INDEPENDENT FORECASTER ESTIMATES:

${estimateSummary}

Model Spread: ${(spread * 100).toFixed(1)}% (significant disagreement detected)

Please reconcile these estimates by identifying the key disagreements and producing an evidence-weighted probability.`;

  try {
    // Use Claude for supervisor (best at reasoning about reasoning)
    const result = await queryModel("claude", SUPERVISOR_SYSTEM_PROMPT, userPrompt);

    const parsed = parseSupervisorResponse(result.reasoning);

    // Calculate how much the supervisor shifted from simple average
    parsed.adjustmentMade = parsed.reconciledProbability - mean;

    return parsed;
  } catch (error) {
    console.error("[supervisor] Failed:", error);
    return null;
  }
}

/**
 * Run targeted follow-up research based on supervisor's resolution searches
 */
export async function runResolutionSearch(
  searches: string[],
  marketQuestion: string
): Promise<string> {
  if (searches.length === 0) return "";

  const searchPrompt = `For the prediction market question: "${marketQuestion}"

Please provide brief, factual answers to these specific questions:
${searches.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Be concise and factual. Cite specific data points where possible.`;

  try {
    // Use Gemini Flash for quick research (cheap + fast)
    const result = await queryModel(
      "gemini",
      "You are a research assistant. Provide brief, factual answers to specific questions. Be concise.",
      searchPrompt
    );
    return result.reasoning;
  } catch {
    return "";
  }
}

// --- Parsing ---

function parseSupervisorResponse(text: string): SupervisorResult {
  const disagreements: string[] = [];
  const resolutionSearches: string[] = [];
  let reconciledProbability = 0.5;
  let reconciledConfidence = 0.5;
  let reconciledReasoning = "";

  // Parse disagreements
  const disagSection = text.match(
    /DISAGREEMENTS:\s*([\s\S]*?)(?=STRONGEST_EVIDENCE:|RESOLUTION_SEARCHES:|RECONCILED_PROBABILITY:|$)/i
  );
  if (disagSection) {
    const lines = disagSection[1].split("\n").filter((l) => l.trim().startsWith("-"));
    disagreements.push(...lines.map((l) => l.replace(/^-\s*/, "").trim()));
  }

  // Parse resolution searches
  const searchSection = text.match(
    /RESOLUTION_SEARCHES:\s*([\s\S]*?)(?=RECONCILED_PROBABILITY:|RECONCILED_CONFIDENCE:|$)/i
  );
  if (searchSection) {
    const lines = searchSection[1].split("\n").filter((l) => l.trim().startsWith("-"));
    resolutionSearches.push(...lines.map((l) => l.replace(/^-\s*/, "").trim()));
  }

  // Parse reconciled probability
  const probMatch = text.match(/RECONCILED_PROBABILITY:\s*([\d.]+)/i);
  if (probMatch) {
    const p = parseFloat(probMatch[1]);
    if (p >= 0.01 && p <= 0.99) reconciledProbability = p;
  }

  // Parse confidence
  const confMatch = text.match(/RECONCILED_CONFIDENCE:\s*([\d.]+)/i);
  if (confMatch) {
    const c = parseFloat(confMatch[1]);
    if (c >= 0 && c <= 1) reconciledConfidence = c;
  }

  // Parse reasoning
  const reasonMatch = text.match(/REASONING:\s*([\s\S]+)/i);
  if (reasonMatch) {
    reconciledReasoning = reasonMatch[1].trim().slice(0, 500);
  }

  return {
    reconciledProbability,
    reconciledConfidence,
    reconciledReasoning,
    disagreements,
    resolutionSearches,
    adjustmentMade: 0,
  };
}
