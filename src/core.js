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

export const EXISTING = "@existing";

export function existingProfile(env = process.env) {
  return {
    name: EXISTING,
    label: "Existing Codex",
    codexHome: path.resolve(env.CODEX_HOME || path.join(env.HOME || os.homedir(), ".codex")),
  };
}

export function listContexts(env = process.env) {
  return [existingProfile(env), ...listProfiles(env)];
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
  if (fs.existsSync(profileHome) && !fs.existsSync(metadataFile)) {
    throw new Error("이미 존재하는 외부 홈입니다. CODEX_HOME을 지정하고 @existing을 선택하세요.");
  }
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

export function canDeleteProfile(profile, env = process.env) {
  if (profile.name === EXISTING || !fs.existsSync(getProfileMetadataFile(profile.codexHome))) return false;
  const target = fs.realpathSync(profile.codexHome);
  const protectedHomes = [existingProfile(env).codexHome, path.join(env.HOME || os.homedir(), ".codex")];
  return protectedHomes.every(home => {
    const actual = fs.existsSync(home) ? fs.realpathSync(home) : path.resolve(home);
    return actual !== target && !actual.startsWith(target + path.sep);
  });
}

export function deleteProfile(name, env = process.env) {
  const profile = readProfile(name, env);
  if (!canDeleteProfile(profile, env)) {
    throw new Error("기존 Codex 홈 또는 관리되지 않는 홈은 삭제할 수 없습니다.");
  }
  fs.rmSync(profile.codexHome, { recursive: true, force: true });
  clearCurrentProfileIfSelected(profile.name, env);
  return profile;
}

export function readProfile(name, env = process.env) {
  if (name === EXISTING) return existingProfile(env);
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
  if (state.name === EXISTING) {
    return { ...existingProfile(env), codexHome: state.codexHome };
  }
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

function usesDefaultHome(profile, env) {
  return profile.name === EXISTING && !env.CODEX_HOME &&
    profile.codexHome === path.resolve(env.HOME || os.homedir(), ".codex");
}

export function getCodexEnv(profile, env = process.env, codexCommand = null) {
  const commandDirectory = codexCommand ? path.dirname(codexCommand) : null;
  const pathEntries = [commandDirectory, env.PATH].filter(Boolean);

  return {
    ...env,
    ...(usesDefaultHome(profile, env) ? {} : { CODEX_HOME: profile.codexHome }),
    PATH: pathEntries.join(path.delimiter),
  };
}

export function findCodexCommand(env = process.env) {
  const explicitPath = env.CXS_CODEX_PATH;
  if (explicitPath) {
    return isExecutable(explicitPath) ? explicitPath : null;
  }

  const home = env.HOME || os.homedir();
  const directories = [
    ...String(env.PATH || "").split(path.delimiter),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(home, ".local", "bin"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".volta", "bin"),
    path.join(home, ".local", "share", "pnpm"),
  ];

  for (const directory of getNvmBinDirectories(home)) {
    directories.push(directory);
  }

  for (const directory of directories) {
    if (!directory) {
      continue;
    }

    const candidate = path.join(directory, "codex");
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function buildShellExport(profile, env = process.env) {
  if (usesDefaultHome(profile, env)) return "unset CODEX_HOME";
  return `export CODEX_HOME=${shellQuote(profile.codexHome)}`;
}

export function runCodex(profile, args, env = process.env, onSpawn) {
  return new Promise((resolve, reject) => {
    const command = findCodexCommand(env);
    if (!command) {
      reject(codexCommandNotFoundError());
      return;
    }

    const child = spawn(command, args, {
      env: getCodexEnv(profile, env, command),
      stdio: "inherit",
    });

    if (onSpawn) child.once("spawn", onSpawn);
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

export function codexCommandNotFoundError() {
  return new Error(
    "Codex CLI를 찾을 수 없습니다. Codex CLI를 설치하거나 CXS_CODEX_PATH에 codex 실행 파일의 전체 경로를 지정해 주세요.",
  );
}

function getNvmBinDirectories(home) {
  const versionsDirectory = path.join(home, ".nvm", "versions", "node");
  if (!fs.existsSync(versionsDirectory)) {
    return [];
  }

  return fs
    .readdirSync(versionsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
    .map((version) => path.join(versionsDirectory, version, "bin"));
}

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
