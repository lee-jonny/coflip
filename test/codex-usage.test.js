import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  deleteUsageState,
  formatUsageDetail,
  formatUsageDialogDetail,
  formatUsageMenuLabel,
  formatUsageTrayTitle,
  getUsageState,
  getUsageOverview,
  writeUsageStates,
  recordCodexLaunch,
  refreshUsageState,
  refreshContexts,
} from "../src/codex-usage.js";

import { ensureProfile, getPaths, getCodexEnv, getCurrentProfile, listContexts, setCurrentProfile } from "../src/core.js";

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

  const state = await refreshUsageState(profile, paths, { probe: async () => ({ status: "needs-login" }) });

  assert.equal(state.status, "needs-login");
  assert.equal(state.message, "Needs login");
});

test("marks a signed-in unsupported account unavailable", async () => {
  const paths = testPaths();
  const profile = testProfile(paths);
  const state = await refreshUsageState(profile, paths, { probe: async () => ({ status: "unavailable" }) });
  assert.equal(state.status, "unavailable");
  assert.equal(formatUsageTrayTitle(state), "");
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

test("keeps the original measurement time when showing cached usage", async () => {
  const paths = testPaths();
  const profile = testProfile(paths);
  const current = await refreshUsageState(profile, paths, {
    probe: async () => ({
      status: "ok",
      limits: { primary: { usedPercent: 25, windowDurationMins: 300 } },
    }),
  });
  const cached = await refreshUsageState(profile, paths, {
    probe: async () => { throw new Error("offline"); },
  });

  assert.ok(current.lastKnown.measuredAt);
  assert.equal(cached.lastKnown.measuredAt, current.lastKnown.measuredAt);
  const detail = formatUsageDialogDetail(cached);
  assert.match(detail, /이전 측정값/);
  assert.match(detail, /기본 한도 \(5시간\) · 잔여 75%/);
  assert.equal(detail.split("\n").at(-1), formatUsageDialogDetail(current).split("\n").at(-1));
  assert.doesNotMatch(
    formatUsageDialogDetail({ ...cached, lastKnown: { ...cached.lastKnown, measuredAt: undefined } }),
    /확인 시각/,
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

test("queries the selected home through stdio and preserves the latest successful limits", async () => {
  const paths = testPaths();
  const profile = testProfile(paths);
  const command = path.join(paths.root, "codex");
  fs.writeFileSync(command, `#!/usr/bin/env node
const readline = require("node:readline");
if (process.argv[2] !== "app-server" || process.env.CODEX_HOME !== ${JSON.stringify(profile.codexHome)}) process.exit(1);
const replies = {
  initialize: {},
  "account/read": { account: { type: "chatgpt" }, requiresOpenaiAuth: true },
  "account/rateLimits/read": { rateLimits: { primary: { usedPercent: 25, resetsAt: 1730947200 }, secondary: { usedPercent: 12 } } }
};
readline.createInterface({ input: process.stdin }).on("line", line => {
  const { id, method } = JSON.parse(line);
  if (id) console.log(JSON.stringify({ id, result: replies[method] }));
});
`, { mode: 0o755 });
  const { readAccountLimits } = await import("../src/app-server.js");
  const probe = p => readAccountLimits(p, { ...process.env, CXS_CODEX_PATH: command });
  const state = await refreshUsageState(profile, paths, { probe });
  assert.equal(state.status, "ok");
  assert.equal(formatUsageTrayTitle(state), "75%");
  assert.match(state.message, /75%.*88%/);
  const failed = await refreshUsageState(profile, paths, { probe: () => { throw new Error("Offline"); } });
  assert.equal(failed.status, "last-known");
  assert.match(failed.message, /Last known/);
  const loggedOut = await refreshUsageState(profile, paths, { probe: () => ({ status: "needs-login" }) });
  assert.equal(loggedOut.lastKnown, null);
});

test("an older probe cannot restore a deleted profile's cached usage", async () => {
  const paths = testPaths();
  const profile = testProfile(paths);
  let reply;
  const pending = refreshUsageState(profile, paths, {
    probe: () => new Promise(resolve => { reply = resolve; }),
  });
  deleteUsageState(profile.name, paths);
  reply({ status: "ok", limits: { primary: { usedPercent: 5 } } });
  await pending;
  assert.equal(getUsageState(profile, paths).checkedAt, null);
});

test("refreshes the CLI-selected external home even when the tray runs in the default environment", async () => {
  const paths = testPaths();
  const gui = { HOME: paths.root, CXS_STATE_DIR: paths.stateDir, CXS_PROFILES_DIR: path.join(paths.root, "profiles") };
  const terminal = { ...gui, CODEX_HOME: path.join(paths.root, "terminal-home") };
  const selected = setCurrentProfile("@existing", terminal);
  const contexts = listContexts(gui);
  fs.mkdirSync(contexts[0].codexHome);
  fs.mkdirSync(selected.codexHome);
  const queried = [];
  const probe = profile => {
    const home = getCodexEnv(profile, gui).CODEX_HOME;
    queried.push(home);
    return { status: "ok", limits: { primary: { usedPercent: home ? 27 : 9 } } };
  };
  await refreshContexts(contexts, getCurrentProfile(gui), paths, { probe });
  assert.deepEqual(queried, [undefined, terminal.CODEX_HOME]);
  assert.equal(formatUsageTrayTitle(getUsageState(selected, paths)), "73%");
  queried.length = 0;
  await refreshContexts(contexts, contexts[0], paths, { probe });
  assert.deepEqual(queried, [undefined]);
});

test("orders the tray by CLI and GUI launches without changing the usage cache", () => {
  const { root, stateDir } = testPaths();
  const codex = path.join(root, "codex");
  fs.writeFileSync(codex, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const env = {
    ...process.env,
    CXS_STATE_DIR: stateDir,
    CXS_PROFILES_DIR: path.join(root, "profiles"),
    CXS_CODEX_PATH: codex,
  };
  const paths = getPaths(env);
  const profiles = ["work", "personal", "third"].map(name => ensureProfile(name, {}, env));
  const states = Object.fromEntries(profiles.map((profile, index) => [profile.name, {
    status: "ok",
    lastLaunchAt: new Date(3000 - index * 1000).toISOString(),
    lastKnown: { type: "rate-limits", primary: { usedPercent: 25 } },
  }]));
  writeUsageStates(states, paths);

  const cli = fileURLToPath(new URL("../bin/cxs.js", import.meta.url));
  const result = spawnSync(process.execPath, [cli, "resume", "third", "--", "--all"], { env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(getUsageOverview(profiles, paths).map(({ profile }) => profile.name), ["third", "work", "personal"]);
  assert.equal(getUsageState(profiles[2], paths).lastLaunchAt, states.third.lastLaunchAt);
});

test("lists a shared Codex home once and keeps alias launch history", async () => {
  const paths = testPaths();
  const env = { CXS_STATE_DIR: paths.stateDir, CXS_PROFILES_DIR: path.join(paths.root, "profiles") };
  const work = ensureProfile("work", {}, env);
  const personal = ensureProfile("personal", {}, env);
  const alias = path.join(paths.root, "alias");
  fs.symlinkSync(work.codexHome, alias, "dir");
  const contexts = listContexts({ ...env, CODEX_HOME: alias });
  const existing = contexts[0];
  const limits = { type: "rate-limits", primary: { usedPercent: 25 } };
  writeUsageStates({
    [`@existing:${alias}`]: {
      status: "ok",
      checkedAt: "2026-11-21T08:00:00Z",
      lastLaunchAt: "2026-11-21T08:00:00Z",
      lastKnown: limits,
    },
    personal: {
      status: "ok",
      checkedAt: "2026-11-21T07:00:00Z",
      lastLaunchAt: "2026-11-21T07:00:00Z",
      lastKnown: limits,
    },
  }, paths);

  const summarize = (profiles, selected) => getUsageOverview(profiles, paths, selected)
    .map(({ profile, percent }) => [profile.name, percent]);
  assert.deepEqual(summarize(contexts), [["work", 75], ["personal", 75]]);
  assert.deepEqual(summarize([personal, work], existing), [["work", 75], ["personal", 75]]);

  const queried = [];
  await refreshContexts(contexts, existing, paths, {
    probe: async (profile) => {
      queried.push(profile.name);
      return { status: "ok", limits: { primary: { usedPercent: 25 } } };
    },
  });
  assert.deepEqual(queried, ["work", "personal"]);
});
