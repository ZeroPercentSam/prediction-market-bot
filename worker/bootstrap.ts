/**
 * Bootstrap — loads env vars and sets up file logging BEFORE any other imports.
 * This is the actual entry point. It loads .env.local, configures logging,
 * then dynamically imports the main worker.
 */

import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Load .env.local from project root (parent of worker/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
loadEnv({ path: resolve(projectRoot, ".env.local") });

// Set up file logging — write to logs/worker.log
const logsDir = resolve(projectRoot, "logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const logFile = resolve(logsDir, "worker.log");
const logStream = fs.createWriteStream(logFile, { flags: "a" });

function formatLog(level: string, ...args: unknown[]): string {
  const timestamp = new Date().toISOString();
  const message = args
    .map((a) =>
      a instanceof Error
        ? a.stack || a.message
        : typeof a === "string"
          ? a
          : JSON.stringify(a)
    )
    .join(" ");
  return `[${timestamp}] [${level}] ${message}`;
}

// Override console to write to both stdout and log file
const origLog = console.log.bind(console);
const origError = console.error.bind(console);
const origWarn = console.warn.bind(console);

console.log = (...args: unknown[]) => {
  const line = formatLog("INFO", ...args);
  origLog(line);
  logStream.write(line + "\n");
};
console.error = (...args: unknown[]) => {
  const line = formatLog("ERROR", ...args);
  origError(line);
  logStream.write(line + "\n");
};
console.warn = (...args: unknown[]) => {
  const line = formatLog("WARN", ...args);
  origWarn(line);
  logStream.write(line + "\n");
};

console.log(`Log file: ${logFile}`);

// Now dynamically import the worker (env vars are loaded, logging is active)
await import("./index.js");
