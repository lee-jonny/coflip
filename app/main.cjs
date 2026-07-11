const { app, clipboard, dialog, Menu, nativeImage, shell, Tray } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const cliInstaller = require("./cli-installer.cjs");

let tray = null;
let core = null;
let codexUsage = null;
let refreshTimer = null;

app.setName("Codex Shift");
if (typeof app.setActivationPolicy === "function") {
  app.setActivationPolicy("accessory");
}

app.whenReady().then(async () => {
  if (app.dock && typeof app.dock.hide === "function") {
    app.dock.hide();
  }

  core = await import("../src/core.js");
  codexUsage = await import("../src/codex-usage.js");
  tray = new Tray(createTrayIcon());
  tray.setToolTip("Codex Shift");
  rebuildMenu();
  refreshAllCodexUsage();
  refreshTimer = setInterval(refreshAllCodexUsage, codexUsage.REFRESH_INTERVAL_MS);
  console.log("Codex Shift tray is running.");
  console.log("Tray bounds:", JSON.stringify(tray.getBounds()));
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("before-quit", () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});

function rebuildMenu() {
  const profiles = core.listProfiles();
  const paths = core.getPaths();

  const items = [];

  if (profiles.length === 0) {
    items.push({
      label: "No profiles yet",
      enabled: false,
    });
  } else {
    for (const profile of profiles) {
      const usageState = codexUsage.getUsageState(profile, paths);
      items.push({
        label: codexUsage.formatUsageMenuLabel(profile, usageState),
        submenu: [
          {
            label: codexUsage.formatUsageDetail(usageState),
            enabled: false,
          },
          { type: "separator" },
          {
            label: "Open App",
            click: () => openAppForProfile(profile, getCodexAppName()),
          },
          {
            label: "Login in Browser",
            click: () => runCodexLogin(profile),
          },
          {
            label: "Login in Terminal",
            click: () => runCodexLoginInTerminal(profile),
          },
          { type: "separator" },
          {
            label: "Delete Profile...",
            click: () => deleteProfileFromPrompt(profile),
          },
        ],
      });
    }
  }

  items.push(
    { type: "separator" },
    {
      label: "New profile...",
      click: () => createProfileFromPrompt(),
    },
    {
      label: "Open profiles folder",
      click: () => shell.openPath(core.getPaths().profilesDir),
    },
    {
      label: "Refresh",
      click: refreshAllCodexUsage,
    },
    { type: "separator" },
    {
      label: "Launch at login",
      type: "checkbox",
      checked: isLaunchAtLoginEnabled(),
      enabled: process.platform === "darwin" && app.isPackaged,
      click: toggleLaunchAtLogin,
    },
    { type: "separator" },
    {
      label: "Install cxs CLI...",
      enabled: app.isPackaged,
      click: installCxsCli,
    },
    {
      label: "Uninstall cxs CLI...",
      enabled: app.isPackaged && cliInstaller.isCodexShiftLauncher(cliInstaller.getCliInstallPath()),
      click: uninstallCxsCli,
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  );

  tray.setContextMenu(Menu.buildFromTemplate(items));
  updateTrayStatus();
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
    title: "Codex Shift",
    message: alreadyInstalled ? "Reinstall the cxs command?" : "Install the cxs command?",
    detail: [
      `Codex Shift will create ${launcherPath}.`,
      "The command uses this app's bundled runtime, so a separate Node.js installation is not required.",
      "If you move Codex Shift later, run this installer again.",
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
    title: "Codex Shift",
    message: "Remove the cxs command?",
    detail: `This removes ${launcherPath}. The Codex Shift app and your profiles will stay unchanged.`,
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
      title: "Codex Shift",
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
    title: "Codex Shift",
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
        title: "Codex Shift",
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
    for (const profile of core.listProfiles()) {
      await codexUsage.refreshUsageState(profile, paths);
    }
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
    title: "Codex Shift",
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

  const dialogScript = [
    `set profileName to text returned of (display dialog ${appleScriptQuote(prompt)}`,
    `default answer ${appleScriptQuote("")}`,
    'buttons {"Cancel", "Create"}',
    'default button "Create"',
    'cancel button "Cancel")',
  ].join(" ");
  const script = [dialogScript, "return profileName"].join("\n");

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

      if (stderr.includes("User canceled")) {
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
            "Codex login을 브라우저에서 시작할 수 없습니다. Login in Terminal을 시도해 주세요.",
        ),
      );
    }
  });
}

function runCodexLoginInTerminal(profile) {
  const codexCommand = core.findCodexCommand(process.env);
  if (!codexCommand) {
    showError(core.codexCommandNotFoundError());
    return;
  }

  const command = [
    `cd ${shellQuote(process.cwd())}`,
    `PATH=${shellQuote(path.dirname(codexCommand))}:$PATH`,
    `CODEX_HOME=${shellQuote(profile.codexHome)} ${shellQuote(codexCommand)} login`,
  ].join(" && ");

  codexUsage.recordCodexLaunch(profile, core.getPaths());
  refreshCodexUsage(profile);
  runInTerminal(command);
}

async function openAppForProfile(profile, appName) {
  refreshCodexUsage(profile);

  if (await isAppRunning(appName)) {
    const { response } = await dialog.showMessageBox({
      type: "question",
      buttons: ["Cancel", "Activate Existing", "Quit & Open"],
      defaultId: 1,
      cancelId: 0,
      title: "Codex Shift",
      message: `${appName} is already running.`,
      detail: [
        `To open ${profile.name} with its own CODEX_HOME, ${appName} needs to quit and launch again.`,
        "Choose Activate Existing to keep the current app workspace unchanged.",
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
    updateTrayStatus();
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
  const child = spawn("open", [
    "--env",
    `CODEX_HOME=${profile.codexHome}`,
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
    "Codex Shift",
    error instanceof Error ? error.message : String(error),
  );
}

function createTrayIcon() {
  const iconPath = path.join(__dirname, "assets", "tray-iconTemplate.png");
  const image = nativeImage.createFromPath(iconPath);
  image.setTemplateImage(true);
  return image;
}

function updateTrayStatus() {
  if (!tray) {
    return;
  }

  const profile = getRecentProfile();
  if (!profile) {
    tray.setTitle("");
    tray.setToolTip("Codex Shift");
    return;
  }

  const usageState = codexUsage.getUsageState(profile, core.getPaths());
  const title = codexUsage.formatUsageTrayTitle(usageState);
  tray.setTitle(title);
  tray.setToolTip(
    title
      ? `Codex Shift · ${profile.name} · ${title}`
      : `Codex Shift · ${profile.name} · ${usageState.message}`,
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
