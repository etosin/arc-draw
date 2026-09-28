import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { join } from "node:path";
import {
  explainDownloadFailure,
  getLatestWarUrl,
  parseReleaseTag,
} from "./downloader.js";

const realFetch = globalThis.fetch;

function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
) {
  const fn = jest.fn((input: unknown, init?: RequestInit) =>
    handler(String(input), init),
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

const API = "https://api.github.com/repos/jgraph/drawio/releases/latest";
const PAGE = "https://github.com/jgraph/drawio/releases/latest";

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
});

describe("parseReleaseTag", () => {
  it("extracts the tag from a release URL", () => {
    expect(
      parseReleaseTag("https://github.com/jgraph/drawio/releases/tag/v31.5.3"),
    ).toBe("v31.5.3");
  });

  it("ignores query strings and fragments", () => {
    expect(parseReleaseTag("/x/releases/tag/v1.2.3?foo=bar#baz")).toBe(
      "v1.2.3",
    );
  });

  it("returns null when there is no tag", () => {
    expect(parseReleaseTag(null)).toBeNull();
    expect(parseReleaseTag("https://github.com/jgraph/drawio")).toBeNull();
  });
});

describe("getLatestWarUrl", () => {
  it("uses the API answer when it works", async () => {
    const fetchMock = mockFetch(async (url) => {
      expect(url).toBe(API);
      return new Response(
        JSON.stringify({
          assets: [
            { name: "other.zip", browser_download_url: "https://x/other" },
            { name: "draw.war", browser_download_url: "https://x/draw.war" },
          ],
        }),
        { status: 200 },
      );
    });

    await expect(getLatestWarUrl()).resolves.toBe("https://x/draw.war");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the release page when the API is rate limited (403)", async () => {
    mockFetch(async (url) => {
      if (url === API) return new Response("rate limited", { status: 403 });
      expect(url).toBe(PAGE);
      return new Response(null, {
        status: 302,
        headers: {
          location: "https://github.com/jgraph/drawio/releases/tag/v31.5.3",
        },
      });
    });

    await expect(getLatestWarUrl()).resolves.toBe(
      "https://github.com/jgraph/drawio/releases/download/v31.5.3/draw.war",
    );
  });

  it("falls back when the API request itself throws", async () => {
    mockFetch(async (url) => {
      if (url === API) throw new TypeError("fetch failed");
      return new Response(null, {
        status: 302,
        headers: { location: "/jgraph/drawio/releases/tag/v30.0.0" },
      });
    });

    await expect(getLatestWarUrl()).resolves.toBe(
      "https://github.com/jgraph/drawio/releases/download/v30.0.0/draw.war",
    );
  });

  it("reports both causes when API and fallback fail", async () => {
    mockFetch(async (url) =>
      url === API
        ? new Response("no", { status: 403 })
        : new Response("nope", { status: 200 }),
    );

    await expect(getLatestWarUrl()).rejects.toThrow(
      /GitHub API: GitHub API answered 403.*release page: release page answered 200/,
    );
  });

  it("sends the token to the API when GITHUB_TOKEN is set", async () => {
    process.env.GITHUB_TOKEN = "abc123";
    const fetchMock = mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            assets: [{ name: "draw.war", browser_download_url: "https://x/w" }],
          }),
          { status: 200 },
        ),
    );

    await getLatestWarUrl();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer abc123",
    );
  });

  it("sends no Authorization header without a token", async () => {
    const fetchMock = mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            assets: [{ name: "draw.war", browser_download_url: "https://x/w" }],
          }),
          { status: 200 },
        ),
    );

    await getLatestWarUrl();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(
      (init.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
  });
});

describe("explainDownloadFailure", () => {
  it("tells the user exactly what to do", () => {
    const dir = join("some", "cache");
    const message = explainDownloadFailure(dir, new Error("boom"));
    expect(message).toContain("boom");
    expect(message).toContain("GITHUB_TOKEN");
    expect(message).toContain("https://github.com/jgraph/drawio/releases/latest");
    expect(message).toContain(join(dir, "webapp"));
    expect(message).toContain("WEB-INF");
    expect(message).toContain("--asset-path");
  });
});
