/// <reference lib="webworker" />

import { importGame } from "./importGame";
import type { ImportWorkerRequest, ImportWorkerResponse } from "./messages";

const worker = self as DedicatedWorkerGlobalScope;

worker.addEventListener("message", (event: MessageEvent<ImportWorkerRequest>) => {
  if (event.data.type !== "import") return;
  void runImport(event.data.files, event.data.importId, event.data.devOnlyFields);
});

async function runImport(files: File[], importId: string, devOnlyFields?: readonly number[]): Promise<void> {
  let ready = false;
  try {
    const manifest = await importGame(files, (phase, detail, completed, total) => {
      post({ type: "progress", phase, detail, completed, total });
    }, importId, devOnlyFields, (bootstrapManifest) => {
      ready = true;
      post({ type: "ready", manifest: bootstrapManifest });
    });
    post({ type: "complete", manifest });
  } catch (error) {
    post({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      background: ready,
    });
  }
}

function post(message: ImportWorkerResponse): void {
  worker.postMessage(message);
}

export {};
