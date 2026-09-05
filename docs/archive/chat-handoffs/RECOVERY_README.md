# Recovery README — source-containing handoff

This handoff **does contain a full Three.js/TypeScript + C# source tree at its root**.

## What source is this?

The project root was extracted from the user-supplied clean snapshot:

`RTA_ThreeJS_night_work_snapshot_2026-08-30.zip`

That snapshot is the known-good source baseline created immediately before the latest Aug-31 night-renderer archaeology.

The Aug-31 work happened after that snapshot and the live sandbox containing those edits was later refreshed away. Therefore:

- **root source = real, complete Aug-30 source baseline**;
- **`HANDOFF_NEXT_CHAT.md` = authoritative description of the later Aug-31 work that must be reconstructed/reapplied**;
- do not pretend cache-v7 / TEX0 TFX/TCC / final experimental GS MODULATE edits are already present in the root source unless inspection proves they are.

The snapshot's original handoff has been preserved as:

`handoff/SNAPSHOT_HANDOFF_NEXT_CHAT_2026-08-30.md`

## Recommended recovery order

1. Treat the project root as the source baseline. Do not ask the user to re-upload the Aug-30 snapshot.
2. Read `HANDOFF_NEXT_CHAT.md` fully before editing.
3. Reapply/reconstruct the documented post-snapshot night work cautiously.
4. Run full web validation (`npm run check`) once dependencies are restored.
5. Build/run the C# archaeology tools when the supplied .NET SDK/dependencies are available.
6. Use `reference/RoadTripAdventureMonoGame-interiors.zip` as additional PS2/C# archaeology reference.

## Deliberately not bundled

Original PAL game data, the .NET SDK tarball, NuGet packages and Node dependencies are not duplicated inside this handoff. They are large/tooling/proprietary inputs and should remain separate.
