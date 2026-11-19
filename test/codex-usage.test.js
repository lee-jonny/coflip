import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  deleteUsageState,
  formatUsageDetail,
  formatUsageMenuLabel,
  formatUsageTrayTitle,
  getUsageState,
  recordCodexLaunch,
  refreshUsageState,
  refreshContexts,
} from "../src/codex-usage.js";

import { getCodexEnv, getCurrentProfile, listContexts, setCurrentProfile } from "../src/core.js";

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
