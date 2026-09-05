export const worldGridWidth = 8;
export const worldGridHeight = 8;
export const fieldExtent = 1600;
export const rowStagger = fieldExtent * 0.5;
export const worldCircumference = worldGridWidth * fieldExtent;
export const worldDepth = worldGridHeight * fieldExtent;

// Browser-port design choice: the persistent outdoor world is deliberately a
// two-axis torus. East/west wrapping is supported by original-game evidence;
// north/south wrapping is a quality-of-life extension requested for this port.
// Keep that distinction explicit so reference-runtime parity work does not
// accidentally remove the intentional browser behaviour.

export interface SectorAddress {
  readonly column: number;
  readonly row: number;
}

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface SectorPosition {
  readonly fieldNumber: number;
  readonly localPosition: Vec2;
}

export function fieldNumberFromAddress(column: number, row: number): number {
  assertGridCoordinate(column, row);
  const a = row >> 1;
  const b = column >> 1;
  const c = ((row & 1) << 1) | (column & 1);
  return a * 100 + b * 10 + c;
}

export function fieldNumberFromAreaCode(areaCode: number): number {
  if (!Number.isInteger(areaCode) || areaCode < 0 || areaCode >= 64) throw new Error(`Invalid standard-world area code ${areaCode}.`);
  return ((areaCode >> 4) & 3) * 100 + ((areaCode >> 2) & 3) * 10 + (areaCode & 3);
}

export function addressFromFieldNumber(fieldNumber: number): SectorAddress {
  const a = Math.floor(fieldNumber / 100);
  const b = Math.floor(fieldNumber / 10) % 10;
  const c = fieldNumber % 10;
  if (a < 0 || a > 3 || b < 0 || b > 3 || c < 0 || c > 3 || !Number.isInteger(fieldNumber)) {
    throw new Error(`FLD/${String(fieldNumber).padStart(3, "0")} is not a standard three-digit base-4 world sector.`);
  }
  return { column: 2 * b + (c & 1), row: 2 * a + (c >> 1) };
}

export function allWorldFieldNumbers(): number[] {
  const output: number[] = [];
  for (let row = 0; row < worldGridHeight; row += 1) {
    for (let column = 0; column < worldGridWidth; column += 1) {
      output.push(fieldNumberFromAddress(column, row));
    }
  }
  return output;
}

export function sourceBase(fieldNumber: number): Vec2 {
  const address = addressFromFieldNumber(fieldNumber);
  return {
    x: address.column * fieldExtent + ((address.row & 1) !== 0 ? rowStagger : 0),
    y: address.row * fieldExtent,
  };
}

/** Translation for reflected Three.js field coordinates, relative to an observer FLD. */
export function relativeRenderTranslation(originFieldNumber: number, targetFieldNumber: number): Vec2 {
  const origin = sourceBase(originFieldNumber);
  const target = sourceBase(targetFieldNumber);
  return {
    x: -wrapShortest(target.x - origin.x, worldCircumference),
    y: wrapShortest(target.y - origin.y, worldDepth),
  };
}

/** Normalises reflected Three.js X/Z coordinates through both axes of HG2's toroidal world. */
export function normalizeRenderPosition(currentFieldNumber: number, renderPosition: Vec2): SectorPosition {
  const current = addressFromFieldNumber(currentFieldNumber);
  const currentBase = sourceBase(currentFieldNumber);
  const canonicalSourceX = currentBase.x + (fieldExtent - renderPosition.x);
  const rowDelta = Math.floor(renderPosition.y / fieldExtent);
  const targetRow = positiveModulo(current.row + rowDelta, worldGridHeight);
  const targetLocalZ = positiveModulo(renderPosition.y, fieldExtent);

  for (let column = 0; column < worldGridWidth; column += 1) {
    const candidateField = fieldNumberFromAddress(column, targetRow);
    const candidateBase = sourceBase(candidateField);
    const localSourceX = positiveModulo(canonicalSourceX - candidateBase.x, worldCircumference);
    if (localSourceX < fieldExtent) {
      return {
        fieldNumber: candidateField,
        localPosition: { x: fieldExtent - localSourceX, y: targetLocalZ },
      };
    }
  }
  throw new Error("Could not normalize a position into the standard outdoor world.");
}

export function isNearField(originFieldNumber: number, targetFieldNumber: number, radius = 500): boolean {
  const offset = relativeRenderTranslation(originFieldNumber, targetFieldNumber);
  const nearestX = Math.max(0, Math.abs(offset.x) - fieldExtent);
  const nearestZ = Math.max(0, Math.abs(offset.y) - fieldExtent);
  return nearestX * nearestX + nearestZ * nearestZ <= radius * radius;
}

function wrapShortest(value: number, circumference: number): number {
  if (value > circumference * 0.5) return value - circumference;
  if (value < -circumference * 0.5) return value + circumference;
  return value;
}

function positiveModulo(value: number, modulus: number): number {
  const result = value % modulus;
  return result < 0 ? result + modulus : result;
}

function assertGridCoordinate(column: number, row: number): void {
  if (!Number.isInteger(column) || column < 0 || column >= worldGridWidth) throw new Error(`Invalid world column ${column}.`);
  if (!Number.isInteger(row) || row < 0 || row >= worldGridHeight) throw new Error(`Invalid world row ${row}.`);
}
