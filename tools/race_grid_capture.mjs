#!/usr/bin/env node
/** Deterministic PAL grid/body/paint captures, with native AI inspection JSON. */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolsDir, "..");
const output = path.resolve(process.argv[2] ?? path.join(repoRoot, "artifacts/race-grid"));
const activities = process.argv.slice(3).length ? process.argv.slice(3).map(Number) : [0, 3];
if (activities.some(id => !Number.isInteger(id) || id < 0 || id > 23)) throw new Error("Use ordinary race IDs 0..23.");
const game = process.env.RTA_GAME_DIR;
const executablePath = process.env.RTA_CHROMIUM_EXECUTABLE;
if (!game || !executablePath) throw new Error("Set RTA_GAME_DIR and RTA_CHROMIUM_EXECUTABLE to the local PAL files and Chromium executable.");
let require = createRequire(import.meta.url);
try { require.resolve("playwright"); }
catch {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw new Error("Install Playwright or use the provided Codex runtime.");
  require = createRequire(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, "rta-capture.cjs"));
}
const { chromium } = require("playwright");
const browser = await chromium.launch({ headless: true, executablePath,
  args: ["--no-sandbox", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const bundle = await readFile(path.join(repoRoot, "rtao/sandbox-dist/rta-sandbox-capture.js"), "utf8");
const results = [];
try {
  await mkdir(output, { recursive: true });
  for (const activityId of activities) {
    let first;
    for (let repeat = 0; repeat < 2; repeat++) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
      const errors = [];
      page.on("pageerror", error => errors.push(String(error)));
      try {
        await page.setContent("<input id=files type=file multiple>");
        await page.addScriptTag({ content: bundle });
        await page.setInputFiles("#files", ["cue", "bin"].map(ext => path.join(game, `Road Trip Adventure (Europe) (En,Fr,De).${ext}`)));
        const result = await page.evaluate(async id => window.__rtaSandboxCapture.captureRaceGridFromBrowserFiles(
          id, Array.from(document.querySelector("#files").files)), activityId);
        if (errors.length) throw new Error(errors.join("\n"));
        const { dataUrl, ...summary } = result;
        const png = Buffer.from(dataUrl.split(",")[1], "base64");
        summary.sha256 = createHash("sha256").update(png).digest("hex");
        if (first && first.sha256 !== summary.sha256) throw new Error(`Activity ${activityId} repeat PNG changed.`);
        if (repeat === 0) {
          first = summary;
          await writeFile(path.join(output, `race-${String(activityId).padStart(2, "0")}-grid.png`), png);
        }
      } finally { await page.close(); }
    }
    results.push({ ...first, repeatIdentical: true });
    console.log(`${first.activityName}: ${first.entrants.length} native entrants; repeat pixels identical.`);
  }
  await writeFile(path.join(output, "race-grid-evidence.json"), JSON.stringify({ authority: "SLES_513.56", results }, null, 2) + "\n");
} finally { await browser.close(); }
