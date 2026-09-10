import type { DialogueEntityInspection } from "../formats/dialogue";
import type { NativeRaceAiOutput } from "../game/raceAi";
export interface SandboxCaptureInputFile {
  readonly name: string;
  readonly bytes: ArrayBuffer | Uint8Array;
  readonly type?: string;
}

export interface SandboxCarVisualState {
  /** Native first-loadout selector bytes. Unmapped selectors remain visually neutral. */
  readonly equipmentSelectors?: readonly number[];
  /** Native packed RGB444 body/two-tone word. Omit to use the established Q62 fallback paint. */
  readonly paintWord?: number;
}

export interface SandboxCaptureRequest {
  readonly sceneId: string;
  readonly files: readonly SandboxCaptureInputFile[];
  readonly carVisualState?: SandboxCarVisualState;
  /**
   * True by default so field-overview captures match the normal browser world,
   * including neighbouring sectors when they are visible near the edges.
   */
  readonly loadFullWorld?: boolean;
}

export interface SandboxPreparedWorldInfo {
  readonly fieldNumbers: readonly number[];
  readonly triangleCount: number;
  readonly sourceKind: string;
  readonly bootExecutable: string;
}

export interface SandboxFieldSurfaceSummary {
  readonly fieldNumber: number;
  readonly collisionTriangleCount: number;
  readonly collisionFlags: readonly { readonly value: number; readonly count: number }[];
  readonly nativeTyreSurfaces: readonly {
    readonly code: number;
    readonly name: "dry" | "offroad" | "wet" | "grass" | "snow" | "ice" | "unknown";
    readonly count: number;
    readonly representative: readonly [number, number, number];
  }[];
  readonly renderedTriangleCount: number;
  readonly renderedTextureBasePointers: readonly { readonly value: number; readonly count: number; readonly averageRgb: readonly [number, number, number]; readonly visibleAlphaFraction: number }[];
  readonly collisionFlagTextureMatches: readonly { readonly flag: number; readonly textureBasePointer: number; readonly count: number }[];
  readonly unmatchedCollisionTriangles: number;
  readonly roadTriangleCount: number;
  readonly pavedRoadTriangleCount: number;
  readonly dirtRoadTriangleCount: number;
}

export interface SandboxDevFixtureSourceInfo {
  readonly fieldNumbers: readonly number[];
  readonly compiledFieldCacheVersion: number;
  readonly sourceKind: string;
  readonly bootExecutable: string;
}

export interface SandboxDevFixtureAssetInfo {
  readonly filename: string;
  readonly byteLength: number;
}

export interface SandboxDevFixtureManifest {
  readonly schemaVersion: 1;
  readonly compiledFieldCacheVersion: number;
  readonly compilerFingerprint: string;
  readonly bootExecutable: string;
  readonly fieldNumbers: readonly number[];
}

export interface SandboxCaptureResult {
  readonly sceneId: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly pngBytes: number[];
  readonly fieldNumbers: readonly number[];
  readonly triangleCount: number;
  readonly sourceKind: string;
  readonly bootExecutable: string;
}

export interface SandboxShopInteriorDialogueInfo {
  readonly areaIndex: number;
  readonly slotIndex: number;
  readonly interactionName: string;
  readonly entityName: string;
  readonly entityIndex: number;
  readonly currentSlot: number;
  readonly pages: readonly string[];
  readonly choices: readonly { text: string; targetSlot: number; isDefault: boolean }[];
  readonly externalAction?: { opcode: number; operands: readonly number[] };
  readonly variantCount: number;
  readonly actionShapes: readonly { opcode: number; operands: readonly number[] }[];
  readonly controlShapes: readonly { opcode: number; operands: readonly number[] }[];
  readonly controlOpcodes: readonly number[];
  readonly remainingIndexedFlags: readonly (readonly [number, number])[];
  readonly stamps: readonly number[];
  readonly quickPicPhotos: readonly number[];
  readonly metFixedInteractions: readonly (readonly [number, number])[];
}

export interface SandboxShopInteriorDialogueState {
  readonly startSlot?: number;
  readonly indexedFlags?: readonly (readonly [number, number])[];
  readonly stamps?: readonly number[];
  readonly quickPicPhotos?: readonly number[];
  readonly metFixedInteractions?: readonly (readonly [number, number])[];
  readonly applyExternalAction?: boolean;
}

export interface SandboxShopInteriorCensusEntry {
  readonly areaIndex: number;
  readonly fieldNumber: number;
  readonly slotIndex: number;
  readonly interactionName: string;
  readonly packagePath: string;
  readonly staffBodyId: number;
  readonly entityName?: string;
  readonly entityIndex?: number;
  readonly variantCount?: number;
  readonly entrySlot?: number;
  readonly entryPages?: readonly string[];
  readonly entryChoices?: readonly { text: string; targetSlot: number; isDefault: boolean }[];
  readonly entryExternalAction?: { opcode: number; operands: readonly number[] };
  readonly actionShapes?: readonly { opcode: number; operands: readonly number[] }[];
  readonly controlShapes?: readonly { opcode: number; operands: readonly number[] }[];
  readonly controlOpcodes?: readonly number[];
  readonly dialogueError?: string;
}

