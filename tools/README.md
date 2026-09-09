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
- `race_grid_capture.mjs` — deterministic race grid/body/paint evidence captures;
- `sandbox_fixture.py` — low-memory derived outdoor fixture and capture workflow;
- `car_visual_capture.py` — deterministic close-car visual captures;
- `shop_census.py`, `shop_readiness.py`, `shop_room_capture.py`, `shop_regression.py` — fixed-interior archaeology and regression helpers;
- `mips_probe.py`, `disasm_elf_context.py` — executable/disassembly helpers.

One-off sandbox scripts from the pre-repository workflow are retained under `docs/archive/one-off-tools/` and should not be treated as supported utilities.
