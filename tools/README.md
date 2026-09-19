# RTAO development tools

Maintained reusable archaeology and deterministic capture utilities live here. Run them from the repository root unless a tool says otherwise.

Most browser-backed tools expect a capture bundle built from the active app:

```bash
cd rtao
npm run build:capture
cd ..
```

Common environment variables:

- `RTA_GAME_DIR` — directory containing the developer's local PAL BIN/CUE;
- `RTA_CHROMIUM_EXECUTABLE` — Chromium/Chrome executable used by Playwright.

Useful entry points include:

- `executable_probe.py` — bounded PAL executable virtual-address reads;
- `dialogue_trace.py` — fixed-interior dialogue/control traces;
- `race_course_probe.py` — compile and summarize executable-referenced ordinary race courses;
- `race_course_validation.mjs` — C00–C14 structural, grounding, overview and repeat-grid acceptance sweep;
- `race_grid_capture.mjs` — deterministic race grid/body/paint evidence captures;
- `sandbox_fixture.py` — low-memory derived outdoor fixture and capture workflow;
- `car_visual_capture.py` — deterministic close-car visual captures;
- `shop_census.py`, `shop_readiness.py`, `shop_room_capture.py`, `shop_regression.py` — fixed-interior archaeology and regression helpers;
- `mips_probe.py`, `disasm_elf_context.py` — executable/R5900 disassembly helpers;
- `elf_archaeology.py` — target-address, structure-offset, and static GIF A+D executable scanners;
- `vu_mpg_extract.py` — PAL ELF VIF MPG locator and VU1 micro-memory reconstruction;
- `vu_micro_probe.py` — partial VU microinstruction diagnostics with explicit raw output for unknown forms.

### R5900 executable probe

`mips_probe.py` is a deliberately bounded EE diagnostic decoder, not a generic MIPS disassembler. It covers the integer/control-flow forms used by archaeology plus useful EE-specific COP0/COP1, REGIMM likely branches, LQ/SQ, 64-bit shifts and selected MMI forms. Unsupported encodings remain visible as `.word 0xXXXXXXXX` rather than being guessed.

```bash
py -3.12 tools/mips_probe.py path/to/executable.bin 0x00100000 --offset 0x200 --length 0x80
py -3.12 tools/mips_probe.py --self-test
```

The self-test uses fixed instruction words for COP0/COP1, accumulator/min/max/rsqrt, corrected MMI sub-opcodes, LQ/SQ, likely branches and raw fallbacks. The EE decode was cross-checked against PS2Tek's instruction-decoding tables and PCSX2's opcode/disassembly tables rather than treating the retired C# helper as encoding authority. Keep new coverage similarly evidence-backed and narrow.

### VU1 MPG extraction

`vu_mpg_extract.py` works directly on a user-supplied little-endian ELF32 executable; it does not read or ship game data and is standalone from the retired C# implementation. The finder scans file-backed PT_LOAD ranges for aligned VIF MPG command words:

```bash
py -3.12 tools/vu_mpg_extract.py --self-test
py -3.12 tools/vu_mpg_extract.py find path/to/SLES_513.56
```

Finder output reports the raw word, effective instruction count, VU1 destination range, IRQ state, and any invalid VU1 address/range. Because arbitrary executable or payload data can resemble a VIFcode word, treat finder hits as candidates and prefer starts that form a coherent contiguous stream.

Reconstruct an HG2 upload stream from a candidate virtual address, then feed the 16 KiB result to the maintained disassembler:

```bash
py -3.12 tools/vu_mpg_extract.py extract path/to/SLES_513.56 0x00123456 path/to/vu1-micro.bin
py -3.12 tools/vu_micro_probe.py path/to/vu1-micro.bin --start 0 --count 32
```

MPG NUM=0 is decoded as 256 microinstructions. VU1 addresses are limited to 2048 8-byte instructions; reserved destination bits or a write crossing instruction 0x7FF are rejected. Between contiguous HG2 MPG packets, only all-zero VIF NOP words needed to reach the next 16-byte qword boundary are skipped. Unwritten VU1 memory remains zero-filled.

### VU microinstruction probe

`vu_micro_probe.py` reads raw little-endian VU micro memory as 8-byte instruction pairs (lower word, then upper word). `--start` and `--count` are instruction indices/counts, not byte offsets.

```bash
py -3.12 tools/vu_micro_probe.py path/to/vu1-micro.bin --start 0x20 --count 16
py -3.12 tools/vu_micro_probe.py --self-test
```

The decoder intentionally covers only the instruction forms retained from the useful historical diagnostic path. Unsupported encodings print as `.upper 0xXXXXXXXX` or `.lower 0xXXXXXXXX`; when the upper I flag is set, the lower word is shown as the immediate float instead of being decoded as an instruction.

One-off sandbox scripts from the pre-repository workflow are retained under `docs/archive/one-off-tools/` and should not be treated as supported utilities.

### ELF archaeology scanners

`elf_archaeology.py` preserves the useful executable-search workflows from the retired C# diagnostics without depending on proprietary inputs. It accepts a complete little-endian ELF32 executable, or a flat virtual-address dump when `--base-address` is supplied.

```bash
py -3.12 tools/elf_archaeology.py find-address path/to/PAL.ELF 0x002a9020
py -3.12 tools/elf_archaeology.py find-offset path/to/PAL.ELF 0xffc0 0x80
py -3.12 tools/elf_archaeology.py find-gs-packets path/to/PAL.ELF
py -3.12 tools/elf_archaeology.py self-test
```

`find-address` searches file-backed instructions for LUI followed within six words by an ADDIU or ORI using the same base register. ADDIU sign-extension/carry and ORI zero-extension are evaluated independently, so addresses whose low half has bit 15 set are handled correctly.

`find-offset` searches signed 16-bit immediate offsets on useful EE loads/stores, including LQ/SQ, 64-bit scalar accesses, COP1 word accesses, and VU0 LQC2/SQC2 forms. Hex bounds such as `0xffe0` are interpreted as signed 16-bit values.

`find-gs-packets` scans qword-aligned file-backed data for PACKED GIF tags containing one A+D descriptor and 1–32 register writes. Known GS addresses are named; valid but unknown addresses remain explicit as `GS_XX` rather than being assigned guessed semantics.

Flat dumps produced by other maintained tooling can be scanned directly, for example:

```bash
py -3.12 tools/executable_probe.py 0x00100000 0x20000 scratch/pal-range.bin
py -3.12 tools/elf_archaeology.py find-offset scratch/pal-range.bin 0xff80 0x80 --base-address 0x00100000
```

The `self-test` builds a synthetic ELF in memory and verifies both LUI materialization forms, signed structure offsets including LQ/SQ, packed GIF A+D recognition, GS register naming, rejection of malformed packets, and flat-dump address mapping.
