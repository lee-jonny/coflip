import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildShellExport,
  deleteProfile,
  ensureProfile,
  getCurrentProfile,
  getProfileHome,
  listProfiles,
  setCurrentProfile,
  validateProfileName,
} from "../src/core.js";

function testEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-shift-test-"));
  return {
    CXS_PROFILES_DIR: path.join(root, "profiles"),
    CXS_STATE_DIR: path.join(root, "state"),
  };
}

test("creates isolated profile homes", () => {
  const env = testEnv();
  const profile = ensureProfile("company", { label: "Company" }, env);

  assert.equal(profile.name, "company");
  assert.equal(profile.label, "Company");
  assert.equal(profile.codexHome, path.join(env.CXS_PROFILES_DIR, "company"));
  assert.equal(fs.existsSync(path.join(profile.codexHome, "config.toml")), true);
  assert.equal(
    fs.existsSync(path.join(profile.codexHome, "codex-shift.json")),
    true,
  );
});

test("lists profiles in stable order", () => {
  const env = testEnv();
  ensureProfile("personal", {}, env);
  ensureProfile("company", {}, env);

  assert.deepEqual(
    listProfiles(env).map((profile) => profile.name),
    ["company", "personal"],
  );
});

test("persists the current profile selection", () => {
  const env = testEnv();
  ensureProfile("company", {}, env);

  setCurrentProfile("company", env);

  assert.equal(getCurrentProfile(env).name, "company");
});

test("deletes profiles and clears current selection", () => {
  const env = testEnv();
  const profile = ensureProfile("company", {}, env);
  setCurrentProfile("company", env);

  const deletedProfile = deleteProfile("company", env);

  assert.equal(deletedProfile.name, "company");
  assert.equal(fs.existsSync(profile.codexHome), false);
  assert.equal(getCurrentProfile(env), null);
});

test("validates profile names", () => {
  assert.throws(() => validateProfileName("../company"), /영문/);
  assert.doesNotThrow(() => validateProfileName("company-dev_1"));
});

test("prints a shell-safe CODEX_HOME export", () => {
  const env = testEnv();
  const profile = ensureProfile("company", {}, env);

  assert.equal(buildShellExport(profile), `export CODEX_HOME='${profile.codexHome}'`);
});

test("computes profile home without creating it", () => {
  const env = testEnv();

  assert.equal(
    getProfileHome("personal", env),
    path.join(env.CXS_PROFILES_DIR, "personal"),
  );
});
