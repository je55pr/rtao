import { requiredElement } from "./dom";

export interface AppDomBindings {
  dropZone: HTMLLabelElement;
  fileInput: HTMLInputElement;
  emptyState: HTMLElement;
  viewerHost: HTMLElement;
  installedPanel: HTMLElement;
  importCard: HTMLElement;
  importPhase: HTMLElement;
  importDetail: HTMLElement;
  progressBar: HTMLElement;
  progressLabel: HTMLElement;
  errorCard: HTMLElement;
  errorDetail: HTMLElement;
  cancelImportButton: HTMLButtonElement;
  worldLocation: HTMLSelectElement;
  worldTime: HTMLSelectElement;
  worldVisibility: HTMLSelectElement;
  driveToggle: HTMLButtonElement;
}

export function bindAppDom(): AppDomBindings {
  return {
    dropZone: requiredElement<HTMLLabelElement>("drop-zone"),
    fileInput: requiredElement<HTMLInputElement>("file-input"),
    emptyState: requiredElement<HTMLElement>("empty-state"),
    viewerHost: requiredElement<HTMLElement>("viewer"),
    installedPanel: requiredElement<HTMLElement>("installed-panel"),
    importCard: requiredElement<HTMLElement>("import-card"),
    importPhase: requiredElement<HTMLElement>("import-phase"),
    importDetail: requiredElement<HTMLElement>("import-detail"),
    progressBar: requiredElement<HTMLElement>("progress-bar"),
    progressLabel: requiredElement<HTMLElement>("progress-label"),
    errorCard: requiredElement<HTMLElement>("error-card"),
    errorDetail: requiredElement<HTMLElement>("error-detail"),
    cancelImportButton: requiredElement<HTMLButtonElement>("cancel-import"),
    worldLocation: requiredElement<HTMLSelectElement>("world-location"),
    worldTime: requiredElement<HTMLSelectElement>("world-time"),
    worldVisibility: requiredElement<HTMLSelectElement>("world-visibility"),
    driveToggle: requiredElement<HTMLButtonElement>("drive-toggle"),
  };
}
