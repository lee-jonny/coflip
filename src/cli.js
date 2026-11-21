import {
  buildShellExport,
  deleteProfile,
  ensureProfile,
  getCurrentProfile,
  getProfileHome,
  getPaths,
  listContexts,
  EXISTING,
  readProfile,
  runCodex,
  setCurrentProfile,
} from "./core.js";
import { deleteTerminalLaunch, recordTerminalLaunch } from "./codex-usage.js";
import { inspectTools } from "./tools.js";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import readline from "node:readline";

export async function main(argv, env = process.env) {
  const [command, ...rest] = argv;

  switch (command) {
    case undefined:
    case "-h":
    case "--help":
    case "help":
      printHelp();
      return;
    case "add":
      addProfile(rest, env);
      return;
    case "update":
      updateWithHomebrew(env);
      return;
    case "delete":
    case "remove":
    case "rm":
      deleteProfileCommand(rest, env);
      return;
    case "list":
      list(env);
      return;
    case "use":
      useProfile(rest, env);
      return;
    case "current":
      current(env);
      return;
    case "path":
      printPath(rest, env);
      return;
    case "env":
      printEnv(rest, env);
      return;
    case "login":
      await login(rest, env);
      return;
    case "tools": {
      const name = rest[0] || await promptForProfile(env);
      const profile = readProfile(name, env);
      const tools = await inspectTools(profile, env);
      console.log(`${tools.version} · ${os.hostname()} · ${profile.codexHome}`);
      console.log(`인증 확인: cxs run ${name} -- login status`);
      console.log("Computer Use: 데스크톱 Settings → Computer use → Any App");
      if (tools.canAdd) console.log(`설치: cxs run ${name} -- plugin add PLUGIN@MARKETPLACE`);
      if (tools.canList) process.exitCode = await runCodex(profile, ["plugin", "list"], env);
      else console.log("이 CLI에서는 플러그인 목록 조회를 지원하지 않습니다.");
      return;
    }
    case "run":
      await run(rest, env);
      return;
    case "resume":
    case "exec":
      await run(rest, env, [command]);
      return;
    default:
      throw new Error(`알 수 없는 명령입니다: ${command}\n\n${helpText()}`);
  }
}

function updateWithHomebrew(env) {
  const runBrew = (args, stdio = "inherit") => {
    const result = spawnSync("brew", args, { stdio, env, encoding: "utf8" });
    if (result.error?.code === "ENOENT") throw new Error("Homebrew가 필요합니다. README의 설치 절차를 확인하세요.");
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status ?? 1;
    return result;
  };

  if (runBrew(["update"]).status !== 0) return;
  const installed = runBrew(["list", "--cask", "--full-name"], ["ignore", "pipe", "inherit"]);
  if (installed.status !== 0) return;

  const supportedCasks = new Set([
    "lee-jonny/coflip/coflip",
    "lee-jonny/coflip/codex-shift",
    "willofi/codex-shift/coflip",
    "willofi/codex-shift/codex-shift",
  ]);
  const cask = installed.stdout.split(/\r?\n/).find(name => supportedCasks.has(name.trim()))?.trim();
  if (!cask) throw new Error("Homebrew에서 설치한 CoFlip을 찾을 수 없습니다. README의 설치 절차를 확인하세요.");
  runBrew(["upgrade", "--cask", cask]);
}

function addProfile(args, env) {
  const { profileName, options } = parseProfileAndOptions(args);
  const profile = ensureProfile(profileName, options, env);
  console.log(`프로필을 준비했습니다: ${profile.name}`);
  console.log(`CODEX_HOME=${profile.codexHome}`);
}

function list(env) {
  const profiles = listContexts(env);
  const current = getCurrentProfile(env);

  console.log(os.hostname());
  for (const profile of profiles) {
    const marker = current?.name === profile.name && current.codexHome === profile.codexHome ? "*" : " ";
    console.log(`${marker} ${profile.name}\t${profile.codexHome}`);
  }
}

function useProfile(args, env) {
  const profileName = requireProfileName(args);
  const profile = setCurrentProfile(profileName, env);
  console.log(`현재 프로필: ${profile.name}`);
  console.log(`CODEX_HOME=${profile.codexHome}`);
}

function deleteProfileCommand(args, env) {
  const profileName = requireProfileName(args);
  const profile = deleteProfile(profileName, env);
  deleteTerminalLaunch(profile, getPaths(env));
  console.log(`프로필을 삭제했습니다: ${profile.name}`);
  console.log(`삭제된 CODEX_HOME=${profile.codexHome}`);
}

function current(env) {
  const profile = getCurrentProfile(env);
  if (!profile) {
    console.log("현재 선택된 프로필이 없습니다.");
    return;
  }

  console.log(`${profile.name}\t${profile.codexHome}`);
}

function printPath(args, env) {
  const profileName = requireProfileName(args);
  console.log(profileName === EXISTING ? readProfile(profileName, env).codexHome : getProfileHome(profileName, env));
}

function printEnv(args, env) {
  const profileName = requireProfileName(args);
  const profile = readProfile(profileName, env);
  console.log(buildShellExport(profile, env));
}

