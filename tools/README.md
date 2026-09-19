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
- `vu_micro_probe.py` — partial VU microinstruction diagnostics with explicit raw output for unknown forms.

### R5900 executable probe

`mips_probe.py` is a deliberately bounded EE diagnostic decoder, not a generic MIPS disassembler. It covers the integer/control-flow forms used by archaeology plus useful EE-specific COP0/COP1, REGIMM likely branches, LQ/SQ, 64-bit shifts and selected MMI forms. Unsupported encodings remain visible as `.word 0xXXXXXXXX` rather than being guessed.

```bash
py -3.12 tools/mips_probe.py path/to/executable.bin 0x00100000 --offset 0x200 --length 0x80
py -3.12 tools/mips_probe.py --self-test
```

The self-test uses fixed instruction words for COP0/COP1, accumulator/min/max/rsqrt, corrected MMI sub-opcodes, LQ/SQ, likely branches and raw fallbacks. The EE decode was cross-checked against PS2Tek's instruction-decoding tables and PCSX2's opcode/disassembly tables rather than treating the retired C# helper as encoding authority. Keep new coverage similarly evidence-backed and narrow.

### VU microinstruction probe

`vu_micro_probe.py` reads raw little-endian VU micro memory as 8-byte instruction pairs (lower word, then upper word). `--start` and `--count` are instruction indices/counts, not byte offsets.

```bash
py -3.12 tools/vu_micro_probe.py path/to/vu1-micro.bin --start 0x20 --count 16
py -3.12 tools/vu_micro_probe.py --self-test
```

The decoder intentionally covers only the instruction forms retained from the useful historical diagnostic path. Unsupported encodings print as `.upper 0xXXXXXXXX` or `.lower 0xXXXXXXXX`; when the upper I flag is set, the lower word is shown as the immediate float instead of being decoded as an instruction.

One-off sandbox scripts from the pre-repository workflow are retained under `docs/archive/one-off-tools/` and should not be treated as supported utilities.
