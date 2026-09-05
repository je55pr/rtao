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

  async start(files: File[]): Promise<void> {
    this.activeWorker?.terminate();
    if (this.activeImportId) await removeImportDirectory(this.activeImportId).catch(() => undefined);
    this.activeImportId = undefined;
    this.callbacks.showImport();
    await navigator.storage.persist?.().catch(() => false);

    const worker = new Worker(new URL("../importer/import.worker.ts", import.meta.url), { type: "module" });
    const importId = crypto.randomUUID();
    this.activeWorker = worker;
    this.activeImportId = importId;

    worker.addEventListener("message", (event: MessageEvent<ImportWorkerResponse>) => {
      const message = event.data;
      if (message.type === "progress") {
        this.callbacks.updateProgress(message.phase, message.detail, message.completed, message.total);
      } else if (message.type === "complete") {
        this.activeWorker = undefined;
        this.activeImportId = undefined;
        worker.terminate();
        void this.callbacks.showInstalled(message.manifest).catch((error) =>
          this.callbacks.showError("The local install finished, but the outdoor world could not be displayed.", error));
      } else {
        this.activeWorker = undefined;
        this.activeImportId = undefined;
        worker.terminate();
        this.callbacks.showError("That game image could not be imported.", new Error(message.message));
      }
    });

    worker.addEventListener("error", (event) => {
      const failedImportId = this.activeImportId;
      this.activeWorker = undefined;
      this.activeImportId = undefined;
      worker.terminate();
      if (failedImportId) void removeImportDirectory(failedImportId).catch(() => undefined);
      this.callbacks.showError("The local import worker stopped unexpectedly.", new Error(event.message));
    });

    worker.postMessage({ type: "import", importId, files });
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
