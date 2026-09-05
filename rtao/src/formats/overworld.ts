import { Elf32AddressSpace } from "./elf32";
import { fieldNumberFromAreaCode } from "../game/worldTopology";

export interface Rgb { readonly r: number; readonly g: number; readonly b: number }
export interface CarPaint { readonly primary: Rgb; readonly secondary: Rgb }
export interface RoutePoint { readonly x: number; readonly z: number }
export interface OutdoorResidentDefinition {
  readonly areaIndex: number;
  readonly fieldNumber: number;
  readonly localIndex: number;
  readonly name: string;
  readonly bodyId: number;
  readonly paint: CarPaint;
  readonly spawn: { readonly x: number; readonly y: number; readonly z: number; readonly rawOrientation: number };
  readonly route: RoutePoint[];
}
export interface FixedInteractionDefinition {
  readonly areaIndex: number;
  readonly fieldNumber: number;
  readonly localIndex: number;
  readonly name: string;
  readonly bodyId: number;
  readonly paint: CarPaint;
  readonly corners: ReadonlyArray<readonly [number, number]>;
}
export interface OverworldCatalogue {
  readonly residents: OutdoorResidentDefinition[];
  readonly interactions: FixedInteractionDefinition[];
}

const areaDescriptorTable = 0x002c04b0;
const interactionPointerTable = 0x002c2710;
const residentPointerTable = 0x002c4340;
const spawnPointerTable = 0x002c4ef0;
const routePointerTable = 0x002dba28;
const authoredAreaCount = 22;

export function readOverworldCatalogue(bytes: Uint8Array): OverworldCatalogue {
  const elf = new Elf32AddressSpace(bytes);
  const residents: OutdoorResidentDefinition[] = [];
  const interactions: FixedInteractionDefinition[] = [];
  for (let areaIndex = 0; areaIndex < authoredAreaCount; areaIndex += 1) {
    const descriptorAddress = areaDescriptorTable + areaIndex * 8;
    const name = elf.asciiZ(elf.u32(descriptorAddress));
    const rawCode = elf.u32(descriptorAddress + 4) & 0xffff;
    const areaCode = rawCode >= 0x8000 ? rawCode - 0x10000 : rawCode;
    const counts = elf.bytes(descriptorAddress + 6, 2);
    const fixedCount = counts[0] ?? 0, outdoorCount = counts[1] ?? 0;
    const fieldNumber = resolveFieldNumber(name, areaCode);
    if (fieldNumber < 0) continue;
    const residentBlock = elf.u32(residentPointerTable + areaIndex * 4);

    // Descriptor zero is a bootstrap/special-world slot: it has resident counts,
    // but HG2's ordinary-world interaction-zone table deliberately has no block
    // for it. The C# runtime likewise begins fixed-zone discovery at area one.
    if (areaIndex > 0 && fixedCount > 0) {
      const zoneBlock = elf.u32(interactionPointerTable + areaIndex * 4);
      if (zoneBlock === 0 || residentBlock === 0) throw new Error(`Area ${areaIndex} has fixed interactions without backing records.`);
      for (let localIndex = 0; localIndex < fixedCount; localIndex += 1) {
        const definition = residentBlock + localIndex * 16;
        const zone = zoneBlock + localIndex * 32;
        const corners: Array<readonly [number, number]> = [];
        for (let corner = 0; corner < 4; corner += 1) corners.push([elf.f32(zone + corner * 8), elf.f32(zone + corner * 8 + 4)]);
        interactions.push({
          areaIndex,
          fieldNumber,
          localIndex,
          name: elf.asciiZ(elf.u32(definition + 12)),
          bodyId: elf.u32(definition + 4),
          paint: decodeCarPaint(elf.u32(definition)),
          corners,
        });
      }
    }

    if (outdoorCount > 0) {
      const spawnBlock = elf.u32(spawnPointerTable + areaIndex * 4);
      const routeBlock = elf.u32(routePointerTable + areaIndex * 4);
      if (residentBlock === 0 || spawnBlock === 0) throw new Error(`Area ${areaIndex} has outdoor residents without definition/spawn records.`);
      const outdoorBlock = residentBlock + fixedCount * 16;
      for (let localIndex = 0; localIndex < outdoorCount; localIndex += 1) {
        const definition = outdoorBlock + localIndex * 16;
        const spawn = spawnBlock + localIndex * 16;
        const route: RoutePoint[] = [];
        if (routeBlock !== 0) {
          const record = routeBlock + localIndex * 8;
          const start = elf.u32(record), end = elf.u32(record + 4);
          if (start !== 0 && end > start) {
            if ((end - start) % 24 !== 0) throw new Error(`Area ${areaIndex} resident ${localIndex} route has an invalid byte length.`);
            for (let address = start; address < end; address += 24) {
              route.push({
                x: (elf.f32(address) + elf.f32(address + 8)) * 0.5,
                z: (elf.f32(address + 4) + elf.f32(address + 12)) * 0.5,
              });
            }
          }
        }
        residents.push({
          areaIndex,
          fieldNumber,
          localIndex,
          name: elf.asciiZ(elf.u32(definition + 12)),
          bodyId: elf.u32(definition + 4),
          paint: decodeCarPaint(elf.u32(definition)),
          spawn: { x: elf.f32(spawn), y: elf.f32(spawn + 4), z: elf.f32(spawn + 8), rawOrientation: elf.u32(spawn + 12) },
          route,
        });
      }
    }
  }
  return { residents, interactions };
}


