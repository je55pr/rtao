import {
  lookupTsqRequest,
  readTsqBytecodeToken,
  readTsqMusicDescriptors,
  type TsqBytecodeToken,
  type TsqFile,
  type TsqMusicDescriptor,
} from "../formats/tsq";

export interface NativeTsqChannelProgram {
  readonly channelIndex: number;
  readonly startOffset: number;
  readonly descriptor?: TsqMusicDescriptor;
}

export interface NativeTsqSequencerEvent {
  readonly tick: number;
  readonly channelIndex: number;
  readonly token: TsqBytecodeToken;
}

export interface NativeTsqChannelSnapshot {
  readonly channelIndex: number;
  readonly programCounter: number;
  readonly nextTick: number;
  readonly ended: boolean;
  readonly jumpCount: number;
}
export interface NativeTsqSequencerSnapshot {
  readonly tick: number;
  readonly channels: readonly NativeTsqChannelSnapshot[];
}

export interface NativeTsqVoiceHost {
  dispatch(event: NativeTsqSequencerEvent): void;
}

export interface NativeTsqSequencerOptions {
  readonly maxInstructionsPerTick?: number;
  readonly host?: NativeTsqVoiceHost;
}

interface MutableChannel {
  readonly channelIndex: number;
  readonly startOffset: number;
  programCounter: number;
  nextTick: number;
  ended: boolean;
  jumpCount: number;
}

