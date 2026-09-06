// @ts-expect-error Node builtin — @types/node is intentionally absent from this browser-focused project.
import { createReadStream, statSync } from "node:fs";
// @ts-expect-error Node builtin — see above.
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

declare const process: { env: Record<string, string | undefined> };

/**
 * DEV-ONLY: serves the local PAL BIN/CUE over http so a `?devdisc` page load can
 * import the world without a manual file picker. Never applied to a production
 * build. Point RTA_DEV_DISC_DIR at the directory holding the .bin/.cue.
 */
function devDiscPlugin() {
  const dir = process.env.RTA_DEV_DISC_DIR ?? "C:/Claude/Inbox/game";
  return {
    name: "rta-dev-disc",
    apply: "serve" as const,
    configureServer(server: { middlewares: { use(route: string, handler: (request: any, response: any) => void): void } }) {
      server.middlewares.use("/__dev-disc", (request, response) => {
        try {
          const name = new URL(request.url ?? "", "http://localhost").searchParams.get("name");
          if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
            response.statusCode = 400;
            response.end("bad name");
            return;
          }
          const path = resolve(dir, name);
          const size = statSync(path).size;
          response.setHeader("content-type", "application/octet-stream");
          response.setHeader("content-length", String(size));
          // The PAL BIN is ~590 MB; never let the browser disk-cache it.
          response.setHeader("cache-control", "no-store");
          createReadStream(path).pipe(response);
        } catch (error) {
          response.statusCode = 404;
          response.end(String(error));
        }
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [devDiscPlugin()],
  server: {
    host: "127.0.0.1",
    port: 4173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
  build: {
    // Three.js is loaded only after a valid local install is restored. Its dedicated
    // viewer chunk is expected to be just over Vite's generic 500 kB advisory.
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
