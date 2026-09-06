import { BlobSource, type RandomAccessSource } from "../disc/randomAccess";
import type { GameIdentity } from "../formats/gameIdentity";

export const cacheSchemaVersion = 3;
const appDirectoryName = "rta-browser";

export interface CachedFileRecord {
  readonly path: string;
  readonly size: number;
}

export interface FieldSummaryRecord {
  readonly fieldNumber: number;
  readonly path: string;
  readonly size: number;
  readonly sectionCount: number;
  readonly renderChunkCount: number;
  readonly collisionChunkCount: number;
}

export interface CompiledFieldRecord {
  readonly fieldNumber: number;
  readonly path: string;
  readonly cacheVersion?: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly primitiveCount: number;
}

export interface CompiledCollisionRecord {
  readonly fieldNumber: number;
  readonly path: string;
  readonly triangleCount: number;
}

export interface RaceCourseSummaryRecord {
  readonly courseId: number;
  readonly path: string;
  readonly size: number;
  readonly sectionCount: number;
  readonly renderChunkCount: number;
  readonly collisionChunkCount: number;
}

export interface CompiledRaceCourseRecord {
  readonly courseId: number;
  readonly path: string;
  readonly cacheVersion?: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly primitiveCount: number;
}

export interface CompiledRaceCourseCollisionRecord {
  readonly courseId: number;
  readonly path: string;
  readonly triangleCount: number;
}

export interface ImportManifest {
  readonly schemaVersion: number;
  readonly importId: string;
  readonly importedAt: string;
  readonly sourceLabel: string;
  readonly sourceKind: "iso" | "zip-iso" | "zip-bin-cue" | "bin-cue" | "bin";
  readonly identity: GameIdentity;
  readonly files: CachedFileRecord[];
  readonly totalBytes: number;
  readonly fields: FieldSummaryRecord[];
  readonly compiledFields: CompiledFieldRecord[];
  readonly collisionFields?: CompiledCollisionRecord[];
  readonly raceCourses?: RaceCourseSummaryRecord[];
  readonly compiledRaceCourses?: CompiledRaceCourseRecord[];
  readonly raceCourseCollisions?: CompiledRaceCourseCollisionRecord[];
  /**
   * DEV-ONLY: set when `?devdisc` imported a subset of fields to fit a small
   * browser-storage quota. Such an install lists only those fields and must not
   * be treated as the full world.
   */
  readonly devPartialFields?: readonly number[];
}

export async function getAppRoot(create = true): Promise<FileSystemDirectoryHandle> {
  if (!navigator.storage?.getDirectory) {
    throw new Error("This browser does not expose the Origin Private File System.");
  }
  const opfs = await navigator.storage.getDirectory();
  return opfs.getDirectoryHandle(appDirectoryName, { create });
}

export async function createImportDirectory(importId: string): Promise<FileSystemDirectoryHandle> {
  const root = await getAppRoot();
  const imports = await root.getDirectoryHandle("imports", { create: true });
  return imports.getDirectoryHandle(safeComponent(importId), { create: true });
}

export async function writeFile(
  root: FileSystemDirectoryHandle,
  path: string,
  write: (destination: WritableStream<Uint8Array>) => Promise<void>,
): Promise<void> {
  const { directory, name } = await resolveParent(root, path, true);
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await write(writable as unknown as WritableStream<Uint8Array>);
}

export async function writeBytes(root: FileSystemDirectoryHandle, path: string, bytes: Uint8Array): Promise<void> {
  await writeFile(root, path, async (destination) => {
    const writer = destination.getWriter();
    try {
      await writer.write(bytes);
      await writer.close();
    } catch (error) {
      await writer.abort(error).catch(() => undefined);
      throw error;
    }
  });
}

export async function writeJson(root: FileSystemDirectoryHandle, path: string, value: unknown): Promise<void> {
  await writeBytes(root, path, new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`));
}

export async function readBytes(root: FileSystemDirectoryHandle, path: string): Promise<Uint8Array> {
  const handle = await resolveFile(root, path);
  return new Uint8Array(await (await handle.getFile()).arrayBuffer());
}

export async function readJson<T>(root: FileSystemDirectoryHandle, path: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await readBytes(root, path))) as T;
}

export async function fileSource(root: FileSystemDirectoryHandle, path: string): Promise<RandomAccessSource> {
  const handle = await resolveFile(root, path);
  const file = await handle.getFile();
  return new BlobSource(file, `browser storage: ${path}`);
}

export async function publishImport(manifest: ImportManifest): Promise<void> {
  const root = await getAppRoot();
  await writeJson(root, "current.json", {
    schemaVersion: cacheSchemaVersion,
    importId: manifest.importId,
  });
}

export async function readCurrentManifest(): Promise<ImportManifest | undefined> {
  try {
    const root = await getAppRoot(false);
    const pointer = await readJson<{ schemaVersion: number; importId: string }>(root, "current.json");
    if (pointer.schemaVersion !== cacheSchemaVersion) return undefined;
    const manifest = await readJson<ImportManifest>(root, `imports/${pointer.importId}/manifest.json`);
    return manifest.schemaVersion === cacheSchemaVersion ? manifest : undefined;
  } catch (error) {
    if (isNotFoundError(error)) return undefined;
    throw error;
  }
}

export async function currentImportDirectory(manifest: ImportManifest): Promise<FileSystemDirectoryHandle> {
  const root = await getAppRoot(false);
  const imports = await root.getDirectoryHandle("imports");
  return imports.getDirectoryHandle(safeComponent(manifest.importId));
}

export async function removeImportDirectory(importId: string): Promise<void> {
  const root = await getAppRoot(false);
  const imports = await root.getDirectoryHandle("imports");
  await imports.removeEntry(safeComponent(importId), { recursive: true });
}

export async function clearCurrentPointer(): Promise<void> {
  try {
    const root = await getAppRoot(false);
    await root.removeEntry("current.json");
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
}

async function resolveFile(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle> {
  const { directory, name } = await resolveParent(root, path, false);
  return directory.getFileHandle(name);
}

async function resolveParent(
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
): Promise<{ directory: FileSystemDirectoryHandle; name: string }> {
  const components = safePath(path);
  const name = components.pop();
  if (!name) throw new Error("A file path must contain a filename.");
  let directory = root;
  for (const component of components) {
    directory = await directory.getDirectoryHandle(component, { create });
  }
  return { directory, name };
}

function safePath(path: string): string[] {
  const components = path.replaceAll("\\", "/").split("/").filter(Boolean);
  if (components.length === 0 || components.some((component) => component === "." || component === "..")) {
    throw new Error(`Unsafe storage path '${path}'.`);
  }
  return components.map(safeComponent);
}

function safeComponent(component: string): string {
  if (!component || component === "." || component === ".." || component.includes("/") || component.includes("\\")) {
    throw new Error(`Unsafe path component '${component}'.`);
  }
  return component;
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}
