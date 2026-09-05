import type { ImportManifest } from "../storage/opfs";

export type ImportWorkerRequest = {
  readonly type: "import";
  readonly importId: string;
  readonly files: File[];
};

export type ImportWorkerResponse =
  | {
      readonly type: "progress";
      readonly phase: string;
      readonly detail: string;
      readonly completed: number;
      readonly total: number;
    }
  | {
      readonly type: "complete";
      readonly manifest: ImportManifest;
    }
  | {
      readonly type: "error";
      readonly message: string;
      readonly stack?: string;
    };
