import { describe, expect, test } from "vitest";
import { fieldDisplayName, gameHudView, raceStatusText } from "./hudModel";

describe("field display name", () => {
  test("prefers the authored place name", () => {
    expect(fieldDisplayName(223)).toBe("Peach Town");
    expect(fieldDisplayName(113)).toBe("Fuji City");
  });

  test("falls back to the padded sector id", () => {
    expect(fieldDisplayName(99)).toBe("FLD/099");
    expect(fieldDisplayName(221)).toBe("FLD/221");
  });
});

describe("game-facing HUD", () => {
  test("stays hidden outside driving and races", () => {
    const view = gameHudView({ mode: "overview", cake: 1200, location: "Peach Town" });
    expect(view.visible).toBe(false);
  });

  test("shows location, Cake and speed while driving", () => {
    const view = gameHudView({ mode: "driving", cake: 1200, location: "Peach Town", speedKph: 47 });
    expect(view.visible).toBe(true);
    expect(view.location).toBe("Peach Town");
    expect(view.cake).toBe("1,200 Cake");
    expect(view.speed).toBe("47 km/h");
    expect(view.speedVisible).toBe(true);
    expect(view.hint).toBe("Esc · pause and settings");
  });

  test("hides the status line until there is something to say", () => {
    expect(gameHudView({ mode: "driving", cake: 0, location: "Peach Town", speedKph: 0 }).statusVisible).toBe(false);
    const nearby = gameHudView({ mode: "driving", cake: 0, location: "Peach Town", speedKph: 0, nearby: "Nearby · Q's Factory · E enter" });
    expect(nearby.statusVisible).toBe(true);
    expect(nearby.status).toBe("Nearby · Q's Factory · E enter");
  });

  test("race status wins over a nearby prompt and keeps Esc leaving the race", () => {
    const view = gameHudView({
      mode: "race",
      cake: 0,
      location: "Peach Raceway",
      raceStatus: "Peach Raceway · lap 2/3",
      nearby: "Nearby · James · E talk",
    });
    expect(view.status).toBe("Peach Raceway · lap 2/3");
    expect(view.speedVisible).toBe(false);
    expect(view.hint).toBe("Esc · leave race");
  });
});

describe("race status text", () => {
  const base = { countdownComplete: true, finishIndex: null, completedLaps: 0, entrantCount: 24, totalLaps: 3, rewardSaved: false };

  test("reports the starting grid before the countdown completes", () => {
    expect(raceStatusText({ ...base, countdownComplete: false })).toBe("Peach Raceway · starting grid");
  });

  test("counts laps from the native completed-lap count", () => {
    expect(raceStatusText(base)).toBe("Peach Raceway · lap 1/3");
    expect(raceStatusText({ ...base, completedLaps: 1 })).toBe("Peach Raceway · lap 2/3");
  });

  test("clamps the displayed lap to the race length", () => {
    expect(raceStatusText({ ...base, completedLaps: 5 })).toBe("Peach Raceway · lap 3/3");
  });

  test("reports the native finishing place and whether the reward was saved", () => {
    expect(raceStatusText({ ...base, finishIndex: 0 })).toBe("Finished · native place 1/24");
    expect(raceStatusText({ ...base, finishIndex: 7, rewardSaved: true })).toBe("Finished · native place 8/24 · reward saved");
  });
});
