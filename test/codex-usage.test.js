import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  deleteUsageState,
  fetchCodexUsage,
  formatUsageDetail,
  formatUsageMenuLabel,
  formatUsageTrayTitle,
  getUsageState,
  parseCodexUsagePayload,
  recordCodexLaunch,
  refreshUsageState,
} from "../src/codex-usage.js";

function testPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-usage-test-"));
  return {
    root,
    stateDir: path.join(root, "state"),
  };
}

function testProfile(paths, name = "company") {
  const codexHome = path.join(paths.root, name);
  fs.mkdirSync(codexHome, { recursive: true });
  return { name, codexHome };
}

test("marks profile as needs login when auth is missing", async () => {
  const paths = testPaths();
  const profile = testProfile(paths);

  const state = await refreshUsageState(profile, paths);

  assert.equal(state.status, "needs-login");
  assert.equal(state.message, "Needs login");
});

test("keeps unknown when auth exists but no endpoint returns usage", async () => {
  const paths = testPaths();
  const profile = testProfile(paths);
  fs.writeFileSync(
    path.join(profile.codexHome, "auth.json"),
    JSON.stringify({ auth_mode: "chatgpt", tokens: { access_token: "token" } }),
  );

  const state = await refreshUsageState(profile, paths, {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    }),
  });

  assert.equal(state.status, "unknown");
  assert.equal(state.message, "Unknown");
  assert.match(state.reason, /no usage fields/);
});

test("records launches and formats menu label", () => {
  const paths = testPaths();
  const profile = testProfile(paths);

  recordCodexLaunch(profile, paths);
  const state = getUsageState(profile, paths);

  assert.equal(state.launchCountToday, 1);
  assert.match(formatUsageMenuLabel(profile, state), /^company ·/);
});

test("deletes cached usage state for a profile", () => {
  const paths = testPaths();
  const profile = testProfile(paths);

  recordCodexLaunch(profile, paths);
  deleteUsageState(profile.name, paths);

  assert.equal(getUsageState(profile, paths).launchCountToday, 0);
});

test("formats usage detail as a short submenu hint", () => {
  assert.match(
    formatUsageDetail({
      message: "97% / 100%",
      checkedAt: "2026-07-10T05:23:00.000Z",
      lastLaunchAt: "2026-07-10T05:08:00.000Z",
      launchCountToday: 1,
      reason: "ignored in the compact menu",
    }),
    /^Updated /,
  );
});

test("formats tray title from primary remaining usage", () => {
  assert.equal(
    formatUsageTrayTitle({
      lastKnown: {
        type: "rate-limits",
        primary: { remainingPercent: 42.2 },
      },
    }),
    "42%",
  );

  assert.equal(
    formatUsageTrayTitle({
      lastKnown: {
        type: "rate-limits",
        primary: { usedPercent: 25 },
      },
    }),
    "75%",
  );

  assert.equal(formatUsageTrayTitle({ message: "Unknown" }), "");
});

test("parses rate limit usage payloads", () => {
  const parsed = parseCodexUsagePayload({
    rateLimits: [
      {
        limitName: "five-hour-limit",
        remainingPercent: 42.2,
        resetsAt: "2026-07-10T10:00:00Z",
        primary: true,
      },
      {
        limitName: "weekly-limit",
        usedPercent: 10,
        secondary: true,
      },
    ],
  });

  assert.equal(parsed.type, "rate-limits");
  assert.equal(parsed.primary.remainingPercent, 42.2);
  assert.equal(parsed.secondary.usedPercent, 10);
  assert.match(parsed.remainingText, /42%/);
  assert.match(parsed.remainingText, /90%/);
});

test("fetches codex usage from the first endpoint with parseable values", async () => {
  const calls = [];
  const parsed = await fetchCodexUsage(
    { tokens: { access_token: "token" } },
    {
      baseUrl: "https://example.test",
      fetchImpl: async (url) => {
        calls.push(url);
        return {
          ok: true,
          json: async () =>
            url.endsWith("/api/codex/profiles/me")
              ? { noUsage: true }
              : { rateLimits: [{ limitName: "weekly-limit", remainingPercent: 55 }] },
        };
      },
    },
  );

  assert.equal(calls.length, 2);
  assert.equal(parsed.primary.remainingPercent, 55);
  assert.equal(parsed.source, "/api/codex/usage");
});
