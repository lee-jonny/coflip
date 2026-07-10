import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const PROFILE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export function getPaths(env = process.env) {
  const home = os.homedir();
  const profilesDir =
    env.CXS_PROFILES_DIR || env.CODEX_SWITCHER_PROFILES_DIR || path.join(home, ".codex-profiles");
  const stateDir =
    env.CXS_STATE_DIR ||
    env.CODEX_SWITCHER_STATE_DIR ||
    path.join(home, "Library", "Application Support", "Codex Shift");

  return {
    profilesDir,
    stateDir,
    currentProfileFile: path.join(stateDir, "current-profile.json"),
  };
}

export function validateProfileName(name) {
  if (!name) {
    throw new Error("프로필 이름을 입력하세요.");
  }

  if (!PROFILE_NAME_PATTERN.test(name)) {
    throw new Error(
      "프로필 이름은 영문, 숫자, 하이픈(-), 언더스코어(_)만 사용할 수 있습니다.",
    );
  }
}

export function getProfileHome(name, env = process.env) {
  validateProfileName(name);
  return path.join(getPaths(env).profilesDir, name);
}

export function ensureProfile(name, options = {}, env = process.env) {
  validateProfileName(name);

  const profileHome = getProfileHome(name, env);
  const metadataFile = getProfileMetadataFile(profileHome);
  fs.mkdirSync(profileHome, { recursive: true });

  if (!fs.existsSync(metadataFile)) {
    const metadata = {
      name,
      label: options.label || name,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`);
  }

  const configFile = path.join(profileHome, "config.toml");
  if (!fs.existsSync(configFile)) {
    fs.writeFileSync(configFile, "# Codex config for this isolated profile.\n");
  }

  return readProfile(name, env);
}

export function updateProfile(name, updates, env = process.env) {
  const profileHome = getProfileHome(name, env);
  const metadataFile = getProfileMetadataFile(profileHome);

  if (!fs.existsSync(profileHome)) {
    throw new Error(`프로필을 찾을 수 없습니다: ${name}`);
  }

  const metadata = readProfileMetadata(name, env);
  const nextMetadata = {
    ...metadata,
    ...updates,
    name,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(metadataFile, `${JSON.stringify(nextMetadata, null, 2)}\n`);
  return readProfile(name, env);
}

export function deleteProfile(name, env = process.env) {
  const profile = readProfile(name, env);
  fs.rmSync(profile.codexHome, { recursive: true, force: true });
  clearCurrentProfileIfSelected(profile.name, env);
  return profile;
}

export function readProfile(name, env = process.env) {
  const profileHome = getProfileHome(name, env);

  if (!fs.existsSync(profileHome)) {
    throw new Error(`프로필을 찾을 수 없습니다: ${name}`);
  }

  const metadata = readProfileMetadata(name, env);

  return {
    name,
    label: metadata.label || name,
    createdAt: metadata.createdAt || null,
    codexHome: profileHome,
    monthlyBudgetUsd: metadata.monthlyBudgetUsd ?? null,
  };
}

function readProfileMetadata(name, env = process.env) {
  const profileHome = getProfileHome(name, env);
  const metadataFile = getProfileMetadataFile(profileHome);

  if (!fs.existsSync(metadataFile)) {
    return { name, label: name, createdAt: null };
  }

  return JSON.parse(fs.readFileSync(metadataFile, "utf8"));
}

function getProfileMetadataFile(profileHome) {
  const metadataFile = path.join(profileHome, "codex-shift.json");
  const legacyMetadataFile = path.join(profileHome, "codex-switcher.json");

  if (!fs.existsSync(metadataFile) && fs.existsSync(legacyMetadataFile)) {
    return legacyMetadataFile;
  }

  return metadataFile;
}

export function listProfiles(env = process.env) {
  const { profilesDir } = getPaths(env);
  if (!fs.existsSync(profilesDir)) {
    return [];
  }

  return fs
    .readdirSync(profilesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && PROFILE_NAME_PATTERN.test(entry.name))
    .map((entry) => readProfile(entry.name, env))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function setCurrentProfile(name, env = process.env) {
  const profile = readProfile(name, env);
  const { stateDir, currentProfileFile } = getPaths(env);
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    currentProfileFile,
    `${JSON.stringify(
      {
        name: profile.name,
        codexHome: profile.codexHome,
        selectedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  return profile;
}

export function getCurrentProfile(env = process.env) {
  const { currentProfileFile } = getPaths(env);
  if (!fs.existsSync(currentProfileFile)) {
    return null;
  }

  const state = JSON.parse(fs.readFileSync(currentProfileFile, "utf8"));
  return readProfile(state.name, env);
}

function clearCurrentProfileIfSelected(name, env = process.env) {
  const { currentProfileFile } = getPaths(env);
  if (!fs.existsSync(currentProfileFile)) {
    return;
  }

  const state = JSON.parse(fs.readFileSync(currentProfileFile, "utf8"));
  if (state.name === name) {
    fs.rmSync(currentProfileFile, { force: true });
  }
}

export function getCodexEnv(profile, env = process.env) {
  return {
    ...env,
    CODEX_HOME: profile.codexHome,
  };
}

export function buildShellExport(profile) {
  return `export CODEX_HOME=${shellQuote(profile.codexHome)}`;
}

export function runCodex(profile, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", args, {
      env: getCodexEnv(profile, env),
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`codex가 시그널로 종료되었습니다: ${signal}`));
        return;
      }
      resolve(code ?? 0);
    });
  });
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