export interface SandboxShopInteriorDialogueEntityTrace extends DialogueEntityInspection {
  readonly slotIndex: number;
  readonly interactionName: string;
}

export interface SandboxCaptureApi {
  runCapture(request: SandboxCaptureRequest): Promise<SandboxCaptureResult>;
  runCaptureFromBrowserFiles(sceneId: string, files: readonly File[], loadFullWorld?: boolean, carVisualState?: SandboxCarVisualState): Promise<SandboxCaptureResult>;
  /** Fast one-field Q62 regression path for native paint/equipment comparisons. */
  captureCarVisualFromBrowserFiles(sceneId: string, files: readonly File[], state?: SandboxCarVisualState): Promise<SandboxCaptureResult>;
  /** Same fast car path without serialising PNG bytes into a JS number array. */
  captureCarVisualDataUrlFromBrowserFiles(sceneId: string, files: readonly File[], state?: SandboxCarVisualState): Promise<string>;
  /** Prepare one car-visual field + Q62 assets once for cheap multi-angle/multi-lighting captures. */
  prepareCarVisualFromBrowserFiles(sceneId: string, files: readonly File[], state?: SandboxCarVisualState): Promise<SandboxPreparedWorldInfo>;
  capturePreparedCarVisualDataUrl(sceneId: string, state?: SandboxCarVisualState): Promise<string>;
  disposePreparedCarVisual(): void;
  prepareOutdoorFromBrowserFiles(files: readonly File[], loadFullWorld?: boolean, requestedFieldNumbers?: readonly number[]): Promise<SandboxPreparedWorldInfo>;
  /**
   * Low-memory regression path: load SORA.GSL + serialized RTAFLD*.mesh files
   * without opening the PAL disc or invoking the field compiler.
   */
  prepareOutdoorFromFixtureBrowserFiles(files: readonly File[]): Promise<SandboxPreparedWorldInfo>;
  capturePreparedOutdoor(sceneId: string): Promise<SandboxCaptureResult>;
  /** Fast path for sandbox automation: avoids serialising ~1M PNG bytes as a JS number array. */
  capturePreparedOutdoorDataUrl(sceneId: string): Promise<string>;
  disposePreparedOutdoor(): void;
  /**
   * One-time fixture builder. Keeps the PAL disc open but exports one asset per
   * call so automation never serializes several compiled fields at once.
   */
  prepareDevFixtureSourceFromBrowserFiles(files: readonly File[]): Promise<SandboxDevFixtureSourceInfo>;
  devFixtureManifest(fieldNumbers: readonly number[]): SandboxDevFixtureManifest;
  downloadPreparedDevFixtureSky(): Promise<SandboxDevFixtureAssetInfo>;
  downloadPreparedDevFixtureField(fieldNumber: number): Promise<SandboxDevFixtureAssetInfo>;
  disposePreparedDevFixtureSource(): Promise<void>;
  /** Decode every fixed SHOP slot for one area into a labelled contact sheet. */
  captureShopPackageContactSheetDataUrl(areaIndex: number, files: readonly File[]): Promise<string>;
  /** Render one SHOP slot through the shared fixed-camera floor/scenery composition. */
  captureShopInteriorRoomDataUrl(areaIndex: number, slotIndex: number, files: readonly File[]): Promise<string>;
  /** Return the complete authored 0x3F000-byte SHOP slot, including currently unrendered packets. */
  readShopInteriorSlotDataUrl(areaIndex: number, slotIndex: number, files: readonly File[]): Promise<string>;
  /** Decode the executable interaction/dialogue boundary paired with one SHOP slot. */
  inspectShopInteriorDialogue(areaIndex: number, slotIndex: number, files: readonly File[], choicePath?: readonly number[], state?: SandboxShopInteriorDialogueState): Promise<SandboxShopInteriorDialogueInfo>;
  /** Decode every executable-mapped fixed interaction in one source session. */
  inspectShopInteriorCensus(files: readonly File[]): Promise<readonly SandboxShopInteriorCensusEntry[]>;
  /** Dump selected executable dialogue entities with ordered tokens and raw bytes. */
  inspectShopInteriorDialogueEntities(requests: readonly { areaIndex: number; slotIndex: number }[], files: readonly File[]): Promise<readonly SandboxShopInteriorDialogueEntityTrace[]>;
  /** Summarise raw PAL collision flags and rendered field material pointers for driving-surface archaeology. */
  inspectFieldSurfaceMetadata(fieldNumbers: readonly number[], files: readonly File[]): Promise<readonly SandboxFieldSurfaceSummary[]>;
  /** Read a bounded file-backed PAL executable virtual-address range. */
  inspectExecutableVirtualBytes(address: number, byteLength: number, files: readonly File[]): Promise<readonly number[]>;
  /** Decode the executable-owned race/activity descriptors and area selector ranges. */
  inspectRaceCatalogue(files: readonly File[]): Promise<SandboxRaceCatalogueSummary>;
  /** Compile one PAL COURSE/Cxx package through the shared field geometry/collision readers. */
  inspectRaceCourse(courseId: number, files: readonly File[]): Promise<SandboxRaceCourseSummary>;
  /** Deterministic native grid/body/paint inspection; no simulated race movement. */
  captureRaceGridFromBrowserFiles(activityId: number, files: readonly File[]): Promise<SandboxRaceGridCapture>;
}

