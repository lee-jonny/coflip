const { app, clipboard, dialog, Menu, nativeImage, shell, systemPreferences, Tray } = require("electron");
const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const cliInstaller = require("./cli-installer.cjs");
const { createUsageIcon } = require("./usage-icon.cjs");

let tray = null;
let core = null;
let codexUsage = null;
let refreshTimer = null;
let terminalLaunchWatcher = null;

app.setName("CoFlip");
if (process.platform === "darwin") {
  // AppKit reads these app-local defaults when it creates the status item.
  systemPreferences.registerDefaults({ NSStatusItemSpacing: 4, NSStatusItemSelectionPadding: 4 });
}
if (typeof app.setActivationPolicy === "function") {
  app.setActivationPolicy("accessory");
}

app.whenReady().then(async () => {
  if (app.dock && typeof app.dock.hide === "function") {
    app.dock.hide();
  }

  if (app.isPackaged) {
    try {
      cliInstaller.refreshLegacyLauncher(process.execPath, process.resourcesPath);
    } catch (error) {
      console.error("Could not refresh the cxs launcher:", error);
    }
  }

  core = await import("../src/core.js");
  codexUsage = await import("../src/codex-usage.js");
  tray = new Tray(createUsageIcon(nativeImage, []));
  rebuildMenu();
  try {
    terminalLaunchWatcher = codexUsage.watchTerminalLaunches(core.getPaths(), () => {
      try {
        rebuildMenu();
      } catch (error) {
        console.error("Could not update the tray after a terminal launch:", error);
      }
    });
    terminalLaunchWatcher.on("error", (error) => {
      console.error("Could not watch terminal launches:", error);
    });
  } catch (error) {
    console.error("Could not watch terminal launches:", error);
  }
  refreshAllCodexUsage();
  refreshTimer = setInterval(refreshAllCodexUsage, codexUsage.REFRESH_INTERVAL_MS);
  console.log("CoFlip tray is running.");
  console.log("Tray bounds:", JSON.stringify(tray.getBounds()));
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("before-quit", () => {
  terminalLaunchWatcher?.close();
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});

function rebuildMenu() {
  const rows = codexUsage.getUsageOverview(core.listContexts(), core.getPaths(), getRecentProfile());
  const profiles = rows.map(({ profile }) => profile);
  const usage = rows.filter(({ percent }) => percent !== null).slice(0, 2);
  tray.setImage(createUsageIcon(nativeImage, usage));
  tray.setToolTip([
    "CoFlip · 기본 한도 잔여량",
    ...usage.map(({ profile, percent }) => `${profileLabel(profile)} · ${Math.round(percent)}%`),
  ].join("\n"));

  const resume = (profile) => openTerminal(profile, ["resume", "--all"]);
  const openApp = (profile) => openAppForProfile(profile, getCodexAppName());
  const startChat = (profile) => pickFolderAndRun(profile, []);

  const items = [
    {
      label: "대화 이어서",
      submenu: [
        ...profileMenuItems(profiles, resume),
        { type: "separator" },
        {
          label: "폴더에서 이어서…",
          click: () => withChosenProfile(profiles, (profile) => pickFolderAndRun(profile, ["resume"])).catch(showError),
        },
        {
          label: "다른 Mac에서 이어서…",
          click: () => continueElsewhere(profiles).catch(showError),
        },
      ],
    },
    profiles.length === 1
      ? { label: "Codex 앱 열기", click: () => openApp(profiles[0]).catch(showError) }
      : { label: "Codex 앱 열기", submenu: profileMenuItems(profiles, openApp) },
    profiles.length === 1
      ? { label: "새 대화…", click: () => startChat(profiles[0]).catch(showError) }
      : { label: "새 대화", submenu: profileMenuItems(profiles, startChat, "…") },
    { type: "separator" },
    {
      label: "사용량",
      submenu: [
        ...rows.map(({ profile, state, percent }) => ({
          label: `${profileLabel(profile)} · ${usageSummary(state, percent)}`,
          click: () => showUsage(profile, state).catch(showError),
        })),
        { type: "separator" },
        { label: "새로 고침", click: refreshAllCodexUsage },
      ],
    },
    { label: "설정", submenu: settingsMenu(profiles) },
    { label: "종료", click: () => app.quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function profileLabel(profile) {
  if (profile.name !== core.EXISTING) return profile.name;
  const defaultHome = path.resolve(process.env.HOME || os.homedir(), ".codex");
  return profile.codexHome === defaultHome ? "기본 Codex" : "환경 지정 프로필";
}

function profileMenuItems(profiles, action, suffix = "") {
  return profiles.map((profile) => ({
    label: profileLabel(profile) + suffix,
    click: () => Promise.resolve().then(() => action(profile)).catch(showError),
  }));
}

async function withChosenProfile(profiles, action) {
  if (profiles.length === 1) return action(profiles[0]);

  const choices = new Map(profiles.map((profile, index) => [
    `${index + 1}. ${profileLabel(profile)}`,
    profile,
  ]));
  const labels = Array.from(choices.keys(), appleScriptQuote);
  const picked = await runAppleScriptPrompt([
    `set selected to choose from list {${labels.join(", ")}} with prompt "사용할 프로필을 선택하세요."`,
    'if selected is false then error number -128',
    "return item 1 of selected",
  ].join("\n"));
  const profile = choices.get(picked);
  if (profile) return action(profile);
}

function usageSummary(state, percent) {
  if (state.status === "needs-login") return "로그인 필요";
  if (state.status === "last-known") return "이전 측정값";
  if (state.status === "unknown") return "확인 전";
  if (percent !== null) return `잔여 ${Math.round(percent)}%`;
  return state.status === "ok" ? "상세 보기" : "조회 불가";
}

async function showUsage(profile, state) {
  const buttons = state.status === "needs-login" ? ["닫기", "브라우저 로그인…"] : ["닫기"];
  const { response } = await dialog.showMessageBox({
    title: "CoFlip",
    message: `${profileLabel(profile)} · 사용량`,
    detail: codexUsage.formatUsageDialogDetail(state),
    buttons,
    cancelId: 0,
  });
  if (response === 1) runCodexLogin(profile);
}

function settingsMenu(profiles) {
  const settings = [
    { label: "새 프로필…", click: createProfileFromPrompt },
    {
      label: "프로필 관리…",
      click: () => withChosenProfile(profiles, manageProfile).catch(showError),
    },
    {
      label: "프로필 폴더 열기",
      click: () => shell.openPath(core.getPaths().profilesDir).then((error) => {
        if (error) showError(error);
      }, showError),
    },
  ];
  if (app.isPackaged) {
    const installed = cliInstaller.isCodexShiftLauncher(cliInstaller.getCliInstallPath());
    settings.push(
      { type: "separator" },
      {
        label: installed ? "cxs 다시 설치…" : "cxs 설치…",
        click: () => installCxsCli().catch(showError),
      },
    );
    if (installed) {
      settings.push({ label: "cxs 제거…", click: () => uninstallCxsCli().catch(showError) });
    }
    if (process.platform === "darwin") {
      settings.push({
        label: "Mac 로그인 시 실행",
        type: "checkbox",
        checked: isLaunchAtLoginEnabled(),
        click: toggleLaunchAtLogin,
      });
    }
  }
  settings.push(
    { type: "separator" },
    { label: `CoFlip v${app.getVersion()}`, enabled: false },
  );
  return settings;
}

async function manageProfile(profile) {
  const actions = [
    { label: "브라우저 로그인…", run: () => runCodexLogin(profile) },
    { label: "터미널 로그인", run: () => openTerminal(profile, ["login"]) },
    { label: "도구 설정…", run: () => toolSetup(profile) },
  ];
  if (core.canDeleteProfile(profile)) {
    actions.push({ label: "프로필 삭제…", run: () => deleteProfileFromPrompt(profile) });
  }
  const { response } = await dialog.showMessageBox({
    title: "CoFlip",
    message: profileLabel(profile),
    detail: profile.codexHome,
    buttons: ["닫기", ...actions.map(({ label }) => label)],
    cancelId: 0,
  });
  await actions[response - 1]?.run();
}

function isLaunchAtLoginEnabled() {
  if (process.platform !== "darwin" || !app.isPackaged) {
    return false;
  }

  return app.getLoginItemSettings().openAtLogin;
}

function toggleLaunchAtLogin() {
  try {
    app.setLoginItemSettings({
      openAtLogin: !isLaunchAtLoginEnabled(),
    });
    rebuildMenu();
  } catch (error) {
    showError(error);
  }
}

async function installCxsCli() {
  const launcherPath = cliInstaller.getCliInstallPath();
  const alreadyInstalled = cliInstaller.isCodexShiftLauncher(launcherPath);
  const { response } = await dialog.showMessageBox({
    type: "question",
    buttons: ["Cancel", alreadyInstalled ? "Reinstall" : "Install"],
    defaultId: 1,
    cancelId: 0,
    title: "CoFlip",
    message: alreadyInstalled ? "Reinstall the cxs command?" : "Install the cxs command?",
    detail: [
      `CoFlip will create ${launcherPath}.`,
      "The command uses this app's bundled runtime, so a separate Node.js installation is not required.",
      "If you move CoFlip later, run this installer again.",
    ].join("\n\n"),
  });

  if (response !== 1) {
    return;
  }

  try {
    cliInstaller.installCliLauncher({
      executablePath: process.execPath,
      resourcesPath: process.resourcesPath,
    });
    rebuildMenu();
    showCliInstallSuccess(launcherPath);
  } catch (error) {
    showError(error);
  }
}

async function uninstallCxsCli() {
  const launcherPath = cliInstaller.getCliInstallPath();
  const { response } = await dialog.showMessageBox({
    type: "warning",
    buttons: ["Cancel", "Uninstall"],
    defaultId: 0,
    cancelId: 0,
    title: "CoFlip",
    message: "Remove the cxs command?",
    detail: `This removes ${launcherPath}. The CoFlip app and your profiles will stay unchanged.`,
  });

  if (response !== 1) {
    return;
  }

  try {
    cliInstaller.uninstallCliLauncher();
    rebuildMenu();
    await dialog.showMessageBox({
      type: "info",
      buttons: ["OK"],
      title: "CoFlip",
      message: "The cxs command was removed.",
    });
  } catch (error) {
    showError(error);
  }
}

async function showCliInstallSuccess(launcherPath) {
  const needsPathSetup = !cliInstaller.isCliInstallDirectoryOnPath(process.env.PATH);
  const { response } = await dialog.showMessageBox({
    type: "info",
    buttons: needsPathSetup
      ? ["Not Now", "Add to ~/.zshrc", "Copy PATH Command"]
      : ["OK"],
    defaultId: 0,
    title: "CoFlip",
    message: "The cxs command is installed.",
    detail: needsPathSetup
      ? [
          `Installed at ${launcherPath}.`,
          "Add ~/bin to ~/.zshrc automatically, or copy the command to set it up yourself.",
        ].join("\n\n")
      : `Installed at ${launcherPath}. Open a new Terminal window, then run cxs help.`,
  });

  if (needsPathSetup && response === 1) {
    try {
      cliInstaller.installZshPathSetup();
      await dialog.showMessageBox({
        type: "info",
        buttons: ["OK"],
        title: "CoFlip",
        message: "~/bin was added to ~/.zshrc.",
        detail: "Open a new Terminal window, then run cxs help.",
      });
    } catch (error) {
      showError(error);
    }
  }

  if (needsPathSetup && response === 2) {
    clipboard.writeText('export PATH="$HOME/bin:$PATH"');
  }
}

async function refreshAllCodexUsage() {
  try {
    const paths = core.getPaths();
    await codexUsage.refreshContexts(core.listContexts(), getRecentProfile(), paths);
    rebuildMenu();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }
}

async function refreshCodexUsage(profile) {
  try {
    await codexUsage.refreshUsageState(profile, core.getPaths());
    rebuildMenu();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }
}

async function createProfileFromPrompt() {
  try {
    const name = await promptForProfileName();
    if (!name) {
      return;
    }
    createProfile(name, name);
  } catch (error) {
    showError(error);
  }
}

function createProfile(name, label) {
  try {
    core.ensureProfile(name, { label });
    rebuildMenu();
    refreshAllCodexUsage();
  } catch (error) {
    showError(error);
  }
}

async function deleteProfileFromPrompt(profile) {
  const { response } = await dialog.showMessageBox({
    type: "warning",
    buttons: ["Cancel", "Delete"],
    defaultId: 0,
    cancelId: 0,
    title: "CoFlip",
    message: `Delete profile "${profile.name}"?`,
    detail: [
      "This removes the profile's CODEX_HOME folder and local Codex state for that profile.",
      profile.codexHome,
    ].join("\n\n"),
  });

  if (response !== 1) {
    return;
  }

  try {
    core.deleteProfile(profile.name);
    codexUsage.deleteUsageState(profile.name, core.getPaths());
    rebuildMenu();
    refreshAllCodexUsage();
  } catch (error) {
    showError(error);
  }
}

function promptForProfileName() {
  const prompt = [
    "프로필 이름을 입력하세요.",
    "",
    "예: company, personal, client-a",
    "사용 가능: 영문, 숫자, 하이픈(-), 언더스코어(_)",
  ].join("\n");

  return promptText(prompt, "Create");
}

function promptText(prompt, action) {
  const dialogScript = [
    `set profileName to text returned of (display dialog ${appleScriptQuote(prompt)}`,
    `default answer ${appleScriptQuote("")}`,
    `buttons {"Cancel", ${appleScriptQuote(action)}}`,
    `default button ${appleScriptQuote(action)}`,
    'cancel button "Cancel")',
  ].join(" ");
  return runAppleScriptPrompt([dialogScript, "return profileName"].join("\n"));
}

function runAppleScriptPrompt(script) {
  return new Promise((resolve, reject) => {
    const child = spawn("osascript", ["-e", script], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      if (stderr.includes("(-128)")) {
        resolve(null);
        return;
      }

      reject(new Error(stderr.trim() || "프로필 이름 입력을 열 수 없습니다."));
    });
  });
}

function runCodexLogin(profile) {
  codexUsage.recordCodexLaunch(profile, core.getPaths());
  refreshCodexUsage(profile);

  const command = core.findCodexCommand(process.env);
  if (!command) {
    showError(core.codexCommandNotFoundError());
    return;
  }

  const child = spawn(command, ["login"], {
    env: core.getCodexEnv(profile, process.env, command),
    // Codex CLI forwards its stdio to the native login process.  Giving it an
    // ignored stdin closes that stream immediately, which the CLI can treat as
    // a cancelled login before the browser callback arrives.  Keep a pipe open
    // for the lifetime of the child instead.
    stdio: ["pipe", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.on("error", showError);
  child.on("close", (code) => {
    refreshCodexUsage(profile);
    if (code !== 0) {
      showError(
        new Error(
          stderr.trim() ||
            "Codex login을 브라우저에서 시작할 수 없습니다. 설정의 프로필 관리에서 터미널 로그인을 시도해 주세요.",
        ),
      );
    }
  });
}

async function pickFolderAndRun(profile, args) {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (!canceled) openTerminal(profile, args, filePaths[0]);
}

function openTerminal(profile, args, folder = os.homedir()) {
  const command = core.findCodexCommand();
  if (!command) return showError(core.codexCommandNotFoundError());
  markProfileOpened(profile);
  const useNativeHome = profile.name === core.EXISTING && !process.env.CODEX_HOME;
  runInTerminal([
    `cd ${shellQuote(folder)}`,
    `export PATH=${shellQuote(path.dirname(command))}:$PATH`,
    useNativeHome ? "unset CODEX_HOME" : `export CODEX_HOME=${shellQuote(profile.codexHome)}`,
    [command, ...args].map(shellQuote).join(" "),
  ].join(" && "));
}

async function continueElsewhere(profiles) {
  const { response } = await dialog.showMessageBox({
    message: "어느 Mac에 대화가 있나요?",
    detail: "다른 Mac에 저장된 대화는 SSH로 접속해 그곳에서 엽니다. 이 Mac의 대화를 옮기려면 여기서 대화를 연 뒤 /app에서 Hand off를 선택하세요. 두 기기에 같은 저장소의 프로젝트가 등록되어 있어야 합니다.",
    buttons: ["다른 Mac에 SSH 연결…", "이 Mac에서 대화 열기…", "연결 가이드", "취소"],
    cancelId: 3,
  });
  if (response === 0) {
    const host = await promptText("SSH host alias or user@hostname", "Connect");
    if (!host) return;
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$/.test(host)) throw new Error("Enter a host alias or user@hostname.");
    runInTerminal(`ssh ${shellQuote(host)}`);
  }
  if (response === 1) {
    await withChosenProfile(profiles, (profile) => openTerminal(profile, ["resume", "--all"]));
  }
  if (response === 2) await shell.openExternal("https://learn.chatgpt.com/docs/remote-connections");
}

async function toolSetup(profile) {
  const { inspectTools } = await import("../src/tools.js");
  let tools;
  try {
    tools = await inspectTools(profile);
  } catch (error) {
    tools = { version: error.message, canList: false, canAdd: false, cliUnavailable: true };
  }
  const actions = [
    ...(tools.canList ? [["List plugins", ["plugin", "list"]]] : []),
    ...(tools.canAdd ? [["Install plugin…", ["plugin", "add"]]] : []),
    ...(tools.cliUnavailable ? [] : [["Login status", ["login", "status"]]]),
    ["Open desktop for Computer Use", null],
    ["Computer Use guide", null],
    ["Close", null],
  ];
  const { response } = await dialog.showMessageBox({
    message: tools.version, detail: `${os.hostname()} · ${profile.codexHome}\nComputer Use: desktop Settings → Computer use → Any App. Approve Screen Recording and Accessibility on this Mac.`,
    buttons: actions.map(([label]) => label), cancelId: actions.length - 1,
  });
  const [label, args] = actions[response];
  if (label === "Open desktop for Computer Use") return openAppForProfile(profile, getCodexAppName());
  if (label === "Computer Use guide") return shell.openExternal("https://learn.chatgpt.com/docs/computer-use");
  if (!args) return;
  if (label === "Install plugin…") {
    const id = await promptText("Plugin ID from the marketplace (plugin@marketplace)", "Install");
    if (!id) return;
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*@[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(id)) throw new Error("Use plugin@marketplace.");
    args.push(id);
  }
  openTerminal(profile, args);
}

async function openAppForProfile(profile, appName) {
  refreshCodexUsage(profile);

  if (await isAppRunning(appName)) {
    const { response } = await dialog.showMessageBox({
      type: "question",
      buttons: ["Cancel", "Activate Existing", "Quit & Open"],
      defaultId: 1,
      cancelId: 0,
      title: "CoFlip",
      message: `${appName} is already running.`,
      detail: [
        `Selected on ${os.hostname()}: ${profile.codexHome}. To use this home, ${appName} needs to quit and launch again.`,
        "Activate Existing uses the running app. Its host and home may differ from this selection.",
      ].join("\n\n"),
    });

    if (response === 0) {
      return;
    }

    if (response === 1) {
      openExistingApp(appName);
      return;
    }

    if (!(await quitApp(appName))) {
      return;
    }
  }

  markProfileOpened(profile);
  launchAppWithProfile(profile, appName);
}

function markProfileOpened(profile) {
  try {
    core.setCurrentProfile(profile.name);
    codexUsage.recordCodexLaunch(profile, core.getPaths());
    rebuildMenu();
  } catch (error) {
    showError(error);
  }
}

function openExistingApp(appName) {
  const child = spawn("open", ["-a", appName], {
    stdio: ["ignore", "ignore", "pipe"],
  });

  handleOpenProcess(child, appName);
}

function launchAppWithProfile(profile, appName) {
  const explicitHome = profile.name !== core.EXISTING || process.env.CODEX_HOME;
  const child = spawn("open", [
    ...(explicitHome ? ["--env", `CODEX_HOME=${profile.codexHome}`] : []),
    "-a",
    appName,
  ], {
    stdio: ["ignore", "ignore", "pipe"],
  });

  handleOpenProcess(child, appName);
}

function handleOpenProcess(child, appName) {
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.on("error", showError);
  child.on("close", (code) => {
    if (code !== 0) {
      showError(
        new Error(
          stderr.trim() ||
            `${appName} 앱을 열 수 없습니다. /Applications에 설치되어 있는지 확인하세요.`,
        ),
      );
    }
  });
}

function isAppRunning(appName) {
  const script = `application ${appleScriptQuote(appName)} is running`;

  return new Promise((resolve) => {
    const child = spawn("osascript", ["-e", script], {
      stdio: ["ignore", "pipe", "ignore"],
    });

    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => {
      resolve(code === 0 && stdout.trim() === "true");
    });
  });
}

function quitApp(appName) {
  const script = [
    `tell application ${appleScriptQuote(appName)}`,
    "quit",
    "end tell",
  ].join("\n");

  return new Promise((resolve, reject) => {
    const child = spawn("osascript", ["-e", script], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${appName} 앱을 종료할 수 없습니다.`));
        return;
      }

      waitForAppToExit(appName).then(resolve, reject);
    });
  }).catch((error) => {
    showError(error);
    return false;
  });
}

function waitForAppToExit(appName) {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const poll = () => {
      isAppRunning(appName).then((running) => {
        if (!running) {
          resolve(true);
          return;
        }

        if (Date.now() - startedAt > 5000) {
          showError(new Error(`${appName} 앱이 아직 종료되지 않았습니다.`));
          resolve(false);
          return;
        }

        setTimeout(poll, 150);
      });
    };

    poll();
  });
}

function getCodexAppName() {
  return process.env.CXS_CODEX_APP_NAME || process.env.CODEX_SWITCHER_CODEX_APP_NAME || "Codex";
}

function runInTerminal(command) {
  const script = [
    'tell application "Terminal"',
    "activate",
    `do script ${appleScriptQuote(command)}`,
    "end tell",
  ].join("\n");

  const child = spawn("osascript", ["-e", script], {
    detached: true,
    stdio: "ignore",
  });

  child.on("error", showError);
  child.unref();
}

function showError(error) {
  dialog.showErrorBox(
    "CoFlip",
    error instanceof Error ? error.message : String(error),
  );
}

function getRecentProfile() {
  try {
    return core.getCurrentProfile();
  } catch {
    return null;
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function appleScriptQuote(value) {
  const lines = String(value)
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => `"${line.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`);

  return lines.join(" & linefeed & ");
}
