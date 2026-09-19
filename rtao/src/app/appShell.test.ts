import { describe, expect, test } from "vitest";
import { installAppShell } from "./appShell";

describe("pause Warp shell", () => {
  test("keeps Warp inside the temporary pause flow with player-facing copy", () => {
    const app = { innerHTML: "" } as HTMLElement;

    installAppShell(app);

    expect(app.innerHTML).toContain('id="pause-overlay"');
    expect(app.innerHTML).toContain('id="pause-warp"');
    expect(app.innerHTML).toContain('id="pause-warp-menu" hidden');
    expect(app.innerHTML).toContain('id="pause-warp-destinations"');
    expect(app.innerHTML).toContain('id="pause-warp-back"');
    expect(app.innerHTML).toContain('id="audio-master-volume"');
    expect(app.innerHTML).toContain('id="audio-music-mute"');
    expect(app.innerHTML).toContain('id="audio-sfx-volume"');
    expect(app.innerHTML).toContain("separately from recovered PAL save data");
    expect(app.innerHTML).toContain("Esc back");
    expect(app.innerHTML).not.toMatch(/debug warp|warp debug/i);
  });
});
