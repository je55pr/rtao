import { describe, expect, it } from "vitest";
import { deserializeCompiledCollision, serializeCompiledCollision } from "./fieldCollision";

describe("compiled field collision", () => {
  it("round-trips compact triangles and surface flags", () => {
    const encoded = serializeCompiledCollision({
      triangleCount: 2,
      positions: new Float32Array([
        0, 3, 0, 10, 3, 0, 0, 3, 10,
        10, 3, 0, 10, 3, 10, 0, 3, 10,
      ]),
      surfaceFlags: new Uint32Array([0x1234, 0xabcd]),
    });
    const decoded = deserializeCompiledCollision(encoded);
    expect(decoded.triangleCount).toBe(2);
    expect([...decoded.positions]).toEqual([
      0, 3, 0, 10, 3, 0, 0, 3, 10,
      10, 3, 0, 10, 3, 10, 0, 3, 10,
    ]);
    expect([...decoded.surfaceFlags]).toEqual([0x1234, 0xabcd]);
  });
});
