import { describe, expect, it } from "vitest";
import {
  captureFilename,
  captureSceneById,
  captureSceneFromSearch,
  captureScenes,
  peachRaceCaptureSceneById,
  peachRaceCaptureScenes,
} from "./captureScenes";

describe("deterministic capture scene catalogue", () => {
  it("keeps stable unique ids at one comparison resolution", () => {
    const ids = captureScenes.map((scene) => scene.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(captureScenes.every((scene) => scene.size.width === 1280 && scene.size.height === 960)).toBe(true);
  });

  it("resolves URL capture requests case-insensitively without inventing scenes", () => {
    expect(captureSceneFromSearch("?capture=FUJI")?.label).toBe("Fuji City");
    expect(captureSceneById(" qfactory ")?.kind).toBe("qfactory");
    expect(captureSceneById(" CAR-PEACH-DAY ")?.kind).toBe("car-visual");
    expect(captureSceneFromSearch("?capture=unknown")).toBeUndefined();
  });

  it("produces deterministic filenames", () => {
    const scene = captureSceneById("peach");
    expect(scene && captureFilename(scene)).toBe("rta-peach-1280x960.png");
  });
  it("pins the Peach comparison camera to the town rather than the rural field centre", () => {
    const peach = captureSceneById("peach");
    expect(peach?.kind).toBe("field-overview");
    if (peach?.kind !== "field-overview") throw new Error("Peach capture is not a field overview.");
    expect(peach.camera?.target).toEqual([1150, 55, 610]);
  });

  it("keeps matched day/night and authentic/extended development cameras", () => {
    const peachDay = captureSceneById("peach-day-ground");
    const peachNight = captureSceneById("peach-night-ground");
    const peachExtended = captureSceneById("peach-night-ground-extended");
    const fujiDay = captureSceneById("fuji-day-ground");
    const fujiNight = captureSceneById("fuji-night-ground");
    const fujiExtended = captureSceneById("fuji-night-ground-extended");
    for (const scene of [peachDay, peachNight, peachExtended, fujiDay, fujiNight, fujiExtended]) {
      expect(scene?.kind).toBe("field-overview");
    }
    if (peachDay?.kind !== "field-overview" || peachNight?.kind !== "field-overview" || peachExtended?.kind !== "field-overview"
      || fujiDay?.kind !== "field-overview" || fujiNight?.kind !== "field-overview" || fujiExtended?.kind !== "field-overview") {
      throw new Error("Expected matched field overview captures.");
    }
    expect(peachDay.camera).toEqual(peachNight.camera);
    expect(peachNight.camera).toEqual(peachExtended.camera);
    expect(fujiDay.camera).toEqual(fujiNight.camera);
    expect(fujiNight.camera).toEqual(fujiExtended.camera);
    expect(peachNight.visibilityMode).toBe("authentic");
    expect(peachExtended.visibilityMode).toBe("extended");
  });

  it("pins matched car-visual cameras and poses across lighting states", () => {
    const day = captureSceneById("car-peach-day");
    const sunset = captureSceneById("car-peach-sunset");
    const night = captureSceneById("car-peach-night");
    for (const scene of [day, sunset, night]) expect(scene?.kind).toBe("car-visual");
    if (day?.kind !== "car-visual" || sunset?.kind !== "car-visual" || night?.kind !== "car-visual") {
      throw new Error("Expected matched car visual capture scenes.");
    }
    expect(day.camera).toEqual(sunset.camera);
    expect(sunset.camera).toEqual(night.camera);
    expect(day.vehicle).toEqual(sunset.vehicle);
    expect(sunset.vehicle).toEqual(night.vehicle);
    expect(day.fieldNumber).toBe(223);
    expect(day.timeOfDayUnits).toBe(12 * 9000);
    expect(sunset.timeOfDayUnits).toBe(17.5 * 9000);
    expect(night.timeOfDayUnits).toBe(22 * 9000);
  });

  it("keeps the rear car-visual camera matched across lighting states", () => {
    const day = captureSceneById("car-peach-day-rear");
    const sunset = captureSceneById("car-peach-sunset-rear");
    const night = captureSceneById("car-peach-night-rear");
    if (day?.kind !== "car-visual" || sunset?.kind !== "car-visual" || night?.kind !== "car-visual") {
      throw new Error("Expected matched rear car visual capture scenes.");
    }
    expect(day.camera).toEqual(sunset.camera);
    expect(sunset.camera).toEqual(night.camera);
    expect(day.vehicle).toEqual(night.vehicle);
  });

  it("defines one frozen moving Peach Raceway capture outside the outdoor catalogue", () => {
    expect(peachRaceCaptureScenes).toHaveLength(1);
    const scene = peachRaceCaptureSceneById(" PEACH-RACE-MOVING ");
    expect(scene).toMatchObject({
      kind: "peach-race",
      updates: 420,
      playerCommands: 1,
      size: { width: 1280, height: 960 },
    });
    expect(captureSceneById("peach-race-moving")).toBeUndefined();
  });

});
