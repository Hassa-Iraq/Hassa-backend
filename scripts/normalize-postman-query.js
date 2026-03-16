/**
 * Normalize Postman request URLs by adding structured `url.query`.
 *
 * Why:
 * Some importers (including API tools) miss query params when they only exist
 * in raw URL strings like ".../path?a=1&b=2". This script preserves raw URLs
 * and injects `url.query` so params are reliably imported.
 *
 * Usage:
 *   node scripts/normalize-postman-query.js [path-to-collection-json]
 *
 * Default path:
 *   postman/Food-App-API.postman_collection.json
 */

const { readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

const rootDir = join(__dirname, "..");
const targetPath =
  process.argv[2] ??
  join(rootDir, "postman", "Food-App-API.postman_collection.json");

function getRawUrl(url) {
  if (typeof url === "string") return url;
  if (url && typeof url === "object" && typeof url.raw === "string") return url.raw;
  return null;
}

function splitRawUrl(raw) {
  const hashIdx = raw.indexOf("#");
  const cleanRaw = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
  const qIdx = cleanRaw.indexOf("?");
  if (qIdx < 0) return { base: cleanRaw, queryString: "" };
  return {
    base: cleanRaw.slice(0, qIdx),
    queryString: cleanRaw.slice(qIdx + 1),
  };
}

function parseQueryString(queryString) {
  if (!queryString) return [];
  return queryString
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const eqIdx = pair.indexOf("=");
      if (eqIdx < 0) {
        return {
          key: decodeURIComponent(pair),
          value: "",
        };
      }
      const key = pair.slice(0, eqIdx);
      const value = pair.slice(eqIdx + 1);
      return {
        key: decodeURIComponent(key),
        value: decodeURIComponent(value),
      };
    })
    .filter((q) => q.key.trim().length > 0);
}

function mergeQuery(existing, fromRaw) {
  const merged = [];
  const seen = new Set();

  for (const item of existing) {
    if (!item || typeof item !== "object") continue;
    const key = String(item.key ?? "");
    if (!key) continue;
    merged.push(item);
    seen.add(key);
  }

  for (const item of fromRaw) {
    if (seen.has(item.key)) continue;
    merged.push(item);
    seen.add(item.key);
  }

  return merged;
}

function normalizeRequestUrl(request) {
  if (!request || !request.url) return false;

  const raw = getRawUrl(request.url);
  if (!raw) return false;

  const { queryString } = splitRawUrl(raw);
  const parsed = parseQueryString(queryString);
  if (parsed.length === 0) return false;

  if (typeof request.url === "string") {
    request.url = {
      raw,
      query: parsed,
    };
    return true;
  }

  const existing = Array.isArray(request.url.query) ? request.url.query : [];
  const merged = mergeQuery(existing, parsed);
  if (!Array.isArray(request.url.query) || merged.length !== existing.length) {
    request.url.query = merged;
    return true;
  }

  return false;
}

function walkItems(items, state) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (item.request) {
      state.totalRequests += 1;
      if (normalizeRequestUrl(item.request)) {
        state.updatedRequests += 1;
      }
    }
    if (Array.isArray(item.item)) {
      walkItems(item.item, state);
    }
  }
}

function run() {
  const content = readFileSync(targetPath, "utf8");
  const collection = JSON.parse(content);
  const state = { totalRequests: 0, updatedRequests: 0 };

  walkItems(collection.item, state);

  writeFileSync(targetPath, `${JSON.stringify(collection, null, 2)}\n`, "utf8");

  console.log(
    `Processed ${state.totalRequests} requests; normalized ${state.updatedRequests} request URLs with query params.`
  );
  console.log(`Updated: ${targetPath}`);
}

run();
