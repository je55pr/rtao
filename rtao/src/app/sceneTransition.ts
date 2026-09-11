/**
 * Short presentation-only fades between town, interiors and races. Each scene
 * change fades in from black rather than hard-cutting: nothing is awaited, so
 * recovered behaviour and input ordering are untouched, and a scene that loads
 * keeps showing its own progress instead of hiding behind the cover.
 */

export interface FadeSurface {
  /** `instant` suppresses the transition so the cover appears on this frame. */
  setCovered(covered: boolean, instant: boolean): void;
}

export function fadeEnabled(options: { readonly enabled: boolean; readonly reducedMotion: boolean }): boolean {
  return options.enabled && !options.reducedMotion;
}

export class SceneFade {
  private enabled = true;

  constructor(
    private readonly surface: FadeSurface,
    private readonly schedule: (reveal: () => void) => void,
    private readonly reducedMotion: () => boolean = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  ) {}

  /** Deterministic captures drive their own scene changes and must not fade. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Covers the scene immediately, then fades the cover away. */
  flash(): void {
    if (!fadeEnabled({ enabled: this.enabled, reducedMotion: this.reducedMotion() })) return;
    this.surface.setCovered(true, true);
    this.schedule(() => this.surface.setCovered(false, false));
  }
}