async function login(args, env) {
  const profileName = requireProfileName(args);
  const exists = profileName === EXISTING || fs.existsSync(getProfileHome(profileName, env));
  const profile = exists ? readProfile(profileName, env) : ensureProfile(profileName, {}, env);
  const exitCode = await runCodex(profile, ["login"], env);
  process.exitCode = exitCode;
}

async function run(args, env, prefix = []) {
  const { profileName, commandArgs } = await parseRunArgs(args, env);
  const profile = readProfile(profileName, env);
  setCurrentProfile(profile.name, env);
  const exitCode = await runCodex(profile, [...prefix, ...commandArgs], env, () => {
    try {
      recordTerminalLaunch(profile, getPaths(env));
    } catch (error) {
      console.error(`최근 실행 기록을 저장하지 못했습니다. ${error.message}`);
    }
  });
  process.exitCode = exitCode;
}

function parseProfileAndOptions(args) {
  const profileName = requireProfileName(args);
  const options = {};

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--label") {
      options.label = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`알 수 없는 옵션입니다: ${arg}`);
  }

  return { profileName, options };
}

async function parseRunArgs(args, env) {
  if (args.length === 0 || args[0] === "--") {
    return {
      profileName: await promptForProfile(env),
      commandArgs: args[0] === "--" ? args.slice(1) : [],
    };
  }

  const profileName = requireProfileName(args);
  const separatorIndex = args.indexOf("--");
  const commandArgs =
    separatorIndex === -1 ? args.slice(1) : args.slice(separatorIndex + 1);
  return { profileName, commandArgs };
}

async function promptForProfile(env) {
  const profiles = listContexts(env);
  const current = getCurrentProfile(env);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "인터랙티브 선택을 사용할 수 없습니다. 예: `cxs run company`",
    );
  }

  return selectProfileWithKeyboard(profiles, current);
}

function selectProfileWithKeyboard(profiles, current) {
  const currentIndex = profiles.findIndex((profile) => profile.name === current?.name);
  let selectedIndex = currentIndex === -1 ? 0 : currentIndex;
  const stdin = process.stdin;
  const stdout = process.stdout;
  const previousRawMode = stdin.isRaw;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      stdin.off("keypress", onKeypress);
      if (typeof stdin.setRawMode === "function") {
        stdin.setRawMode(previousRawMode);
      }
      stdin.pause();
      stdout.write("\x1B[?25h");
    };

    const finish = (callback) => {
      cleanup();
      clearPicker(stdout);
      callback();
    };

    const onKeypress = (_input, key = {}) => {
      if (key.name === "up" || key.name === "k") {
        selectedIndex = (selectedIndex - 1 + profiles.length) % profiles.length;
        renderProfilePicker(stdout, profiles, selectedIndex);
        return;
      }

      if (key.name === "down" || key.name === "j") {
        selectedIndex = (selectedIndex + 1) % profiles.length;
        renderProfilePicker(stdout, profiles, selectedIndex);
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        const selectedProfile = profiles[selectedIndex];
        finish(() => resolve(selectedProfile.name));
        return;
      }

      if (key.name === "escape" || key.name === "q" || (key.ctrl && key.name === "c")) {
        finish(() => reject(new Error("프로필 선택이 취소되었습니다.")));
      }
    };

    readline.emitKeypressEvents(stdin);
    if (typeof stdin.setRawMode === "function") {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdout.write("\x1B[?25l");
    renderProfilePicker(stdout, profiles, selectedIndex);
    stdin.on("keypress", onKeypress);
  });
}

function renderProfilePicker(stdout, profiles, selectedIndex) {
  clearPicker(stdout);
  stdout.write(`사용할 Codex 홈을 선택하세요 · ${os.hostname()}\n\n`);

  profiles.forEach((profile, index) => {
    const selected = index === selectedIndex;
    const pointer = selected ? ">" : " ";
    const line = `${pointer} ${profile.name === EXISTING ? "기존 Codex 사용 (@existing)" : profile.name}  ${profile.codexHome}\n`;
    stdout.write(selected ? `\x1B[7m${line}\x1B[0m` : line);
  });

  stdout.write("\n↑/↓ 이동, Enter 선택, q 또는 Esc 취소\n");
}

function clearPicker(stdout) {
  stdout.write("\x1B[2J\x1B[H");
}

function requireProfileName(args) {
  const profileName = args[0];
  if (!profileName || profileName === "--") {
    throw new Error("프로필 이름을 입력하세요.");
  }
  return profileName;
}

function printHelp() {
  console.log(helpText());
}

function helpText() {
  return `cxs

사용법:
  cxs add <profile> [--label <name>]
  cxs update                      Homebrew로 설치한 CoFlip 업데이트
  cxs delete <profile>
  cxs list
  cxs use <profile>
  cxs current
  cxs path <profile>
  cxs env <profile>
  cxs login <profile>
  cxs run [profile] [-- <codex args...>]
  cxs tools [profile]
  cxs resume [profile] [-- --all | SESSION_ID]
  @existing 은 이 환경의 기존 Codex 홈을 사용합니다.
  cxs exec [profile] -- <prompt or codex exec args...>

환경변수:
  CXS_PROFILES_DIR  프로필별 CODEX_HOME 루트
  CXS_STATE_DIR     현재 선택 프로필 상태 저장 위치
`;
}
