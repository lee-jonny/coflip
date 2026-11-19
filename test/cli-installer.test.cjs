const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
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
} = require("../app/cli-installer.cjs");

function testHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codex-shift-cli-test-"));
}

test("first launch of CoFlip repairs the previous packaged CLI path once", () => {
  const homeDir = testHome();
  const launcher = installCliLauncher({
    homeDir,
    executablePath: "/Applications/Codex Shift.app/Contents/MacOS/Codex Shift",
    resourcesPath: "/Applications/Codex Shift.app/Contents/Resources",
  });
  const executable = "/Applications/CoFlip.app/Contents/MacOS/CoFlip";
  const resources = "/Applications/CoFlip.app/Contents/Resources";
  refreshLegacyLauncher(executable, resources, homeDir);
  assert.equal(fs.readFileSync(launcher, "utf8"),
    buildCliLauncher(executable, path.join(resources, "app.asar/bin/cxs.js")));
  fs.writeFileSync(launcher, "# custom cxs");
  refreshLegacyLauncher(executable, resources, homeDir);
  assert.equal(fs.readFileSync(launcher, "utf8"), "# custom cxs");
});

test("installs a cxs launcher that uses the packaged Electron runtime", () => {
  const homeDir = testHome();
  const launcherPath = installCliLauncher({
    executablePath: "/Applications/Codex Shift.app/Contents/MacOS/Codex Shift",
    resourcesPath: "/Applications/Codex Shift.app/Contents/Resources",
    homeDir,
  });

  const launcher = fs.readFileSync(launcherPath, "utf8");
  assert.equal(launcherPath, getCliInstallPath(homeDir));
  assert.match(launcher, /ELECTRON_RUN_AS_NODE=1/);
  assert.match(launcher, /app\.asar\/bin\/cxs\.js/);
  assert.equal(isCodexShiftLauncher(launcherPath), true);
});

test("does not replace a cxs launcher owned by another tool", () => {
  const homeDir = testHome();
  const launcherPath = getCliInstallPath(homeDir);
  fs.mkdirSync(path.dirname(launcherPath), { recursive: true });
  fs.writeFileSync(launcherPath, "#!/bin/sh\necho other tool\n");

  assert.throws(
    () =>
      installCliLauncher({
        executablePath: "/Applications/Codex Shift.app/Contents/MacOS/Codex Shift",
        resourcesPath: "/Applications/Codex Shift.app/Contents/Resources",
        homeDir,
      }),
    /Another cxs command/,
  );
});

test("removes only the launcher installed by Codex Shift", () => {
  const homeDir = testHome();
  const launcherPath = installCliLauncher({
    executablePath: "/Applications/Codex Shift.app/Contents/MacOS/Codex Shift",
    resourcesPath: "/Applications/Codex Shift.app/Contents/Resources",
    homeDir,
  });

  assert.equal(uninstallCliLauncher({ homeDir }), true);
  assert.equal(fs.existsSync(launcherPath), false);
  assert.equal(uninstallCliLauncher({ homeDir }), false);
});

test("detects whether the install directory is on PATH", () => {
  const homeDir = "/Users/tester";
  assert.equal(isCliInstallDirectoryOnPath("/usr/bin:/Users/tester/bin", homeDir), true);
  assert.equal(isCliInstallDirectoryOnPath("/usr/bin:/opt/homebrew/bin", homeDir), false);
});

test("adds the cxs PATH block to .zshrc only once", () => {
  const homeDir = testHome();
  const zshConfigPath = getZshConfigPath(homeDir);
  fs.writeFileSync(zshConfigPath, "export VOLTA_HOME=\"$HOME/.volta\"\n");

  assert.equal(installZshPathSetup({ homeDir }), true);
  assert.equal(installZshPathSetup({ homeDir }), false);

  const config = fs.readFileSync(zshConfigPath, "utf8");
  assert.equal(config.includes(buildZshPathSetup()), true);
  assert.equal(config.match(/Codex Shift cxs PATH/g).length, 2);
});

test("quotes app paths containing spaces", () => {
  const launcher = buildCliLauncher(
    "/Applications/Codex Shift.app/Contents/MacOS/Codex Shift",
    "/Applications/Codex Shift.app/Contents/Resources/app.asar/bin/cxs.js",
  );

  assert.match(launcher, /'\/Applications\/Codex Shift\.app/);
});