export function readFixedInteractionAtIndex(bytes: Uint8Array, areaIndex: number, localIndex: number): FixedInteractionDefinition | undefined {
  if (!Number.isInteger(areaIndex) || areaIndex <= 0 || areaIndex >= authoredAreaCount) return undefined;
  if (!Number.isInteger(localIndex) || localIndex < 0) return undefined;
  const elf = new Elf32AddressSpace(bytes);
  const descriptorAddress = areaDescriptorTable + areaIndex * 8;
  const areaName = elf.asciiZ(elf.u32(descriptorAddress));
  const rawCode = elf.u32(descriptorAddress + 4) & 0xffff;
  const areaCode = rawCode >= 0x8000 ? rawCode - 0x10000 : rawCode;
  const fixedCount = elf.bytes(descriptorAddress + 6, 2)[0] ?? 0;
  if (localIndex >= fixedCount) return undefined;
  const residentBlock = elf.u32(residentPointerTable + areaIndex * 4);
  if (residentBlock === 0) return undefined;
  const definition = residentBlock + localIndex * 16;
  const zoneBlock = elf.u32(interactionPointerTable + areaIndex * 4);
  const corners: Array<readonly [number, number]> = [];
  if (zoneBlock !== 0) {
    const zone = zoneBlock + localIndex * 32;
    for (let corner = 0; corner < 4; corner += 1) corners.push([elf.f32(zone + corner * 8), elf.f32(zone + corner * 8 + 4)]);
  }
  return {
    areaIndex,
    fieldNumber: resolveFieldNumber(areaName, areaCode),
    localIndex,
    name: elf.asciiZ(elf.u32(definition + 12)),
    bodyId: elf.u32(definition + 4),
    paint: decodeCarPaint(elf.u32(definition)),
    corners,
  };
}

export function decodeCarPaint(packed: number): CarPaint {
  return { primary: decodeRgb444(packed), secondary: decodeRgb444(packed >>> 12) };
}

function decodeRgb444(packed: number): Rgb {
  const intensity = [25, 38, 51, 63, 76, 89, 102, 114, 127, 140, 153, 165, 178, 191, 204, 216];
  return { r: intensity[packed & 15] ?? 25, g: intensity[(packed >>> 4) & 15] ?? 25, b: intensity[(packed >>> 8) & 15] ?? 25 };
}

function resolveFieldNumber(name: string, areaCode: number): number {
  if (/^[0-3]{3}$/.test(name)) return Number.parseInt(name, 10);
  return areaCode >= 0 && areaCode < 64 ? fieldNumberFromAreaCode(areaCode) : -1;
}
