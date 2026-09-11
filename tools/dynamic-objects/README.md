# Dynamic object PAL census

`field_dynamic_object_census.pal.test.ts` is an opt-in archaeology probe for the 64 ordinary PAL `FLD/NNN.BIN` sectors.

It enumerates every field Extra[n], fingerprints each extra with SHA-256, and records only structural metadata for HG2 / MSCALF object containers: section counts, primitive/vertex/strip-triangle counts, VU program IDs, local radii and decoded texture dimensions.

The report deliberately retains no original game payload bytes. It is suitable for committing as clean-room evidence.

Run it with a local MODE2/2352 PAL BIN:

```cmd
set "RTA_PAL_BIN=C:\path\to\Road Trip Adventure (Europe) (En,Fr,De).bin"
set "DYNAMIC_OBJECT_CENSUS_OUTPUT=docs\evidence\dynamic-objects\field-dynamic-object-census-2026-09-10.json"
rtao\node_modules\.bin\vitest.cmd run tools\dynamic-objects\field_dynamic_object_census.pal.test.ts --root .
```

If `DYNAMIC_OBJECT_CENSUS_OUTPUT` is omitted, the JSON report is printed to stdout. `RTA_PAL_BIN` is required; without it Vitest skips the PAL-backed probe.
