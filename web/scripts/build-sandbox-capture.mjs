import { build } from "vite";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const fixtureCompilerSources = [
  "src/core/binary.ts",
  "src/formats/field.ts",
  "src/formats/fieldGeometry.ts",
  "src/formats/fieldMinimap.ts",
  "src/formats/gsTextures.ts",
  "src/formats/ps2.ts",
];

const fixtureCompilerHash = createHash("sha256");
for (const relativePath of fixtureCompilerSources) {
  fixtureCompilerHash.update(relativePath);
  fixtureCompilerHash.update("\0");
  fixtureCompilerHash.update(await readFile(resolve(root, relativePath)));
  fixtureCompilerHash.update("\0");
}
const fixtureCompilerFingerprint = fixtureCompilerHash.digest("hex");

await build({
  root,
  configFile: false,
  publicDir: false,
  define: {
    __RTA_DEV_FIXTURE_COMPILER_FINGERPRINT__: JSON.stringify(fixtureCompilerFingerprint),
  },
  build: {
    outDir: "sandbox-dist",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: resolve(root, "src/sandboxCaptureRunner.ts"),
      name: "RtaSandboxCapture",
      formats: ["iife"],
      fileName: () => "rta-sandbox-capture.js",
    }
  },
});
