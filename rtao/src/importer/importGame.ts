import type { DiscEntry } from "../disc/iso9660";
import { readCollisionChunkDirectory, readFieldHeader, readRenderChunkDirectory } from "../formats/field";
import { compileFieldVertexColorMesh, compiledFieldCacheVersion, serializeCompiledField } from "../formats/fieldGeometry";
import { compileFieldCollision, serializeCompiledCollision } from "../formats/fieldCollision";
import { expectedEuropeanExecutable, readGameIdentity } from "../formats/gameIdentity";
import { carAssetPath } from "../formats/carPath";
import { readOverworldCatalogue, type OverworldCatalogue } from "../formats/overworld";
import { ordinaryRaceCourseIds as selectOrdinaryRaceCourseIds, readRaceCatalogue } from "../formats/raceCatalogue";
import { bodyShopBodyIds, peachBodyShopStock } from "../game/bodyCatalog";
import {
  cacheSchemaVersion,
  createImportDirectory,
  publishImport,
  readCurrentManifest,
  removeImportDirectory,
  writeBytes,
  writeFile,
  writeJson,
  type CachedFileRecord,
  type CompiledCollisionRecord,
  type CompiledFieldRecord,
  type CompiledRaceCourseCollisionRecord,
  type CompiledRaceCourseRecord,
  type FieldSummaryRecord,
  type ImportManifest,
  type RaceCourseSummaryRecord,
} from "../storage/opfs";
import { openImportSource } from "./source";

type Progress = (phase: string, detail: string, completed: number, total: number) => void;
type BootstrapReady = (manifest: ImportManifest) => void | Promise<void>;

const explicitlyRequired = [
  "SYSTEM.CNF",
  "SYS/SORA.GSL",
  "CARS/TIRE.BIN",
  "CARS/WHEEL.BIN",
  "SHOP/T00.BIN",
] as const;

