#!/usr/bin/env bun

import { initDatabase } from "./db.ts";
import { createApp } from "./server.ts";

function printUsage(): void {
  console.log(`
compound-eye - Capture and review engineering workflow observations

Usage:
  compound-eye [options]

Options:
  --port <number>  Port to serve on (default: 4141)
  --help, -h       Show this help

Example:
  bun run src/index.ts
  bun run src/index.ts --port 8080
`.trim());
}

function parseArgs(args: string[]): { port: number } {
  let port = 4141;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--port" && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      if (isNaN(port)) {
        console.error("Invalid port number");
        process.exit(1);
      }
      i++;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  return { port };
}

function main(): void {
  const { port } = parseArgs(Bun.argv.slice(2));
  const db = initDatabase();
  const { start } = createApp(db);
  const { stop } = start(port);

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    db.close();
    stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    db.close();
    stop();
    process.exit(0);
  });
}

main();
