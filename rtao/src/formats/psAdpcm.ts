export const psAdpcmFrameSize = 16;
export const psAdpcmSamplesPerFrame = 28;

const predictorCoefficients = [
  [0, 0],
  [60, 0],
  [115, -52],
  [98, -55],
  [122, -60],
] as const;

export interface PsAdpcmFrame {
  readonly predictor: number;
  readonly shift: number;
  /** Raw SPU frame control byte. RTA preserves all eight bits without validation. */
  readonly control: number;
  readonly encodedNibbles: Uint8Array;
}

export interface PsAdpcmState {
  readonly previous1: number;
  readonly previous2: number;
}

export interface PsAdpcmDecodeResult {
  readonly samples: Int16Array;
  readonly state: PsAdpcmState;
}
export function readPsAdpcmFrame(bytes: Uint8Array, offset = 0): PsAdpcmFrame {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + psAdpcmFrameSize > bytes.length) {
    throw new RangeError(`PS-ADPCM frame [${offset}, ${offset + psAdpcmFrameSize}) exceeds ${bytes.length} bytes.`);
  }
  const parameter = bytes[offset]!;
  return {
    predictor: parameter >>> 4,
    shift: parameter & 0x0f,
    control: bytes[offset + 1]!,
    encodedNibbles: bytes.subarray(offset + 2, offset + psAdpcmFrameSize),
  };
}

export function decodePsAdpcmFrame(
  frame: PsAdpcmFrame,
  initialState: PsAdpcmState = { previous1: 0, previous2: 0 },
): PsAdpcmDecodeResult {
  const coefficients = predictorCoefficients[frame.predictor];
  if (!coefficients) throw new Error(`Unsupported PS-ADPCM predictor ${frame.predictor}.`);
  if (frame.shift > 12) throw new Error(`Unsupported PS-ADPCM shift ${frame.shift}.`);
  if (frame.encodedNibbles.length !== 14) throw new Error("PS-ADPCM frame must contain 14 encoded bytes.");

  const samples = new Int16Array(psAdpcmSamplesPerFrame);
  let previous1 = initialState.previous1;
  let previous2 = initialState.previous2;
  let sampleIndex = 0;
  for (const packed of frame.encodedNibbles) {
    for (const nibble of [packed & 0x0f, packed >>> 4]) {
      let sample = nibble << 12;
      if ((sample & 0x8000) !== 0) sample -= 0x10000;
      sample >>= frame.shift;
      sample += ((previous1 * coefficients[0] + previous2 * coefficients[1] + 32) >> 6);
      sample = Math.max(-0x8000, Math.min(0x7fff, sample));
      samples[sampleIndex++] = sample;
      previous2 = previous1;
      previous1 = sample;
    }
  }
  return { samples, state: { previous1, previous2 } };
}

export function decodePsAdpcm(bytes: Uint8Array): Int16Array {
  if (bytes.length % psAdpcmFrameSize !== 0) {
    throw new Error(`PS-ADPCM payload length ${bytes.length} is not a multiple of ${psAdpcmFrameSize}.`);
  }
  const output = new Int16Array((bytes.length / psAdpcmFrameSize) * psAdpcmSamplesPerFrame);
  let state: PsAdpcmState = { previous1: 0, previous2: 0 };
  for (let offset = 0, target = 0; offset < bytes.length; offset += psAdpcmFrameSize, target += psAdpcmSamplesPerFrame) {
    const decoded = decodePsAdpcmFrame(readPsAdpcmFrame(bytes, offset), state);
    output.set(decoded.samples, target);
    state = decoded.state;
  }
  return output;
}