export async function importGame(
  files: File[],
  progress: Progress,
  importId: string = crypto.randomUUID(),
  devOnlyFields?: readonly number[],
  bootstrapReady?: BootstrapReady,
): Promise<ImportManifest> {
  const previousImport = await readCurrentManifest();
  const importDirectory = await createImportDirectory(importId);
  let source: Awaited<ReturnType<typeof openImportSource>> | undefined;
  let bootstrapPublished = false;
  try {
    source = await openImportSource(files, importId, progress);
    const sourceKind = source.kind;
    progress("validate", "Reading SYSTEM.CNF", 0, 1);
    const identity = await readGameIdentity(source.disc);
    if (!identity.supported) {
      throw new Error(`Expected PAL ${expectedEuropeanExecutable}; found '${identity.bootExecutable}'.`);
    }

    const executableBytes = await source.disc.readFile(identity.bootExecutable);
    let runtimeCarBodyIds: readonly number[] | undefined;
    let bootstrapCarBodyIds: readonly number[] = [62, ...bodyShopBodyIds];
    let ordinaryRaceCourseIds: readonly number[] | undefined;
    try {
      const overworld = readOverworldCatalogue(executableBytes);
      let raceParticipantBodyIds: readonly number[] = [];
      try {
        const raceCatalogue = readRaceCatalogue(executableBytes);
        raceParticipantBodyIds = raceCatalogue.activities
          .flatMap((activity) => activity.participants.map((participant) => participant.bodyId));
        ordinaryRaceCourseIds = selectOrdinaryRaceCourseIds(raceCatalogue);
      } catch {
        // Older synthetic importer fixtures predate the race catalogue. Their
        // safe resident/shop selection remains sufficient for fixture tests.
      }
      runtimeCarBodyIds = browserRuntimeCarBodyIds(overworld, raceParticipantBodyIds);
      bootstrapCarBodyIds = browserBootstrapCarBodyIds(overworld);
    } catch {
      // Synthetic archaeology fixtures and future executable revisions may not
      // expose the current PAL tables. Retain the safe full-bank fallback.
      runtimeCarBodyIds = undefined;
    }
    // DEV-ONLY: a subset import skips the other FLDs and every race course so the
    // cache fits a small browser-storage quota during visual iteration.
    const devFieldSet = devOnlyFields && devOnlyFields.length > 0 ? new Set(devOnlyFields) : undefined;
    const selected = await selectRuntimeFiles(
      source.disc,
      identity.bootExecutable,
      runtimeCarBodyIds,
      devFieldSet ? undefined : ordinaryRaceCourseIds,
      devFieldSet,
    );
    const bootstrapPathSet = new Set([
      "SYSTEM.CNF", identity.bootExecutable, ...explicitlyRequired, "FLD/223.BIN",
      ...bootstrapCarBodyIds.map(carAssetPath),
    ].map((path) => path.toUpperCase()));
    const bootstrapEntries = devFieldSet ? [] : selected.filter((entry) => bootstrapPathSet.has(entry.path.toUpperCase()));
    const deferredEntries = devFieldSet ? selected : selected.filter((entry) => !bootstrapPathSet.has(entry.path.toUpperCase()));
    const orderedEntries = devFieldSet ? selected : [...bootstrapEntries, ...deferredEntries];
    const totalBytes = selected.reduce((sum, entry) => sum + entry.size, 0);
    await assertCacheHeadroom(totalBytes);
    const cachedFiles: CachedFileRecord[] = [];
    const fields: FieldSummaryRecord[] = [];
    const compiledFields: CompiledFieldRecord[] = [];
    const collisionFields: CompiledCollisionRecord[] = [];
    const raceCourses: RaceCourseSummaryRecord[] = [];
    const compiledRaceCourses: CompiledRaceCourseRecord[] = [];
    const raceCourseCollisions: CompiledRaceCourseCollisionRecord[] = [];
    const fieldTotal = selected.filter((entry) => /^FLD\/\d{3}\.BIN$/i.test(entry.path)).length;
    const raceCourseTotal = selected.filter((entry) => /^COURSE\/C\d{2}\.BIN$/i.test(entry.path)).length;
    let compiledFieldCount = 0;
    let compiledRaceCourseCount = 0;
    let completedBytes = 0;
    const makeManifest = (installStage: "bootstrap" | "complete", cachedByteCount: number): ImportManifest => ({
      schemaVersion: cacheSchemaVersion,
      importId,
      importedAt: new Date().toISOString(),
      sourceLabel: files.map((file) => file.name).join(" + "),
      sourceKind,
      identity,
      files: [...cachedFiles],
      totalBytes: cachedByteCount,
      installStage,
      fields: [...fields].sort((a, b) => a.fieldNumber - b.fieldNumber),
      compiledFields: [...compiledFields].sort((a, b) => a.fieldNumber - b.fieldNumber),
      collisionFields: [...collisionFields].sort((a, b) => a.fieldNumber - b.fieldNumber),
      raceCourses: [...raceCourses].sort((a, b) => a.courseId - b.courseId),
      compiledRaceCourses: [...compiledRaceCourses].sort((a, b) => a.courseId - b.courseId),
      raceCourseCollisions: [...raceCourseCollisions].sort((a, b) => a.courseId - b.courseId),
      ...(devFieldSet ? { devPartialFields: [...devFieldSet].sort((a, b) => a - b) } : {}),
    });

    for (const [entryIndex, entry] of orderedEntries.entries()) {
      const label = `Caching ${entry.path}`;
      const isField = /^FLD\/\d{3}\.BIN$/i.test(entry.path);
      const isRaceCourse = /^COURSE\/C\d{2}\.BIN$/i.test(entry.path);
      if (isField || isRaceCourse) {
        const bytes = await source.disc.readFile(entry.path);
        await writeBytes(importDirectory, `game/${entry.path}`, bytes);
        if (isField) {
          const summary = summarizeField(entry, bytes);
          fields.push(summary);
          progress(
            "compile",
            `Compiling FLD/${summary.fieldNumber.toString().padStart(3, "0")} (${compiledFieldCount + 1}/${fieldTotal})`,
            compiledFieldCount,
            fieldTotal,
          );
          const mesh = compileFieldVertexColorMesh(bytes);
          const collision = compileFieldCollision(bytes);
          const compiledPath = `compiled/field-${summary.fieldNumber.toString().padStart(3, "0")}.mesh`;
          await writeBytes(importDirectory, compiledPath, serializeCompiledField(mesh));
          compiledFields.push({
            fieldNumber: summary.fieldNumber,
            path: compiledPath,
            cacheVersion: compiledFieldCacheVersion,
            vertexCount: mesh.vertexCount,
            triangleCount: mesh.triangleCount,
            primitiveCount: mesh.primitiveCount,
          });
          const collisionPath = `compiled/collision-${summary.fieldNumber.toString().padStart(3, "0")}.bin`;
          await writeBytes(importDirectory, collisionPath, serializeCompiledCollision(collision));
          collisionFields.push({ fieldNumber: summary.fieldNumber, path: collisionPath, triangleCount: collision.triangleCount });
          compiledFieldCount += 1;
        } else {
          const summary = summarizeRaceCourse(entry, bytes);
          raceCourses.push(summary);
          progress(
            "compile",
            `Compiling COURSE/C${summary.courseId.toString().padStart(2, "0")} (${compiledRaceCourseCount + 1}/${raceCourseTotal})`,
            compiledRaceCourseCount,
            raceCourseTotal,
          );
          const mesh = compileFieldVertexColorMesh(bytes);
          const collision = compileFieldCollision(bytes);
          const compiledPath = `compiled/course-${summary.courseId.toString().padStart(2, "0")}.mesh`;
          await writeBytes(importDirectory, compiledPath, serializeCompiledField(mesh));
          compiledRaceCourses.push({
            courseId: summary.courseId,
            path: compiledPath,
            cacheVersion: compiledFieldCacheVersion,
            vertexCount: mesh.vertexCount,
            triangleCount: mesh.triangleCount,
            primitiveCount: mesh.primitiveCount,
          });
          const collisionPath = `compiled/course-collision-${summary.courseId.toString().padStart(2, "0")}.bin`;
          await writeBytes(importDirectory, collisionPath, serializeCompiledCollision(collision));
          raceCourseCollisions.push({ courseId: summary.courseId, path: collisionPath, triangleCount: collision.triangleCount });
          compiledRaceCourseCount += 1;
        }
        completedBytes += entry.size;
        progress("cache", label, completedBytes, totalBytes);
      } else {
        await writeFile(importDirectory, `game/${entry.path}`, async (destination) => {
          await source?.disc.copyFile(entry.path, destination, (written) => {
            progress("cache", label, completedBytes + written, totalBytes);
          });
        });
        completedBytes += entry.size;
      }
      cachedFiles.push({ path: entry.path, size: entry.size });
      if (!devFieldSet && !bootstrapPublished && entryIndex + 1 === bootstrapEntries.length) {
        const bootstrapManifest = makeManifest("bootstrap", completedBytes);
        await writeJson(importDirectory, "manifest.json", bootstrapManifest);
        await publishImport(bootstrapManifest);
        bootstrapPublished = true;
        progress("ready", "Peach Town is ready; finishing the world in the background", completedBytes, totalBytes);
        await bootstrapReady?.(bootstrapManifest);
      }
    }

    await source.cleanup();
    source = undefined;
    const manifest = makeManifest("complete", totalBytes);
    await writeJson(importDirectory, "manifest.json", manifest);
    await publishImport(manifest);
    if (previousImport && previousImport.importId !== importId) {
      await removeImportDirectory(previousImport.importId).catch(() => undefined);
    }
    progress("complete", "Installed locally", totalBytes, totalBytes);
    return manifest;
  } catch (error) {
    await source?.cleanup().catch(() => undefined);
    if (!bootstrapPublished) await removeImportDirectory(importId).catch(() => undefined);
    throw error;
  }
}

