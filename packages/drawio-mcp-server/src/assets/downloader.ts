import {
  createWriteStream,
  existsSync,
  mkdirSync,
  createReadStream,
  rmSync,
} from "node:fs";
import { pipeline } from "node:stream/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Extract } from "unzipper";

import type { Logger } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DRAWIO_GITHUB_API =
  "https://api.github.com/repos/jgraph/drawio/releases/latest";
const DRAWIO_LATEST_PAGE = "https://github.com/jgraph/drawio/releases/latest";
const DRAWIO_DOWNLOAD_BASE =
  "https://github.com/jgraph/drawio/releases/download";

function githubApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "drawio-mcp-server",
  };
  // Optional: an authenticated request gets a far higher rate limit than the
  // 60 requests/hour/IP that anonymous callers share. No scopes are needed.
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function getWarUrlFromApi(): Promise<string> {
  const response = await fetch(DRAWIO_GITHUB_API, {
    headers: githubApiHeaders(),
  });
  if (!response.ok) {
    throw new Error(`GitHub API answered ${response.status}`);
  }

  const data = await response.json();
  const warAsset = data.assets?.find(
    (asset: { name: string }) => asset.name === "draw.war",
  );

  if (!warAsset) {
    throw new Error("Could not find draw.war in latest release");
  }

  return warAsset.browser_download_url;
}

/** Extracts the release tag from a `.../releases/tag/<tag>` URL, or null. */
export function parseReleaseTag(location: string | null): string | null {
  const match = /\/releases\/tag\/([^/?#]+)/.exec(location ?? "");
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Fallback that does not use the rate-limited REST API: github.com redirects
 * `/releases/latest` to `/releases/tag/<tag>`, and every release publishes its
 * archive at a predictable `/releases/download/<tag>/draw.war` URL.
 */
async function getWarUrlFromReleasePage(): Promise<string> {
  const response = await fetch(DRAWIO_LATEST_PAGE, { redirect: "manual" });
  const tag = parseReleaseTag(response.headers.get("location"));
  if (!tag) {
    throw new Error(
      `release page answered ${response.status} without a release tag`,
    );
  }
  return `${DRAWIO_DOWNLOAD_BASE}/${encodeURIComponent(tag)}/draw.war`;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function getLatestWarUrl(): Promise<string> {
  let apiError: unknown;
  try {
    return await getWarUrlFromApi();
  } catch (err) {
    apiError = err;
  }

  try {
    return await getWarUrlFromReleasePage();
  } catch (fallbackError) {
    throw new Error(
      `Failed to get draw.io release info (GitHub API: ${describeError(apiError)}; ` +
        `release page: ${describeError(fallbackError)})`,
    );
  }
}

export async function downloadFile(
  url: string,
  destPath: string,
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download: ${response.status} ${response.statusText}`,
    );
  }

  if (!response.body) {
    throw new Error("No response body");
  }

  const destDir = dirname(destPath);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  await pipeline(response.body, createWriteStream(destPath));
}

export async function extractWar(
  warPath: string,
  extractDir: string,
): Promise<void> {
  if (!existsSync(extractDir)) {
    mkdirSync(extractDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const extract = Extract({ path: extractDir });
    const stream = createReadStream(warPath);

    stream.pipe(extract);

    extract.on("close", resolve);
    extract.on("error", reject);
  });
}

export function cleanupExtractedFiles(extractDir: string, log: Logger): void {
  const webappDir = join(extractDir, "webapp");
  const pathsToRemove = [
    join(webappDir, "WEB-INF"),
    join(webappDir, "META-INF"),
  ];

  for (const path of pathsToRemove) {
    if (existsSync(path)) {
      try {
        rmSync(path, { recursive: true, force: true });
        log.log("info", `Removed: ${path}`);
      } catch (err) {
        log.log("warning", `Failed to remove ${path}:`, err);
      }
    }
  }
}

export function explainDownloadFailure(
  targetDir: string,
  err: unknown,
): string {
  return [
    `Could not download the draw.io editor assets: ${describeError(err)}`,
    "",
    "This usually means GitHub is rate-limiting this network or a proxy blocks it. Either:",
    "  1. Set a GITHUB_TOKEN environment variable (any token, no scopes needed) and restart; or",
    "  2. Install the assets by hand:",
    "     - download draw.war from https://github.com/jgraph/drawio/releases/latest",
    `     - unzip it into ${join(targetDir, "webapp")} (so that index.html is directly inside)`,
    "     - delete the WEB-INF and META-INF folders in there",
    "     - start the server again, with --asset-path if you used a custom folder.",
  ].join("\n");
}

export async function downloadAndExtractAssets(
  targetDir: string,
  log: Logger,
): Promise<void> {
  log.log("info", "Fetching draw.io release info...");

  const warPath = join(targetDir, "draw.war");
  try {
    const warUrl = await getLatestWarUrl();
    log.log("info", `Downloading draw.war from ${warUrl}...`);
    await downloadFile(warUrl, warPath);
  } catch (err) {
    throw new Error(explainDownloadFailure(targetDir, err));
  }
  log.log("info", "Download complete.");

  const webappDir = join(targetDir, "webapp");

  log.log("info", "Extracting archive...");
  await extractWar(warPath, webappDir);
  log.log("info", "Extraction complete.");

  log.log("info", "Cleaning up unnecessary files...");
  cleanupExtractedFiles(targetDir, log);

  // Remove the WAR file
  try {
    rmSync(warPath, { force: true });
  } catch (err) {
    log.log("warning", "Failed to remove WAR file:", err);
  }

  log.log("info", "Assets ready!");
}

export async function ensureAssets(
  config: {
    readonly assetPath?: string;
  },
  log: Logger,
): Promise<{ readonly assetRoot: string; readonly isLocal: boolean }> {
  const { getCacheDir, getAssetRoot, assetsExist } =
    await import("./manager.js");
  const { ensureSupportedAssets, SERVER_COMPAT_MATRIX } =
    await import("./auto-refresh.js");

  const cacheDir = getCacheDir(config.assetPath);
  const assetRoot = getAssetRoot(config);

  if (!assetsExist(config)) {
    log.log("info", `Assets not found in ${assetRoot}. Downloading...`);
    await downloadAndExtractAssets(cacheDir, log);
  }

  await ensureSupportedAssets(config, SERVER_COMPAT_MATRIX, log, {
    downloadAndExtract: (targetDir) => downloadAndExtractAssets(targetDir, log),
  });

  return { assetRoot, isLocal: true };
}
