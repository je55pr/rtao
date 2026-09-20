import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const contractUrl = new URL(
  "../../docs/evidence/camera/2026-09-19/pal-chase-camera-contract.json",
  import.meta.url,
);
const verificationUrl = new URL(
  "../../docs/evidence/camera/2026-09-19/pal-chase-camera-verification.json",
  import.meta.url,
);
const rawInstructionUrl = new URL(
  "../../docs/evidence/camera/2026-09-19/pal-chase-camera-instructions.txt",
  import.meta.url,
);

const contractText = readFileSync(contractUrl, "utf8");
const contract = JSON.parse(contractText);
const verification = JSON.parse(readFileSync(verificationUrl, "utf8"));
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

test("retained PAL chase-camera authority pins addresses, vehicle inputs and presets", () => {
  expect(contract.executable).toEqual({
    name: "SLES_513.56",
    sha256: "2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9",
  });
  expect(contract.addresses).toMatchObject({
    followHelper: "0x0021eac8",
    obstructionCorrection: "0x0021ef20",
    ordinaryUpdate: "0x0021f540",
    recenterState: "0x0021fb08",
    cameraTransformBuilder: "0x00220458",
    presetTable: "0x002a2150",
  });
  expect(contract.vehicleInputs.yaw.recordOffset).toBe("0x1d4");
  expect(contract.vehicleInputs.slip.recordOffset).toBe("0x1d6");
  expect(contract.constants.pi.value).toBeCloseTo(Math.PI, 6);
  expect(contract.constants.lagStepPerInvocation.positive.value).toBeCloseTo(0.001, 9);
  expect(contract.constants.lagStepPerInvocation.negative.value).toBeCloseTo(-0.001, 9);

  expect(contract.presets).toHaveLength(10);
  expect(contract.presets[0]).toMatchObject({
    address: "0x2a2150",
    vector00: [0, 2, -7, 1],
    field10: 500,
    field14: "0x380",
    field1c: "0x0",
  });
  expect(contract.presets[9]).toMatchObject({
    address: "0x2a2270",
    field10: 461,
    field14: "0x880",
    field1c: "0x0",
  });
  expect(contract.semanticControl).toMatchObject({
    label: "Change View",
    entryAddress: "0x2a1278",
    field08: "0x78",
  });
});

test("retained PAL fixed-step lag and recenter traces stay numeric and bounded", () => {
  expect(contract.fixedStepLag.numericTrace).toEqual([
    { tick: 0, value: Math.fround(0.001), velocity: Math.fround(0.001) },
    { tick: 1, value: Math.fround(0.003), velocity: Math.fround(0.002) },
    {
      tick: 2,
      value: Math.fround(0.005),
      velocity: Math.fround(Math.fround(0.005) - Math.fround(0.003)),
    },
  ]);

  expect(
    contract.resetAndRecenter.numericTrace.map((entry: { timer: number; angle: number }) => [
      entry.timer,
      entry.angle,
    ]),
  ).toEqual([
    [0, -0x8000],
    [0x3f, -0x8000],
    [0x40, -0x7e00],
    [0x7f, 0],
    [0x80, 0],
  ]);
  expect(contract.resetAndRecenter.reset).toBe(
    "ordinary update with controller +0x08 == 0 clears four per-player lag words at 0x017d41b0 + player*0x10 before returning",
  );
  expect(contract.resetAndRecenter.boundary).toContain("No single native boolean");
  expect(contract.obstruction.querySlot).toBe("gp-0x3e60");
  expect(contract.obstruction.probeOffsets).toEqual([
    "camera output +0x100",
    "camera output +0x110",
  ]);
});

test("retained verification hashes bounded source ranges without committing raw executable code", () => {
  expect(verification.contractSha256).toBe(sha256(contractText));
  expect(verification.instructionWords).toBe(1145);
  expect(
    verification.ranges.map((range: { start: string; endExclusive: string }) => [
      range.start,
      range.endExclusive,
    ]),
  ).toEqual([
    ["0x21eac8", "0x21ef1c"],
    ["0x21ef20", "0x21f1d4"],
    ["0x21f540", "0x21fb08"],
    ["0x21fb08", "0x21fc40"],
    ["0x220458", "0x2207e4"],
    ["0x2209c8", "0x220a18"],
  ]);
  for (const range of verification.ranges) {
    expect(range.rangeSha256).toMatch(/^[0-9a-f]{64}$/);
  }
  expect(verification.presetTableSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(verification.changeViewEntrySha256).toMatch(/^[0-9a-f]{64}$/);
  expect(existsSync(rawInstructionUrl)).toBe(false);
});
