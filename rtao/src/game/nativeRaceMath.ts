import { Elf32AddressSpace } from '../formats/elf32';
import { produceNativeRaceContacts, type NativeRaceContactData, type NativeRaceContactInput,
  type NativeRaceContactDependencies } from './nativeRaceContact';

export type NativeRaceVector = readonly [number, number, number, number];
/** Four contiguous column vectors in PAL order; no renderer reflection. */
export type NativeRaceMatrix = readonly number[];
export interface NativeRaceMathData {
  /** 0x002F9580: coefficients for powers 9, 7, 5, 3. */
  readonly rotationCoefficients: readonly number[];
  readonly normalYThreshold: number;
  readonly normalYIncrement: number;
}
const f = Math.fround;

export function readNativeRaceMathData(executable: Uint8Array): NativeRaceMathData {
  const elf = new Elf32AddressSpace(executable);
  return {rotationCoefficients:[0,4,8,12].map(n => elf.f32(0x2f9580+n)),
    normalYThreshold:elf.f32(0x3dd7f0-32612),normalYIncrement:elf.f32(0x3dd7f0-32608)};
}

/** 0x275A98. */
export function nativeRaceIdentity(): number[] { return [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]; }

/** 0x275770: MULAx, MADDAy, MADDAz, MADDw, including W. */
export function transformNativeRaceVector(matrix: NativeRaceMatrix, vector: NativeRaceVector): NativeRaceVector {
  if (matrix.length !== 16) throw new RangeError('Native matrix needs 16 lanes.');
  return [0,1,2,3].map(lane => {
    let sum = f(f(matrix[lane]!) * f(vector[0]));
    for (let column=1;column<4;column++) sum = f(sum + f(f(matrix[column*4+lane]!) * f(vector[column]!)));
    return sum;
  }) as unknown as NativeRaceVector;
}

/** 0x21E188: VITOF15 signed fixed-point velocity/delta, three matrix columns,
 * then VFTOI15 truncating saturated conversion. The loaded translation column
 * and input W do not participate, unlike the point transform at 0x275770. */
export function transformNativeRaceIntegerVector(matrix: NativeRaceMatrix, vector: NativeRaceVector): NativeRaceVector {
  if (matrix.length !== 16) throw new RangeError('Native matrix needs 16 lanes.');
  const coordinates = vector.slice(0,3).map(value => f(f(value | 0) / 32768));
  return [0,1,2,3].map(lane => {
    let sum = f(f(matrix[lane]!) * coordinates[0]!);
    for (let column=1;column<3;column++) sum = f(sum + f(f(matrix[column*4+lane]!) * coordinates[column]!));
    return Math.max(-2147483648,Math.min(2147483647,Math.trunc(f(sum * 32768)))) | 0;
  }) as unknown as NativeRaceVector;
}

/** 0x275990 adds all four lanes, even for point/translation W. */
export function addNativeRaceVectors(a: NativeRaceVector,b: NativeRaceVector): NativeRaceVector {
  return a.map((n,i) => f(f(n)+f(b[i]!))) as unknown as NativeRaceVector;
}

/** 0x2757A0; each right-hand column is transformed by the left matrix. */
export function multiplyNativeRaceMatrices(a: NativeRaceMatrix,b: NativeRaceMatrix): number[] {
  return [0,4,8,12].flatMap(i => transformNativeRaceVector(a,b.slice(i,i+4) as unknown as NativeRaceVector));
}

/** 0x2757E8. The two VU cross instructions deliberately reverse operand order. */
export function crossNativeRaceVectors(a: NativeRaceVector,b: NativeRaceVector): NativeRaceVector {
  return [f(f(f(a[1])*f(b[2]))-f(f(b[1])*f(a[2]))),
    f(f(f(a[2])*f(b[0]))-f(f(b[2])*f(a[0]))),
    f(f(f(a[0])*f(b[1]))-f(f(b[0])*f(a[1]))),0];
}

/** 0x275830; float32 squares, ordered sum, SQRT then reciprocal then MULq.
 * The finite zero-vector path uses VDIV's saturated reciprocal, yielding zero. */
export function normalizeNativeRaceVector(vector: NativeRaceVector): NativeRaceVector {
  const [x,y,z] = vector.map(f);
  const length = f(Math.sqrt(Math.abs(f(f(f(x!*x!)+f(y!*y!))+f(z!*z!)))));
  const reciprocal = length === 0 ? 3.4028234663852886e38 : f(1/length);
  return [f(x!*reciprocal),f(y!*reciprocal),f(z!*reciprocal),0];
}

/** 0x275AC0 as called by 0x275C88. This native polynomial is intentionally
 * preserved instead of substituting Math.sin/cos. Domain: signed car yaw. */
