import { afterEach, describe, expect, it } from "@jest/globals";

import { isGraphDecompressReady } from "./bootstrap";

afterEach(() => {
  delete (globalThis as any).window;
});

describe("isGraphDecompressReady", () => {
  it("is false before draw.io's Graph script has loaded", () => {
    (globalThis as any).window = {};
    expect(isGraphDecompressReady()).toBe(false);
  });

  it("is false while Graph exists but decompress is not yet attached", () => {
    (globalThis as any).window = { Graph: {} };
    expect(isGraphDecompressReady()).toBe(false);
  });

  it("is false when decompress is present but not a function", () => {
    (globalThis as any).window = { Graph: { decompress: "not a function" } };
    expect(isGraphDecompressReady()).toBe(false);
  });

  it("is true once Graph.decompress is callable", () => {
    (globalThis as any).window = { Graph: { decompress: () => "" } };
    expect(isGraphDecompressReady()).toBe(true);
  });
});
