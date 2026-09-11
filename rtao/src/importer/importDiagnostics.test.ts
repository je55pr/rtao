import { describe, expect, test } from "vitest";
import { classifyImportSelection, describeImportFailure, discRegion } from "./importDiagnostics";

const discBytes = 600 * 1024 * 1024;
const file = (name: string, size = discBytes) => ({ name, size });

describe("classifying a selection before the long import", () => {
  test("accepts the supported shapes", () => {
    expect(classifyImportSelection([file("game.iso")]).kind).toBe("iso");
    expect(classifyImportSelection([file("game.zip")]).kind).toBe("zip");
    expect(classifyImportSelection([file("game.bin")]).kind).toBe("bin");
    expect(classifyImportSelection([file("game.bin"), file("game.cue", 512)]).kind).toBe("bin-cue");
  });

  test("is case and path insensitive about extensions", () => {
    expect(classifyImportSelection([file("D:\\games\\Road Trip.ISO")]).kind).toBe("iso");
  });

  test("rejects an empty selection", () => {
    const result = classifyImportSelection([]);
    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(result.problem.title).toBe("No file was selected.");
  });

  test("recognises extracted disc contents rather than reporting an unsupported type", () => {
    const result = classifyImportSelection([file("SYSTEM.CNF", 68), file("SLES_513.56", 1_952_960)]);
    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(result.problem.title).toBe("Those look like files extracted from a disc.");
    expect(result.problem.hint).toContain("ISO");
  });

  test("recognises extracted game data even when it is all BIN files", () => {
    const result = classifyImportSelection([file("FLD/223.BIN", 4_000_000), file("CARS/Q62.BIN", 90_000)]);
    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(result.problem.title).toBe("Those BIN files are too small to be a disc image.");
  });

  test("explains a CUE selected without its BIN", () => {
    const result = classifyImportSelection([file("game.cue", 512)]);
    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(result.problem.title).toBe("That CUE has no BIN with it.");
  });

  test("explains several BIN files with no CUE to disambiguate them", () => {
    const result = classifyImportSelection([file("track1.bin"), file("track2.bin")]);
    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(result.problem.title).toBe("Several BIN files were selected without a CUE.");
  });

  test("names common archive formats it cannot read", () => {
    const result = classifyImportSelection([file("game.7z")]);
    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(result.problem.title).toBe("7-Zip archives are not supported.");
    expect(result.problem.hint).toContain("Extract");
  });

  test("rejects a ZIP or ISO mixed with other files", () => {
    const zip = classifyImportSelection([file("game.zip"), file("game.cue", 512)]);
    expect(zip.kind).toBe("rejected");
    if (zip.kind === "rejected") expect(zip.problem.detail).toContain(".cue");
    expect(classifyImportSelection([file("a.iso"), file("b.iso")]).kind).toBe("rejected");
  });
});

describe("disc region", () => {
  test("reads the standard serial prefixes", () => {
    expect(discRegion("SLES_513.56")).toBe("European (PAL)");
    expect(discRegion("SLUS_206.24")).toBe("North American");
    expect(discRegion("SLPM_650.53")).toBe("Japanese");
  });

  test("returns nothing for an unknown prefix", () => {
    expect(discRegion("XXXX_000.00")).toBeUndefined();
  });
});

describe("describing an import failure", () => {
  test("names the region of a wrong-release disc", () => {
    const problem = describeImportFailure("Expected PAL SLES_513.56; found 'SLUS_206.24'.");
    expect(problem.title).toBe("That looks like the North American release.");
    expect(problem.detail).toContain("SLUS_206.24");
  });

  test("still explains a wrong release from an unknown region", () => {
    expect(describeImportFailure("Expected PAL SLES_513.56; found 'XXXX_100.00'.").title)
      .toBe("That is a different game or release.");
  });

  test("translates the low-level disc and archive failures", () => {
    expect(describeImportFailure("SYSTEM.CNF has no BOOT2 entry.").title).toBe("That disc image is not a PlayStation 2 game.");
    expect(describeImportFailure("Password-protected ZIP files are not supported yet.").title).toBe("That ZIP is password-protected.");
    expect(describeImportFailure("ZIP contains neither an ISO nor a BIN/CUE game image.").title).toBe("That ZIP has no disc image inside.");
  });

  // Exact strings thrown by src/disc and src/importer today.
  test("covers every structural disc-read failure the readers throw", () => {
    for (const message of [
      "Cooked ISO size is not a multiple of 2048 bytes.",
      "MODE2/2352 BIN size is not a multiple of 2352 bytes.",
      "Disc image is too small to contain an ISO9660 volume descriptor.",
      "No ISO9660 Primary Volume Descriptor was found.",
      "ISO9660 both-endian fields do not agree.",
      "ISO9660 directory record crosses a logical-sector boundary.",
      "Sector 16 is not a MODE2 raw sector.",
    ]) {
      expect(describeImportFailure(message).title, message).toBe("That file could not be read as a disc image.");
    }
  });

  test("separates CUE layout problems from CUE/BIN mismatches", () => {
    expect(describeImportFailure("Expected a single-track TRACK 01 MODE2/2352 CUE with INDEX 01.").title)
      .toBe("That CUE describes a layout RTAO cannot read.");
    expect(describeImportFailure("CUE INDEX points beyond the BIN image.").title).toBe("The CUE and BIN do not line up.");
    expect(describeImportFailure("Invalid CUE INDEX timestamp.").title).toBe("The CUE and BIN do not line up.");
  });

  test("explains an incomplete dump", () => {
    expect(describeImportFailure("Required game file 'FLD/223.BIN' is missing.").title).toBe("That disc image is missing game files.");
    expect(describeImportFailure("Expected 64 standard FLD sectors; found 41.").title).toBe("That disc image is missing game files.");
    expect(describeImportFailure("Disc file 'SLES_513.56' was not found.").title).toBe("That disc image is missing game files.");
  });

  test("keeps the storage estimate in the detail it reports", () => {
    const problem = describeImportFailure("The archive expands to 4.3 GiB, but this browser reports only 1.2 GiB of origin storage available.");
    expect(problem.title).toBe("This browser does not have room for the install.");
    expect(problem.detail).toContain("4.3 GiB");
  });

  test("falls back without losing the original message", () => {
    const problem = describeImportFailure("Something entirely unexpected happened.");
    expect(problem.title).toBe("That game image could not be imported.");
    expect(problem.detail).toBe("Something entirely unexpected happened.");
  });

  test("keeps a caller's stage-specific title when it cannot do better", () => {
    expect(describeImportFailure("Something unexpected.", "The local install finished, but the world could not be displayed.").title)
      .toBe("The local install finished, but the world could not be displayed.");
  });

  test("prefers its own title when it recognises the failure", () => {
    expect(describeImportFailure("Expected PAL SLES_513.56; found 'SLPM_650.53'.", "Some stage failed.").title)
      .toBe("That looks like the Japanese release.");
  });
});
