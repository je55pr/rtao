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
  gameHud: HTMLElement;
  hudLocation: HTMLElement;
  hudCake: HTMLElement;
  hudSpeed: HTMLElement;
  hudStatus: HTMLElement;
  hudHint: HTMLElement;
  raceResultsOverlay: HTMLElement;
  raceResultsTitle: HTMLElement;
  raceResultsPlaces: HTMLElement;
  raceResultsPrize: HTMLElement;
  raceResultsBalance: HTMLElement;
  raceResultsBest: HTMLElement;
  raceResultsPromotion: HTMLElement;
  raceResultsReturn: HTMLButtonElement;
  debugOverlay: HTMLElement;
  debugLiveRows: HTMLElement;
  pauseOverlay: HTMLElement;
  pauseStopDriving: HTMLButtonElement;
  pauseResume: HTMLButtonElement;
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
    gameHud: requiredElement<HTMLElement>("game-hud"),
    hudLocation: requiredElement<HTMLElement>("hud-location"),
    hudCake: requiredElement<HTMLElement>("hud-cake"),
    hudSpeed: requiredElement<HTMLElement>("hud-speed"),
    hudStatus: requiredElement<HTMLElement>("hud-status"),
    hudHint: requiredElement<HTMLElement>("hud-hint"),
    raceResultsOverlay: requiredElement<HTMLElement>("race-results-overlay"),
    raceResultsTitle: requiredElement<HTMLElement>("race-results-title"),
    raceResultsPlaces: requiredElement<HTMLElement>("race-results-places"),
    raceResultsPrize: requiredElement<HTMLElement>("race-results-prize"),
    raceResultsBalance: requiredElement<HTMLElement>("race-results-balance"),
    raceResultsBest: requiredElement<HTMLElement>("race-results-best"),
    raceResultsPromotion: requiredElement<HTMLElement>("race-results-promotion"),
    raceResultsReturn: requiredElement<HTMLButtonElement>("race-results-return"),
    debugOverlay: requiredElement<HTMLElement>("debug-overlay"),
    debugLiveRows: requiredElement<HTMLElement>("debug-live-rows"),
    pauseOverlay: requiredElement<HTMLElement>("pause-overlay"),
    pauseStopDriving: requiredElement<HTMLButtonElement>("pause-stop-driving"),
    pauseResume: requiredElement<HTMLButtonElement>("pause-resume"),
  };
}
