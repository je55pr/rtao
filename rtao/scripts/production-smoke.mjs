import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright-core";

const root = resolve(import.meta.dirname, "../dist");
if (!existsSync(join(root, "index.html"))) {
  throw new Error("Production smoke requires dist/. Run npm run build:web first.");
}

const browserPath = findBrowser();
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const file = resolve(root, relative);
  if (!file.startsWith(`${root}\\`) && !file.startsWith(`${root}/`) && file !== join(root, "index.html")) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = readFileSync(file);
    response.writeHead(200, { "content-type": mime(file), "cache-control": "no-store" });
    response.end(body);
  } catch {
    response.writeHead(404).end("not found");
  }
});

await new Promise((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Smoke server did not expose a TCP port.");
const baseUrl = `http://127.0.0.1:${address.port}/`;
let browser;
try {
  browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const page = await browser.newPage();
  const failures = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => failures.push(`request failed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`));
  page.on("response", (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) failures.push(`HTTP ${response.status()}: ${response.url()}`);
  });

  const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
  if (!response?.ok()) throw new Error(`Production shell returned HTTP ${response?.status() ?? "unknown"}.`);
  await page.locator("#empty-state").waitFor({ state: "visible" });
  const headline = (await page.locator("#empty-state h1").innerText()).replace(/\s+/g, " ").trim();
  if (!headline.includes("Your road trip")) throw new Error(`Unexpected first-run headline: '${headline}'.`);
  if (!(await page.locator("#file-input").isEnabled())) throw new Error("First-run game-file input is not enabled.");

  const mainScript = await page.locator('script[type="module"][src]').getAttribute("src");
  if (!mainScript) throw new Error("Built page has no module entry script.");
  const mainUrl = new URL(mainScript, baseUrl).href;
  const mainResponse = await page.request.get(mainUrl);
  if (!mainResponse.ok()) throw new Error(`Built entry script failed with HTTP ${mainResponse.status()}.`);
  const mainSource = await mainResponse.text();
  const workerMatch = /import\.worker-[A-Za-z0-9_-]+\.js/.exec(mainSource);
  if (!workerMatch) throw new Error("Built entry script does not reference the import worker asset.");
  const workerResponse = await page.request.get(new URL(workerMatch[0], mainUrl).href);
  if (!workerResponse.ok()) throw new Error(`Built import worker failed with HTTP ${workerResponse.status()}.`);

  if (failures.length) throw new Error(`Production browser failures:\n${failures.join("\n")}`);
  console.log(`Production smoke passed in ${browserPath}: shell, entry assets, and import worker are reachable.`);
} finally {
  await browser?.close();
  await new Promise((resolveClosed) => server.close(resolveClosed));
}
function findBrowser() {
  const candidates = [
    process.env.RTA_SMOKE_BROWSER,
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Google/Chrome/Application/chrome.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("No supported local Chrome/Chromium executable was found. Set RTA_SMOKE_BROWSER to its path.");
  return found;
}

function mime(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  })[extname(file).toLowerCase()] ?? "application/octet-stream";
}
