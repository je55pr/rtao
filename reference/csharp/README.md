# C# / MonoGame reference implementation

This directory contains the earlier C#/MonoGame Road Trip Adventure reconstruction. It is retained for archaeology, format comparison and historical context.

**It is not the active RTAO implementation.** Player-facing development should normally target `../../rtao/`.

The original solution layout is preserved inside this directory, including `Directory.Build.props`, `NuGet.Config`, `src/`, `tests/` and `RoadTripAdventure.slnx`, so C# project-relative references and build inheritance remain self-contained.

When specifically working on the reference implementation:

```bash
cd reference/csharp
dotnet build RoadTripAdventure.slnx
```

Original game data is never part of this repository and must be supplied locally.