export function nativeRaceRotationValues(radians: number,data: NativeRaceMathData): {sin: number; cos: number} {
  const angle = f(radians), halfPi = f(Math.PI/2);
  if (!Number.isFinite(angle) || Math.abs(angle)>f(Math.PI)) throw new RangeError('Unrecovered native rotation domain.');
  const a = angle < 0 ? f(halfPi+angle) : f(halfPi-angle), square = f(a*a);
  const terms = data.rotationCoefficients.map(c => f(f(f(c)*a)*square));
  for (let i=0;i<3;i++) terms[i] = f(terms[i]!*square);
  let cos = f(a+terms[3]!);
  for (let i=0;i<2;i++) terms[i] = f(terms[i]!*square);
  cos = f(cos+terms[2]!);
  terms[0] = f(terms[0]!*square);
  cos = f(f(cos+terms[1]!)+terms[0]!);
  const magnitude = f(Math.sqrt(Math.abs(f(1-f(cos*cos)))));
  return {sin:angle < 0 ? f(0-magnitude) : f(0+magnitude),cos};
}

/** 0x275C88 applied to identity. */
export function nativeRaceYawMatrix(radians: number,data: NativeRaceMathData): number[] {
  const {sin,cos} = nativeRaceRotationValues(radians,data);
  const rotation = [cos,0,f(0-sin),0,0,1,0,0,sin,0,cos,0,0,0,0,1];
  // The native routine actually multiplies each identity column. Keep its
  // arithmetic even at zero yaw, where signed zeros and polynomial error matter.
  return multiplyNativeRaceMatrices(rotation,nativeRaceIdentity());
}

/** 0x2086C0 normal basis. Input normal is copied, not renormalized here. */
export function nativeRaceNormalBasis(normal: NativeRaceVector): number[] {
  const x = normalizeNativeRaceVector([f(normal[1]),f(-normal[0]),0,0]);
  return [...x,...normal.map(f),...crossNativeRaceVectors(x,normal),0,0,0,1];
}

/** 0x2758B8 is a rigid-transform inverse, not a general matrix inversion. */
export function inverseNativeRaceMatrix(matrix: NativeRaceMatrix): number[] {
  const result = [matrix[0]!,matrix[4]!,matrix[8]!,0,matrix[1]!,matrix[5]!,matrix[9]!,0,
    matrix[2]!,matrix[6]!,matrix[10]!,0,0,0,0,matrix[15]!].map(f);
  for (let i=0;i<3;i++) result[12+i] = f(0-f(f(f(result[i]!*f(matrix[12]!))+f(result[4+i]!*f(matrix[13]!)))+f(result[8+i]!*f(matrix[14]!))));
  return result;
}

/** 0x21A368 normal adjustment, including bit-64 precedence over bit 128. */
export function adjustNativeRaceNormal(normal: NativeRaceVector,mode: number,radians: number,data: NativeRaceMathData): NativeRaceVector {
  let result: NativeRaceVector = normal.map(f) as unknown as NativeRaceVector;
  if (result[1] < data.normalYThreshold) result = [result[0],f(result[1]+data.normalYIncrement),result[2],result[3]];
  // The negative-yaw rotation is constructed on every native path.
  const inverseYaw = nativeRaceYawMatrix(f(-radians),data);
  if (mode & 0xc0) {
    result = transformNativeRaceVector(inverseYaw,result);
    const offset = mode & 0x40 ? 0.125 : -0.125;
    result = [f(f(f(result[0]+offset)/1.0625)-offset),result[1],f(result[2]/1.0625),result[3]];
    result = transformNativeRaceVector(nativeRaceYawMatrix(radians,data),result);
  } else result = [f(result[0]/1.0625),result[1],f(result[2]/1.0625),result[3]];
  return normalizeNativeRaceVector(result);
}

/** 0x21C860..0x21C8DC. */
export function orientNativeRaceContact(orientation: {edgeA: readonly number[];edgeB: readonly number[];yawRadians: number;adjustmentMode: number},data: NativeRaceMathData) {
  let normal = crossNativeRaceVectors([...orientation.edgeA,0] as unknown as NativeRaceVector,[...orientation.edgeB,0] as unknown as NativeRaceVector);
  if (normal[1]<0) normal = [normal[0],f(-normal[1]),normal[2],normal[3]];
  normal = normalizeNativeRaceVector(normal);
  if (orientation.adjustmentMode) normal = adjustNativeRaceNormal(normal,orientation.adjustmentMode,orientation.yawRadians,data);
  const matrix = multiplyNativeRaceMatrices(nativeRaceNormalBasis(normal),nativeRaceYawMatrix(orientation.yawRadians,data));
  return {normal,matrix,inverse:inverseNativeRaceMatrix(matrix)};
}

/** Complete contact/orientation composition; course query remains caller-selected. */
export function advanceNativeRaceContact(input: NativeRaceContactInput,contactData: NativeRaceContactData,
  mathData: NativeRaceMathData,previousMatrix: NativeRaceMatrix,query: NativeRaceContactDependencies['query']) {
  const contact = produceNativeRaceContacts(input,contactData,{query,
    transformProbe:probeTransform(previousMatrix)});
  return {...contact,...orientNativeRaceContact(contact.orientation,mathData)};
}

function probeTransform(matrix: NativeRaceMatrix): NativeRaceContactDependencies['transformProbe'] {
  return (probe,translation) => addNativeRaceVectors(transformNativeRaceVector(matrix,probe),translation);
}
