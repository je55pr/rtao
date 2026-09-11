import type { ImportWorkerResponse } from "../importer/messages";
import {
  readCurrentManifest,
  removeImportDirectory,
  type ImportManifest,
} from "../storage/opfs";

export interface ImportControllerCallbacks {
  showEmpty(): void;
  showImport(): void;
  updateProgress(phase: string, detail: string, completed: number, total: number): void;
  showInstalled(manifest: ImportManifest): Promise<void>;
  installCompleted?(manifest: ImportManifest): void | Promise<void>;
  backgroundImportFailed?(error: unknown): void;
  showError(title: string, error: unknown): void;
}

export class ImportController {
  private activeWorker: Worker | undefined;
  private activeImportId: string | undefined;

  constructor(private readonly callbacks: ImportControllerCallbacks) {}

  async restore(): Promise<void> {
    try {
      const manifest = await readCurrentManifest();
      if (!manifest) {
        this.callbacks.showEmpty();
        return;
      }
      await this.callbacks.showInstalled(manifest);
    } catch (error) {
      this.callbacks.showError("The saved browser install could not be restored.", error);
    }
  }

  async start(files: File[], devOnlyFields?: readonly number[]): Promise<void> {
    this.activeWorker?.terminate();
    if (this.activeImportId) await removeImportDirectory(this.activeImportId).catch(() => undefined);
    this.activeImportId = undefined;
    this.callbacks.showImport();
    await navigator.storage.persist?.().catch(() => false);

    const worker = new Worker(new URL("../importer/import.worker.ts", import.meta.url), { type: "module" });
    const importId = crypto.randomUUID();
    this.activeWorker = worker;
    this.activeImportId = importId;
    const startedAt = performance.now();
    let readyShown = false;
    let showInstalledPromise: Promise<void> | undefined;

    worker.addEventListener("message", (event: MessageEvent<ImportWorkerResponse>) => {
      const message = event.data;
      if (message.type === "progress") {
        if (!readyShown) this.callbacks.updateProgress(message.phase, message.detail, message.completed, message.total);
      } else if (message.type === "ready") {
        readyShown = true;
        console.info(`RTA import: Peach Town cache ready in ${Math.round(performance.now() - startedAt)} ms; background install continues.`);
        showInstalledPromise = this.callbacks.showInstalled(message.manifest).catch((error) => {
          this.callbacks.showError("Peach Town was cached, but the playable world could not be displayed.", error);
        });
      } else if (message.type === "complete") {
        this.activeWorker = undefined;
        this.activeImportId = undefined;
        worker.terminate();
        console.info(`RTA import: full local cache finished in ${Math.round(performance.now() - startedAt)} ms.`);
        if (readyShown) {
          void (showInstalledPromise ?? Promise.resolve())
            .then(() => this.callbacks.installCompleted?.(message.manifest))
            .catch((error) => this.callbacks.backgroundImportFailed?.(error));
        } else {
          void this.callbacks.showInstalled(message.manifest).catch((error) =>
            this.callbacks.showError("The local install finished, but the outdoor world could not be displayed.", error));
        }
      } else {
        this.activeWorker = undefined;
        this.activeImportId = undefined;
        worker.terminate();
        const error = new Error(message.message);
        if (message.background && readyShown) this.callbacks.backgroundImportFailed?.(error);
        else this.callbacks.showError("That game image could not be imported.", error);
      }
    });

    worker.addEventListener("error", (event) => {
      const failedImportId = this.activeImportId;
      this.activeWorker = undefined;
      this.activeImportId = undefined;
      worker.terminate();
      if (failedImportId && !readyShown) void removeImportDirectory(failedImportId).catch(() => undefined);
      const error = new Error(event.message);
      if (readyShown) this.callbacks.backgroundImportFailed?.(error);
      else this.callbacks.showError("The local import worker stopped unexpectedly.", error);
    });

    worker.postMessage({ type: "import", importId, files, devOnlyFields });
  }

  async cancel(): Promise<void> {
    this.activeWorker?.terminate();
    this.activeWorker = undefined;
    const importId = this.activeImportId;
    this.activeImportId = undefined;
    if (importId) await removeImportDirectory(importId).catch(() => undefined);
    this.callbacks.showEmpty();
  }
}
