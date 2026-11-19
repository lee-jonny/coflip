const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const LAUNCHER_MARKER = "# Codex Shift CLI launcher";
const ZSH_PATH_MARKER_START = "# >>> Codex Shift cxs PATH >>>";
const ZSH_PATH_MARKER_END = "# <<< Codex Shift cxs PATH <<<";

function getCliInstallPath(homeDir = os.homedir()) {
  return path.join(homeDir, "bin", "cxs");
}

function isCliInstallDirectoryOnPath(envPath, homeDir = os.homedir()) {
  return String(envPath || "")
    .split(path.delimiter)
    .includes(path.join(homeDir, "bin"));
}

function getZshConfigPath(homeDir = os.homedir()) {
  return path.join(homeDir, ".zshrc");
}

function installZshPathSetup({ homeDir = os.homedir() } = {}) {
  const zshConfigPath = getZshConfigPath(homeDir);
  const existingConfig = readFile(zshConfigPath) || "";

  if (existingConfig.includes(ZSH_PATH_MARKER_START)) {
    return false;
  }

  const separator = existingConfig.endsWith("\n") || existingConfig.length === 0 ? "" : "\n";
  fs.writeFileSync(
    zshConfigPath,
    `${existingConfig}${separator}${buildZshPathSetup()}\n`,
  );
  return true;
}

function readLauncher(launcherPath) {
  return readFile(launcherPath);
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function isCodexShiftLauncher(launcherPath) {
  return readLauncher(launcherPath)?.includes(LAUNCHER_MARKER) || false;
}

function installCliLauncher({ executablePath, resourcesPath, homeDir = os.homedir() }) {
  const launcherPath = getCliInstallPath(homeDir);
  const existingLauncher = readLauncher(launcherPath);

  if (existingLauncher && !existingLauncher.includes(LAUNCHER_MARKER)) {
    throw new Error(
      `Another cxs command already exists at ${launcherPath}. It was not replaced.`,
    );
  }

  fs.mkdirSync(path.dirname(launcherPath), { recursive: true });
  fs.writeFileSync(
    launcherPath,
    buildCliLauncher(executablePath, path.join(resourcesPath, "app.asar", "bin", "cxs.js")),
    { mode: 0o755 },
  );
  fs.chmodSync(launcherPath, 0o755);
  return launcherPath;
}

function refreshLegacyLauncher(executablePath, resourcesPath, homeDir = os.homedir()) {
  const applicationsDir = path.resolve(resourcesPath, "../../..");
  const oldContents = path.join(applicationsDir, "Codex Shift.app", "Contents");
  const oldLauncher = buildCliLauncher(
    path.join(oldContents, "MacOS", "Codex Shift"),
    path.join(oldContents, "Resources", "app.asar", "bin", "cxs.js"),
  );
  if (readLauncher(getCliInstallPath(homeDir)) === oldLauncher) {
    installCliLauncher({ executablePath, resourcesPath, homeDir });
  }
}

function uninstallCliLauncher({ homeDir = os.homedir() } = {}) {
  const launcherPath = getCliInstallPath(homeDir);

  if (!fs.existsSync(launcherPath)) {
    return false;
  }

  if (!isCodexShiftLauncher(launcherPath)) {
    throw new Error(
      `The cxs command at ${launcherPath} was not installed by CoFlip.`,
    );
  }

  fs.rmSync(launcherPath);
  return true;
}

function buildCliLauncher(executablePath, cliPath) {
  return [
    "#!/bin/sh",
    LAUNCHER_MARKER,
    "export ELECTRON_RUN_AS_NODE=1",
    `exec ${shellQuote(executablePath)} ${shellQuote(cliPath)} "$@"`,
    "",
  ].join("\n");
}

function buildZshPathSetup() {
  return [
    ZSH_PATH_MARKER_START,
    'case ":$PATH:" in',
    '  *":$HOME/bin:"*) ;;',
    '  *) export PATH="$HOME/bin:$PATH" ;;',
    "esac",
    ZSH_PATH_MARKER_END,
  ].join("\n");
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

module.exports = {
  buildCliLauncher,
  buildZshPathSetup,
  getCliInstallPath,
  getZshConfigPath,
  installCliLauncher,
  installZshPathSetup,
  isCliInstallDirectoryOnPath,
  isCodexShiftLauncher,
  refreshLegacyLauncher,
  uninstallCliLauncher,
};