interface ScheduledEvent {
  readonly event: NativeTsqSequencerEvent;
  readonly order: number;
}
const defaultMaxInstructionsPerTick = 4096;

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer; got ${value}.`);
  }
}

export function resolveTsqJumpTarget(token: TsqBytecodeToken): number {
  if (token.family !== "jump" || token.signedImmediate === undefined) {
    throw new Error("TSQ jump target requires an F8 jump token.");
  }
  return token.offset + token.length + token.signedImmediate;
}

export function nativeTsqStepUpdates(token: TsqBytecodeToken): number {
  if (token.family !== "step" || token.embeddedValue === undefined) {
    throw new Error("TSQ step duration requires a step token.");
  }
  return token.embeddedValue === 0 ? 0x10000 : token.embeddedValue;
}

/**
 * Resolves the proven 36 music descriptors without guessing which state-byte
 * values are active. Each returned program retains its raw descriptor.
 */
export function resolveTsqMusicChannelPrograms(
  tsq: TsqFile,
  requestIndex: number,
): readonly NativeTsqChannelProgram[] {
  const entry = lookupTsqRequest(tsq, requestIndex);
  return readTsqMusicDescriptors(tsq, requestIndex).map((descriptor) => {
    const startOffset = entry.sequenceOffset + descriptor.relativeBytecodeOffset;
    if (startOffset < 0 || startOffset >= tsq.bytes.length) {
      throw new Error(
        `TSQ music channel ${descriptor.channelIndex} start 0x${startOffset.toString(16)} exceeds ${tsq.bytes.length} bytes.`,
      );
    }
    return {
      channelIndex: descriptor.channelIndex,
      startOffset,
      descriptor,
    };
  });
}

/**
 * Deterministic TSQ control-flow scheduler.
 *
 * Step bytes are native SNDMOD update-count values. Byte zero wraps the
 * 16-bit countdown and therefore waits 65,536 updates. PAL E3 is a no-op;
 * conversion from native updates to browser wall-clock time belongs to caller.
 */
export class NativeTsqSequencer {
  private readonly maxInstructionsPerTick: number;
  private readonly host?: NativeTsqVoiceHost;
  private readonly programs: readonly NativeTsqChannelProgram[];
  private channels: MutableChannel[];
  private currentTick = 0;
  private eventOrder = 0;
  constructor(
    private readonly bytes: Uint8Array,
    programs: readonly NativeTsqChannelProgram[],
    options: NativeTsqSequencerOptions = {},
  ) {
    const maxInstructionsPerTick = options.maxInstructionsPerTick ?? defaultMaxInstructionsPerTick;
    if (!Number.isSafeInteger(maxInstructionsPerTick) || maxInstructionsPerTick <= 0) {
      throw new RangeError(
        `TSQ maxInstructionsPerTick must be a positive integer; got ${maxInstructionsPerTick}.`,
      );
    }
    const channelIndices = new Set<number>();
    for (const program of programs) {
      assertNonNegativeInteger(program.channelIndex, "TSQ channel index");
      assertNonNegativeInteger(program.startOffset, "TSQ channel start offset");
      if (program.startOffset >= bytes.length) {
        throw new RangeError(
          `TSQ channel ${program.channelIndex} starts at 0x${program.startOffset.toString(16)}, outside ${bytes.length} bytes.`,
        );
      }
      if (channelIndices.has(program.channelIndex)) {
        throw new Error(`TSQ channel ${program.channelIndex} is configured more than once.`);
      }
      channelIndices.add(program.channelIndex);
    }
    this.maxInstructionsPerTick = maxInstructionsPerTick;
    this.host = options.host;
    this.programs = programs.map((program) => ({ ...program }));
    this.channels = this.makeChannels();
  }
  reset(): void {
    this.channels = this.makeChannels();
    this.currentTick = 0;
    this.eventOrder = 0;
  }

  advanceBy(ticks: number): readonly NativeTsqSequencerEvent[] {
    assertNonNegativeInteger(ticks, "TSQ tick delta");
    return this.advanceTo(this.currentTick + ticks);
  }

  advanceTo(tick: number): readonly NativeTsqSequencerEvent[] {
    assertNonNegativeInteger(tick, "TSQ target tick");
    if (tick < this.currentTick) {
      throw new RangeError(
        `TSQ sequencer cannot move backward from tick ${this.currentTick} to ${tick}.`,
      );
    }

    const scheduled: ScheduledEvent[] = [];
    for (const channel of this.channels) {
      this.runChannelThrough(channel, tick, scheduled);
    }
    this.currentTick = tick;
    scheduled.sort((left, right) =>
      left.event.tick - right.event.tick || left.order - right.order);

    const events = scheduled.map(({ event }) => event);
    if (this.host) for (const event of events) this.host.dispatch(event);
    return events;
  }
  snapshot(): NativeTsqSequencerSnapshot {
    return {
      tick: this.currentTick,
      channels: this.channels.map((channel) => ({
        channelIndex: channel.channelIndex,
        programCounter: channel.programCounter,
        nextTick: channel.nextTick,
        ended: channel.ended,
        jumpCount: channel.jumpCount,
      })),
    };
  }

  private makeChannels(): MutableChannel[] {
    return this.programs.map((program) => ({
      channelIndex: program.channelIndex,
      startOffset: program.startOffset,
      programCounter: program.startOffset,
      nextTick: 0,
      ended: false,
      jumpCount: 0,
    }));
  }

  private runChannelThrough(
    channel: MutableChannel,
    targetTick: number,
    scheduled: ScheduledEvent[],
  ): void {
    let instructionTick = channel.nextTick;
    let instructionsAtTick = 0;

    while (!channel.ended && channel.nextTick <= targetTick) {
      if (channel.nextTick !== instructionTick) {
        instructionTick = channel.nextTick;
        instructionsAtTick = 0;
      }
      instructionsAtTick += 1;
      if (instructionsAtTick > this.maxInstructionsPerTick) {
        throw new Error(
          `TSQ channel ${channel.channelIndex} exceeded ${this.maxInstructionsPerTick} instructions at tick ${channel.nextTick}.`,
        );
      }

      const token = readTsqBytecodeToken(this.bytes, channel.programCounter);
      if (token.family === "step") {
        channel.programCounter += token.length;
        channel.nextTick += nativeTsqStepUpdates(token);
        continue;
      }
      if (token.family === "jump") {
        const target = resolveTsqJumpTarget(token);
        if (target < 0 || target >= this.bytes.length) {
          throw new Error(
            `TSQ channel ${channel.channelIndex} F8 jump from 0x${token.offset.toString(16)} targets 0x${target.toString(16)} outside ${this.bytes.length} bytes.`,
          );
        }
        channel.programCounter = target;
        channel.jumpCount += 1;
        continue;
      }
      if (token.family === "end") {
        channel.programCounter += token.length;
        channel.ended = true;
        continue;
      }

      if (token.family === "tempo") {
        // PAL SNDMOD 0x5110 only consumes E3's two immediate bytes.
        channel.programCounter += token.length;
        continue;
      }
      scheduled.push({
        event: {
          tick: channel.nextTick,
          channelIndex: channel.channelIndex,
          token,
        },
        order: this.eventOrder,
      });
      this.eventOrder += 1;
      channel.programCounter += token.length;
    }
  }
}