export interface SandboxRaceGridCapture {
  readonly activityId: number;
  readonly activityName: string;
  readonly courseId: number;
  readonly dataUrl: string;
  readonly sha256: string;
  readonly entrants: readonly {
    readonly carIndex: number;
    readonly name: string;
    readonly startIndex: number;
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly yaw: number;
    readonly ai: NativeRaceAiOutput | null;
  }[];
  readonly visualEquipment: string;
}

export interface SandboxRaceCatalogueSummary {
  readonly selectorRanges: readonly { readonly areaIndex: number; readonly firstActivityId: number; readonly activityCount: number }[];
  readonly finishGates: readonly {
    readonly courseId: number;
    readonly strips: readonly { readonly minimumX: number; readonly minimumZ: number; readonly maximumX: number; readonly maximumZ: number }[];
  }[];
  readonly startAnchors: readonly {
    readonly courseId: number;
    readonly nativeX: number;
    readonly nativeY: number;
    readonly nativeZ: number;
    readonly headingQuarterTurns: number;
    readonly lateralPolarity: number;
    readonly firstSixSeeds: readonly {
      readonly startIndex: number;
      readonly nativeX: number;
      readonly nativeY: number;
      readonly nativeZ: number;
      readonly nativeYaw: number;
    }[];
  }[];
  readonly navigationCourses: readonly {
    readonly courseId: number;
    readonly gateTableAddress: number;
    readonly recordTableAddress: number;
    readonly gateCount: number;
    readonly recordCount: number;
    readonly firstForwardBoundaryGateIndex: number;
  }[];
  readonly activities: readonly {
    readonly activityId: number;
    readonly name: string;
    readonly ordinaryRace: boolean;
    readonly descriptorAddress: number;
    readonly sceneId: number;
    readonly rawParameter1: number;
    readonly rawParameter2: number;
    readonly variantId: number;
    readonly settingsAddress: number;
    readonly participantListAddress: number;
    readonly participants: readonly { readonly areaIndex: number; readonly residentIndex: number }[];
    readonly soloEntrants?: readonly {
      readonly kind: "player" | "teammate" | "opponent";
      readonly carIndex: number;
      readonly configPointerIndex: number;
      readonly participantIndex?: number;
      readonly startIndex: number;
      readonly packedCreationFlags: number;
      readonly controlSource: "human-input" | "ordinary-ai";
      readonly controllerIndex: 0 | null;
      readonly seed: {
        readonly courseId: number;
        readonly startIndex: number;
        readonly nativeX: number;
        readonly nativeY: number;
        readonly nativeZ: number;
        readonly nativeYaw: number;
      };
    }[];
    readonly rawSettings: readonly number[];
    readonly handlerAAddress: number;
    readonly handlerBAddress: number;
  }[];
}

export interface SandboxRaceCourseSummary {
  readonly courseId: number;
  readonly path: string;
  readonly byteLength: number;
  readonly sectionOffsets: readonly number[];
  readonly renderChunkCount: number;
  readonly populatedRenderChunkCount: number;
  readonly collisionChunkCount: number;
  readonly populatedCollisionChunkCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly primitiveCount: number;
  readonly textureCount: number;
  readonly batchCount: number;
  readonly collisionTriangleCount: number;
  readonly navigation: {
    readonly gateTableAddress: number;
    readonly recordTableAddress: number;
    readonly gates: readonly {
      readonly gateIndex: number;
      readonly endpointA: { readonly nativeX: number; readonly nativeZ: number };
      readonly endpointB: { readonly nativeX: number; readonly nativeZ: number };
      readonly branchPoint: { readonly nativeX: number; readonly nativeZ: number };
    }[];
    readonly records: readonly {
      readonly recordIndex: number;
      readonly backwardBoundaryGateIndex: number;
      readonly forwardBoundaryGateIndex: number;
      readonly backwardRecordIndices: readonly [number, number];
      readonly forwardRecordIndices: readonly [number, number];
      readonly selectorOutput: number;
      readonly reservedByte: number;
    }[];
  };
  readonly groundedStartGrid: readonly {
    readonly courseId: number;
    readonly startIndex: number;
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly yaw: number;
    readonly surfaceFlags: number;
  }[];
}

declare global {
  interface Window {
    __rtaSandboxCapture?: SandboxCaptureApi;
  }
}