async function assertCacheHeadroom(requiredBytes: number): Promise<void> {
  const estimate = await navigator.storage.estimate();
  if (estimate.quota === undefined || estimate.usage === undefined) return;
  const available = estimate.quota - estimate.usage;
  if (available < requiredBytes) {
    throw new Error(
      `This import needs ${formatBytes(requiredBytes)} of browser storage, but only ${formatBytes(available)} is currently available.`,
    );
  }
}

function formatBytes(value: number): string {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GiB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  return `${Math.ceil(value / 1024)} KiB`;
}

async function selectRuntimeFiles(
  disc: Awaited<ReturnType<typeof openImportSource>>["disc"],
  executable: string,
  runtimeCarBodyIds?: readonly number[],
  ordinaryRaceCourseIds?: readonly number[],
  devFieldSet?: ReadonlySet<number>,
): Promise<DiscEntry[]> {
  const selected = new Map<string, DiscEntry>();
  const add = async (path: string, required: boolean): Promise<void> => {
    if (await disc.fileExists(path)) {
      const entry = await disc.stat(path);
      selected.set(entry.path, entry);
    } else if (required) {
      throw new Error(`Required game file '${path}' is missing.`);
    }
  };

  await add("SYSTEM.CNF", true);
  await add(executable, true);
  for (const path of explicitlyRequired) await add(path, true);
  for (const path of await listMatching(disc, "FLD", /^\d{3}\.BIN$/i)) {
    if (devFieldSet) {
      const match = /(\d{3})\.BIN$/i.exec(path);
      if (!match || !devFieldSet.has(Number.parseInt(match[1]!, 10))) continue;
    }
    await add(path, false);
  }
  if (runtimeCarBodyIds) {
    for (const bodyId of runtimeCarBodyIds) await add(carAssetPath(bodyId), false);
  } else {
    for (const directory of ["CAR0", "CAR1", "CAR2", "CAR3", "CAR4"] as const) {
      for (const path of await listMatchingOptional(disc, directory, /\.BIN$/i)) await add(path, false);
    }
    await add("CARS/Q150.BIN", false);
  }
  for (const path of await listMatchingOptional(disc, "SHOP", /^T\d{2}\.BIN$/i)) await add(path, false);
  if (ordinaryRaceCourseIds) {
    for (const courseId of ordinaryRaceCourseIds) {
      await add(`COURSE/C${courseId.toString().padStart(2, "0")}.BIN`, true);
    }
  }

  const selectedFieldNumbers = new Set<number>();
  for (const path of selected.keys()) {
    const match = /^FLD\/(\d{3})\.BIN$/i.exec(path);
    if (match) selectedFieldNumbers.add(Number.parseInt(match[1]!, 10));
  }
  if (devFieldSet) {
    // A partial import must still contain every field it was asked for, so a
    // typo like `?onlyfield=999` fails here rather than publishing an empty
    // manifest that only breaks once the viewer tries to build the world.
    const missing = [...devFieldSet].filter((n) => !selectedFieldNumbers.has(n)).sort((a, b) => a - b);
    if (missing.length > 0) {
      throw new Error(`Requested dev FLD sector(s) not found on the disc: ${missing.join(", ")}.`);
    }
  } else if (selectedFieldNumbers.size !== 64) {
    throw new Error(`Expected 64 standard FLD sectors; found ${selectedFieldNumbers.size}.`);
  }
  return [...selected.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function browserBootstrapCarBodyIds(catalogue: OverworldCatalogue, fieldNumber = 223): readonly number[] {
  const ids = new Set<number>([62, ...peachBodyShopStock.map((item) => item.bodyId)]);
  for (const resident of catalogue.residents) if (resident.fieldNumber === fieldNumber) ids.add(resident.bodyId);
  for (const interaction of catalogue.interactions) if (interaction.fieldNumber === fieldNumber) ids.add(interaction.bodyId);
  return [...ids].sort((a, b) => a - b);
}

export function browserRuntimeCarBodyIds(catalogue: OverworldCatalogue, raceParticipantBodyIds: readonly number[] = []): readonly number[] {
  const ids = new Set<number>([62, ...bodyShopBodyIds]);
  for (const resident of catalogue.residents) ids.add(resident.bodyId);
  // Every mapped fixed room can be entered by the generic SHOP runtime, so its
  // executable-selected staff car is a runtime dependency just like a roaming
  // resident. Retaining Q's Factory alone left less-common rooms (for example
  // Peach Paint Shop Q34) unable to open after a fresh imported install.
  for (const interaction of catalogue.interactions) ids.add(interaction.bodyId);
  for (const bodyId of raceParticipantBodyIds) ids.add(bodyId);
  return [...ids].sort((a, b) => a - b);
}

async function listMatchingOptional(
  disc: Awaited<ReturnType<typeof openImportSource>>["disc"],
  directory: string,
  pattern: RegExp,
): Promise<string[]> {
  try {
    return await listMatching(disc, directory, pattern);
  } catch {
    return [];
  }
}

async function listMatching(
  disc: Awaited<ReturnType<typeof openImportSource>>["disc"],
  directory: string,
  pattern: RegExp,
): Promise<string[]> {
  const entries = await disc.listDirectory(directory);
  return entries.filter((entry) => !entry.directory && pattern.test(entry.normalizedName)).map((entry) => entry.path);
}

function summarizeField(entry: DiscEntry, bytes: Uint8Array): FieldSummaryRecord {
  const header = readFieldHeader(bytes);
  const render = readRenderChunkDirectory(bytes, header);
  const collision = readCollisionChunkDirectory(bytes, header);
  const match = /(?:^|\/)(\d{3})\.BIN$/i.exec(entry.path);
  if (!match?.[1]) throw new Error(`Cannot derive field number from '${entry.path}'.`);
  return {
    fieldNumber: Number.parseInt(match[1], 10),
    path: entry.path,
    size: entry.size,
    sectionCount: header.sections.length,
    renderChunkCount: render.totalChunkCount,
    collisionChunkCount: collision.totalChunkCount,
  };
}

function summarizeRaceCourse(entry: DiscEntry, bytes: Uint8Array): RaceCourseSummaryRecord {
  const header = readFieldHeader(bytes);
  const render = readRenderChunkDirectory(bytes, header);
  const collision = readCollisionChunkDirectory(bytes, header);
  const match = /(?:^|\/)C(\d{2})\.BIN$/i.exec(entry.path);
  if (!match?.[1]) throw new Error(`Cannot derive race course ID from '${entry.path}'.`);
  return {
    courseId: Number.parseInt(match[1], 10),
    path: entry.path,
    size: entry.size,
    sectionCount: header.sections.length,
    renderChunkCount: render.totalChunkCount,
    collisionChunkCount: collision.totalChunkCount,
  };
}
