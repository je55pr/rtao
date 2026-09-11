import { describe, expect, test } from "vitest";
import { appStorageDirectoryName, stableAppDirectoryName } from "./storageChannel";

describe("storage channel directory", () => {
  test("keeps the existing root for the stable build so installed games survive", () => {
    expect(stableAppDirectoryName).toBe("rta-browser");
    expect(appStorageDirectoryName(undefined)).toBe("rta-browser");
    expect(appStorageDirectoryName("")).toBe("rta-browser");
    expect(appStorageDirectoryName("stable")).toBe("rta-browser");
  });

  test("gives the DEV build its own root", () => {
    expect(appStorageDirectoryName("dev")).toBe("rta-browser-dev");
  });

  test("refuses an unknown channel rather than silently sharing the stable install", () => {
    expect(() => appStorageDirectoryName("staging")).toThrow("Unknown RTAO storage channel 'staging'");
    expect(() => appStorageDirectoryName("DEV")).toThrow();
  });
});
