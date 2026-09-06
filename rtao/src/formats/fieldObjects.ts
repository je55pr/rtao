import { readFieldHeader } from "./field";
import { readHg2Header, readCarMeshPart, decodeIndexedTexture, type CarPrimitive } from "./carGeometry";
import { readTextureUploads } from "./gsTextures";
import type { DecodedTexture } from "./gsTextures";
import type { FieldRenderPrimitive } from "./fieldGeometry";

/**
 * HG2's dynamic field props (coastal palm crowns, the Mushroom Road wind-turbine
 * rotors) are not part of the ordinary MSCALF-8 field mesh. Each field that has
 * them carries a standard `Hg2ObjectFile` container in header section Extra[1]:
 * one or more MSCALF-4 textured meshes followed, for some objects, by a trailing
 * PSMT8 texture-DMA section.
 *
 * The VU program (`MSCALF 4`) is the shared "dynamic object / high-detail car"
 * kernel documented in `docs/FORMAT_NOTES.md`: it transforms `position` by a
 * per-object matrix and shades the retained `normal`/RGB. That matrix — and any
 * animation composed into it (crown sway, rotor spin) — lives in EE object-update
 * code that is not yet decoded. See `docs/archaeology/FIELD_DYNAMIC_OBJECTS_*`.
 */
export interface FieldObjectMesh {
  /** Render-space triangle-soup positions (X reflected like ordinary field geometry). */
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
}

export interface FieldObjectAsset {
  readonly meshes: FieldObjectMesh[];
  readonly texture: DecodedTexture | null;
  /** Local-space radius of the largest mesh, for culling and spin extent. */
  readonly radius: number;
}

const dynamicObjectVuPrograms = new Set([4, 10]);

/**
 * Reads the Extra[1] object container from a raw FLD file, when present. Returns
 * `null` for fields without a recognisable dynamic-object container.
 */
export function readFieldObjectAsset(bytes: Uint8Array): FieldObjectAsset | null {
  let header;
  try {
    header = readFieldHeader(bytes);
  } catch {
    return null;
  }
  if (header.extras.length < 2) return null;
  const extra = header.extras[1]!;
  const slice = bytes.subarray(extra.offset, extra.offset + extra.length);

  let container;
  try {
    container = readHg2Header(slice);
  } catch {
    return null;
  }
  // The trailing "texture immediately before EOF" section is optional; treat any
  // section that decodes as a textured MSCALF-4 mesh as geometry.
  const meshes: FieldObjectMesh[] = [];
  let texture: DecodedTexture | null = null;
  let radiusSquared = 0;

  for (let sectionIndex = 0; sectionIndex < container.offsets.length - 1; sectionIndex += 1) {
    const sectionOffset = container.offsets[sectionIndex]!;
    let primitives: CarPrimitive[];
    try {
      primitives = readCarMeshPart(slice, sectionOffset + 0x10);
    } catch {
      primitives = [];
    }
    const usable = primitives.length > 0
      && primitives.every((primitive) => dynamicObjectVuPrograms.has(primitive.vuProgram));
    if (usable) {
      const mesh = buildTriangleSoup(primitives);
      radiusSquared = Math.max(radiusSquared, mesh.radiusSquared);
      meshes.push(mesh.mesh);
    } else if (!texture) {
      try {
        const uploads = readTextureUploads(slice, sectionOffset, container.offsets[sectionIndex + 1]! - sectionOffset);
        texture = decodeIndexedTexture(uploads, 8);
      } catch {
        // Not a PSMT8 texture DMA section; ignore.
      }
    }
  }

  if (meshes.length === 0) return null;
  return { meshes, texture, radius: Math.sqrt(radiusSquared) };
}

function buildTriangleSoup(primitives: CarPrimitive[]): { mesh: FieldObjectMesh; radiusSquared: number } {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  let radiusSquared = 0;

  for (const primitive of primitives) {
    // MSCALF-4 dynamic objects are authored as triangle strips.
    for (let index = 0; index < primitive.vertices.length - 2; index += 1) {
      const a = (index & 1) === 0 ? index : index + 1;
      const b = (index & 1) === 0 ? index + 1 : index;
      const c = index + 2;
      for (const vertexIndex of [a, b, c]) {
        const vertex = primitive.vertices[vertexIndex]!;
        // Dynamic-object coordinates are local vectors: reflect X to match the
        // handedness ordinary field geometry is reflected into.
        const x = -vertex.position[0];
        const y = vertex.position[1];
        const z = vertex.position[2];
        positions.push(x, y, z);
        normals.push(-vertex.normal[0], vertex.normal[1], vertex.normal[2]);
        uvs.push(vertex.texture[0], vertex.texture[1]);
        radiusSquared = Math.max(radiusSquared, x * x + y * y + z * z);
      }
    }
  }

  return {
    mesh: {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
    },
    radiusSquared,
  };
}

interface AnchorPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Structural detection of the Mushroom Road (FLD/213) wind-turbine towers. Each
 * tower is a tall, narrow, near-vertical shaft primitive rising well above the
 * terrain; they share one material family. Identify the dominant such family and
 * return each shaft's top centre (render space) as a rotor mount, rather than
 * baking in a field number or a GS texture address. Fields without such a family
 * (palm-crown fields, ordinary fields) return no anchors.
 */
export function findTurbineAnchors(primitives: readonly FieldRenderPrimitive[]): AnchorPoint[] {
  const families = new Map<string, { primitive: FieldRenderPrimitive; top: AnchorPoint }[]>();
  for (const primitive of primitives) {
    if (primitive.vertices.length < 6 || primitive.placementOffset !== undefined) continue;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let sumX = 0, sumZ = 0;
    for (const vertex of primitive.vertices) {
      minX = Math.min(minX, vertex.position.x); maxX = Math.max(maxX, vertex.position.x);
      minY = Math.min(minY, vertex.position.y); maxY = Math.max(maxY, vertex.position.y);
      minZ = Math.min(minZ, vertex.position.z); maxZ = Math.max(maxZ, vertex.position.z);
      sumX += vertex.position.x; sumZ += vertex.position.z;
    }
    const height = maxY - minY;
    const footprint = Math.max(maxX - minX, maxZ - minZ);
    // Tall (>40), narrow (footprint under a quarter of the height), reaching high.
    if (height < 40 || footprint > 12 || footprint > height * 0.3 || maxY < 100) continue;
    const key = materialKey(primitive);
    let family = families.get(key);
    if (!family) {
      family = [];
      families.set(key, family);
    }
    family.push({
      primitive,
      // Reflect X into render space to match ordinary field geometry.
      top: { x: 1600 - sumX / primitive.vertices.length, y: maxY, z: sumZ / primitive.vertices.length },
    });
  }

  const dominant = [...families.values()].sort((a, b) => b.length - a.length)[0];
  if (!dominant || dominant.length < 4) return [];
  return dominant.map((entry) => entry.top);
}

function materialKey(primitive: FieldRenderPrimitive): string {
  const tex0 = primitive.material.tex0;
  return `${tex0.textureBasePointer}:${tex0.width}x${tex0.height}:${tex0.pixelStorageFormat}`;
}
