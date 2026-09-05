import { BinaryView } from "../core/binary";
import type { RandomAccessSource } from "./randomAccess";

const sectorSize = 2048;

export interface DiscEntry {
  readonly name: string;
  readonly normalizedName: string;
  readonly path: string;
  readonly extent: number;
  readonly size: number;
  readonly directory: boolean;
}

interface RawDiscEntry extends Omit<DiscEntry, "path"> {}

export class Iso9660Disc {
  private readonly directoryCache = new Map<string, DiscEntry[]>();

  private constructor(
    private readonly source: RandomAccessSource,
    private readonly root: RawDiscEntry,
  ) {}

  static async open(source: RandomAccessSource): Promise<Iso9660Disc> {
    if (source.size % sectorSize !== 0) {
      throw new Error("Cooked ISO size is not a multiple of 2048 bytes.");
    }
    if (source.size < 17 * sectorSize) {
      throw new Error("Disc image is too small to contain an ISO9660 volume descriptor.");
    }

    const maximumSector = Math.min(Math.floor(source.size / sectorSize), 256);
    for (let index = 16; index < maximumSector; index += 1) {
      const bytes = await source.read(index * sectorSize, sectorSize);
      const view = new BinaryView(bytes);
      if (view.ascii(1, 5) !== "CD001" || view.u8(6) !== 1) continue;
      const type = view.u8(0);
      if (type === 1) {
        return new Iso9660Disc(source, parseDirectoryRecord(view.span(156, sectorSize - 156), "<root>"));
      }
      if (type === 255) break;
    }
    throw new Error("No ISO9660 Primary Volume Descriptor was found.");
  }

  get description(): string {
    return this.source.label;
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const entry = await this.resolve(path);
      return !entry.directory;
    } catch {
      return false;
    }
  }

  async stat(path: string): Promise<DiscEntry> {
    return this.resolve(path);
  }

  async readFile(path: string): Promise<Uint8Array> {
    const entry = await this.resolve(path);
    if (entry.directory) throw new Error(`'${path}' is a directory.`);
    return this.source.read(entry.extent * sectorSize, entry.size);
  }

  async copyFile(path: string, destination: WritableStream<Uint8Array>, onProgress?: (written: number, total: number) => void): Promise<void> {
    const entry = await this.resolve(path);
    if (entry.directory) throw new Error(`'${path}' is a directory.`);
    const writer = destination.getWriter();
    const chunkSize = sectorSize * 256;
    let written = 0;
    try {
      while (written < entry.size) {
        const length = Math.min(chunkSize, entry.size - written);
        const bytes = await this.source.read(entry.extent * sectorSize + written, length);
        await writer.write(bytes);
        written += bytes.byteLength;
        onProgress?.(written, entry.size);
      }
      await writer.close();
    } catch (error) {
      await writer.abort(error).catch(() => undefined);
      throw error;
    }
  }

  async listDirectory(path = ""): Promise<DiscEntry[]> {
    const normalizedPath = normalizeDiscPath(path);
    const cached = this.directoryCache.get(normalizedPath);
    if (cached) return cached;

    const directory = normalizedPath.length === 0 ? this.root : await this.resolve(normalizedPath);
    if (!directory.directory) throw new Error(`'${path}' is not a directory.`);

    const bytes = await this.source.read(directory.extent * sectorSize, directory.size);
    const entries: DiscEntry[] = [];
    let offset = 0;
    while (offset < bytes.byteLength) {
      const sectorOffset = offset % sectorSize;
      const length = bytes[offset] ?? 0;
      if (length === 0) {
        offset += sectorSize - sectorOffset;
        continue;
      }
      if (sectorOffset + length > sectorSize || offset + length > bytes.byteLength) {
        throw new Error("ISO9660 directory record crosses a logical-sector boundary.");
      }
      const raw = parseDirectoryRecord(bytes.subarray(offset, offset + length), "<directory entry>");
      offset += length;
      if (raw.name === "\0" || raw.name === "\u0001") continue;
      const childPath = normalizedPath.length > 0 ? `${normalizedPath}/${raw.normalizedName}` : raw.normalizedName;
      entries.push({ ...raw, path: childPath });
    }

    this.directoryCache.set(normalizedPath, entries);
    return entries;
  }

  private async resolve(path: string): Promise<DiscEntry> {
    const normalized = normalizeDiscPath(path);
    if (normalized.length === 0) return { ...this.root, path: "" };

    let current: DiscEntry = { ...this.root, path: "" };
    let currentPath = "";
    for (const component of normalized.split("/")) {
      if (!current.directory) throw new Error(`'${component}' is below a non-directory record.`);
      const entries = await this.listDirectory(currentPath);
      const next = entries.find((entry) => entry.normalizedName === component);
      if (!next) throw new Error(`Disc file '${normalized}' was not found.`);
      current = next;
      currentPath = next.path;
    }
    return current;
  }
}

export function normalizeDiscPath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .split("/")
    .filter((component) => component.length > 0 && component !== ".")
    .map((component) => {
      if (component === "..") throw new Error("Disc path escaped its root.");
      return component.toUpperCase();
    })
    .join("/");
}

function parseDirectoryRecord(bytes: Uint8Array, context: string): RawDiscEntry {
  const data = new BinaryView(bytes);
  if (data.length < 34 || data.u8(0) < 34 || data.u8(0) > data.length) {
    throw new Error(`Invalid ISO9660 directory record at ${context}.`);
  }

  const extent = data.u32(2);
  const extentBe = data.u32be(6);
  const size = data.u32(10);
  const sizeBe = data.u32be(14);
  if (extent !== extentBe || size !== sizeBe) {
    throw new Error("ISO9660 both-endian fields do not agree.");
  }

  const nameLength = data.u8(32);
  if (33 + nameLength > data.u8(0)) {
    throw new Error("ISO9660 filename extends beyond its directory record.");
  }
  const name = nameLength === 1 && data.u8(33) <= 1
    ? String.fromCharCode(data.u8(33))
    : data.ascii(33, nameLength);
  const semicolon = name.indexOf(";");
  const normalizedName = (semicolon >= 0 ? name.slice(0, semicolon) : name).toUpperCase();
  return {
    name,
    normalizedName,
    extent,
    size,
    directory: (data.u8(25) & 0x02) !== 0,
  };
}
