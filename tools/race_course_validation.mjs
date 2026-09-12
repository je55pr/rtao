#!/usr/bin/env node
/** Validate every executable-referenced PAL ordinary course without enabling gameplay launches. */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolsDir, "..");
const outputDir = path.resolve(process.argv[2] ?? path.join(repoRoot, "artifacts/course-validation"));
const gameDir = process.env.RTA_GAME_DIR;
const executablePath = process.env.RTA_CHROMIUM_EXECUTABLE;
if (!gameDir || !executablePath) {
  throw new Error("Set RTA_GAME_DIR and RTA_CHROMIUM_EXECUTABLE.");
}

const gameFiles = await readdir(gameDir);
const cueName = gameFiles.find((name) => name.toLowerCase().endsWith(".cue"));
const binName = gameFiles.find((name) => name.toLowerCase().endsWith(".bin"));
if (!cueName || !binName) throw new Error("RTA_GAME_DIR must contain one PAL BIN/CUE pair.");
const sourcePaths = [path.join(gameDir, cueName), path.join(gameDir, binName)];
const bundlePath = path.join(repoRoot, "rtao/sandbox-dist/rta-sandbox-capture.js");
const bundle = await readFile(bundlePath, "utf8");
const require = createRequire(path.join(repoRoot, "rtao/package.json"));
const { chromium } = require("playwright-core");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--no-sandbox", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
page.setDefaultTimeout(900_000);
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
await page.setContent("<input id=files type=file multiple>");
await page.addScriptTag({ content: bundle });
await page.setInputFiles("#files", sourcePaths);

const catalogue = await page.evaluate(async () => window.__rtaSandboxCapture.inspectRaceCatalogue(
  Array.from(document.querySelector("#files").files),
));
const ordinary = catalogue.activities.filter((activity) => activity.ordinaryRace);
const firstActivityByCourse = new Map();
for (const activity of ordinary) {
  if (!firstActivityByCourse.has(activity.sceneId)) firstActivityByCourse.set(activity.sceneId, activity);
}
const selected = [...firstActivityByCourse.entries()].sort((left, right) => left[0] - right[0]);
if (selected.length !== 15 || selected.some(([courseId], index) => courseId !== index)) {
  throw new Error(`Expected ordinary course IDs C00-C14; got ${selected.map(([id]) => id).join(",")}.`);
}
const results = [];
try {
  for (const [courseId, activity] of selected) {
    const course = await page.evaluate(async (id) => window.__rtaSandboxCapture.inspectRaceCourse(
      id,
      Array.from(document.querySelector("#files").files),
    ), courseId);
    const overviewCapture = await page.evaluate(async (id) => window.__rtaSandboxCapture.captureRaceCourseOverviewFromBrowserFiles(
      id,
      Array.from(document.querySelector("#files").files),
    ), courseId);
    const overviewPng = Buffer.from(overviewCapture.dataUrl.split(",")[1], "base64");
    const overview = { ...overviewCapture, dataUrl: undefined, sha256: createHash("sha256").update(overviewPng).digest("hex") };
    await writeFile(path.join(outputDir, `C${String(courseId).padStart(2, "0")}-overview.png`), overviewPng);
    const captures = [];
    for (let repeat = 0; repeat < 2; repeat += 1) {
      const capture = await page.evaluate(async (activityId) => window.__rtaSandboxCapture.captureRaceGridFromBrowserFiles(
        activityId,
        Array.from(document.querySelector("#files").files),
      ), activity.activityId);
      const png = Buffer.from(capture.dataUrl.split(",")[1], "base64");
      const sha256 = createHash("sha256").update(png).digest("hex");
      captures.push({ ...capture, dataUrl: undefined, sha256 });
      if (repeat === 0) {
        await writeFile(path.join(outputDir, `C${String(courseId).padStart(2, "0")}-grid.png`), png);
      }
    }
    const surfaceCounts = new Map();
    for (const start of course.groundedStartGrid) {
      surfaceCounts.set(start.surfaceFlags, (surfaceCounts.get(start.surfaceFlags) ?? 0) + 1);
    }
    const ys = course.groundedStartGrid.map((start) => start.position.y);
    const repeatIdentical = captures[0].sha256 === captures[1].sha256;
    results.push({ courseId, activityId: activity.activityId, activityName: activity.name, course, overview,
      capture: captures[0], repeatIdentical, groundedStartCount: course.groundedStartGrid.length,
      startYRange: [Math.min(...ys), Math.max(...ys)],
      startSurfaceFlags: [...surfaceCounts].map(([value, count]) => ({ value, count })) });
    console.log(`C${String(courseId).padStart(2, "0")} ${activity.name}: ${course.triangleCount.toLocaleString()} render / ${course.collisionTriangleCount.toLocaleString()} collision; grid repeat ${repeatIdentical ? "identical" : "CHANGED"}.`);
  }
} finally {
  await browser.close();
}
const evidence = {
  authority: "European PAL SLES_513.56 and original COURSE/Cxx packages supplied locally",
  ordinaryRaceCount: ordinary.length,
  courseIds: selected.map(([courseId]) => courseId),
  pageErrors,
  results,
};
await writeFile(path.join(outputDir, "course-validation.json"), `${JSON.stringify(evidence, null, 2)}\n`);
const summaryResults = results.map((result) => ({
  courseId: result.courseId, activityId: result.activityId, activityName: result.activityName,
  renderTriangles: result.course.triangleCount, collisionTriangles: result.course.collisionTriangleCount,
  renderVertices: result.course.vertexCount, textures: result.course.textureCount,
  groundedStartCount: result.groundedStartCount, startYRange: result.startYRange, startSurfaceFlags: result.startSurfaceFlags,
  gridEntrants: result.capture.entrants.length, gridSha256: result.capture.sha256, gridRepeatIdentical: result.repeatIdentical,
  overviewSha256: result.overview.sha256,
}));
const safeSummary = { authority: "European PAL SLES_513.56 and local original COURSE/Cxx packages", ordinaryRaceCount: ordinary.length,
  uniqueCourseCount: results.length, courseIds: selected.map(([courseId]) => courseId), pageErrorCount: pageErrors.length,
  totals: { renderTriangles: summaryResults.reduce((sum, result) => sum + result.renderTriangles, 0),
    collisionTriangles: summaryResults.reduce((sum, result) => sum + result.collisionTriangles, 0),
    groundedStarts: summaryResults.reduce((sum, result) => sum + result.groundedStartCount, 0) },
  results: summaryResults };
await writeFile(path.join(outputDir, "course-validation-summary.json"), `${JSON.stringify(safeSummary, null, 2)}\n`);

const failed = results.filter((result) =>
  !result.repeatIdentical
  || result.groundedStartCount !== 24
  || result.course.triangleCount <= 0
  || result.course.collisionTriangleCount <= 0
  || result.capture.entrants.length !== 24
  || result.overview.triangleCount !== result.course.triangleCount
);
if (pageErrors.length) {
  console.warn(`Browser page errors: ${pageErrors.join(" | ")}`);
}
console.log(`Validated ${results.length} unique ordinary courses; ${failed.length} automatic acceptance failure(s).`);
if (failed.length || pageErrors.length) process.exitCode = 1;
