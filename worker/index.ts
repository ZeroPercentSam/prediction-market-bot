/**
 * Prediction Market Bot — Always-On Worker
 *
 * Always-on Node.js process that runs the 5-stage pipeline on a schedule.
 * No timeout limits. Full parallelism. Continuous processing.
 * Logs everything to both stdout and logs/worker.log for autonomous operation.
 */

import cron from "node-cron";
import { runScanJob } from "./jobs/scan.js";
import { runResearchJob } from "./jobs/research.js";
import { runPredictJob } from "./jobs/predict.js";
import { runExecuteJob } from "./jobs/execute.js";
import { runArbExecuteJob } from "./jobs/arb-execute.js";
import { runCompoundJob } from "./jobs/compound.js";
import { runWhaleScanJob } from "./jobs/whale-scan.js";
import { runCertaintyScanJob } from "./jobs/certainty-scan.js";
import { runPnlUpdateJob } from "./jobs/pnl-update.js";
import { writeHeartbeat, isKillSwitchActive } from "./lib/config.js";

console.log("=== Prediction Market Bot Worker ===");
console.log(`Started at ${new Date().toISOString()}`);
console.log(`Paper trading mode: ON (autonomous background operation)`);
console.log("Pipeline schedules:");
console.log("  Scan:     every 5 minutes");
console.log("  Research: every 15 minutes");
console.log("  Predict:  every 15 minutes (offset by 5m from research)");
console.log("  Execute:  every 5 minutes (paper trades)");
console.log("  Arb Exec: every 5 minutes (arb paper trades)");
console.log("  Compound: every hour");
console.log("  Whale Scan: every 10 minutes");
console.log("  Certainty:  every 10 minutes (near-resolved markets)");
console.log("  P&L Update: every 5 minutes (live unrealized P&L)");
console.log("  Heartbeat: every minute");
console.log("");

// Track running jobs to prevent overlap
const runningJobs = new Set<string>();

async function runJob(name: string, fn: () => Promise<void>) {
  if (runningJobs.has(name)) {
    console.log(`[${name}] Skipping — previous run still in progress`);
    return;
  }

  // Check kill switch before every job
  if (name !== "heartbeat" && (await isKillSwitchActive())) {
    console.log(`[${name}] Skipping — kill switch active`);
    return;
  }

  runningJobs.add(name);
  const start = Date.now();
  console.log(`[${name}] Starting at ${new Date().toISOString()}`);

  try {
    await fn();
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[${name}] Completed in ${duration}s`);
  } catch (error) {
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.error(
      `[${name}] Failed after ${duration}s:`,
      error instanceof Error ? error.message : error
    );
  } finally {
    runningJobs.delete(name);
  }
}

// --- Cron Schedules ---

// Scan: every 5 minutes
cron.schedule("*/5 * * * *", () => {
  runJob("scan", runScanJob);
});

// Research: every 15 minutes (at :00, :15, :30, :45)
cron.schedule("0,15,30,45 * * * *", () => {
  runJob("research", runResearchJob);
});

// Predict: every 15 minutes (at :05, :20, :35, :50 — offset from research)
cron.schedule("5,20,35,50 * * * *", () => {
  runJob("predict", runPredictJob);
});

// Execute: every 5 minutes (at :02, :07, :12, etc — offset from scan)
cron.schedule("2,7,12,17,22,27,32,37,42,47,52,57 * * * *", () => {
  runJob("execute", runExecuteJob);
});

// Arb Execute: every 5 minutes (at :04, :09, :14, etc — offset from execute)
cron.schedule("4,9,14,19,24,29,34,39,44,49,54,59 * * * *", () => {
  runJob("arb-execute", runArbExecuteJob);
});

// Compound: every hour at :30
cron.schedule("30 * * * *", () => {
  runJob("compound", runCompoundJob);
});

// Whale Scan: every 10 minutes at :03 offset
cron.schedule("3,13,23,33,43,53 * * * *", () => {
  runJob("whale-scan", runWhaleScanJob);
});

// Certainty Scan: every 10 minutes at :08 offset
cron.schedule("8,18,28,38,48,58 * * * *", () => {
  runJob("certainty-scan", runCertaintyScanJob);
});

// P&L Update: every 5 minutes at :01 offset
cron.schedule("1,6,11,16,21,26,31,36,41,46,51,56 * * * *", () => {
  runJob("pnl-update", runPnlUpdateJob);
});

// Heartbeat: every minute
cron.schedule("* * * * *", () => {
  writeHeartbeat().catch((err) =>
    console.error("[heartbeat] Failed:", err.message)
  );
});

// Run initial scan on startup
console.log("Running initial scan...");
runJob("scan", runScanJob).then(
  () => {
    console.log("Initial scan complete. Worker is running.\n");
  },
  (error) => {
    console.error("Initial scan failed:", error instanceof Error ? error.message : error);
  }
);
