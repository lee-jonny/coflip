# Codex Shift

Codex Shift is a small CLI and macOS menu bar app that runs Codex with isolated
`CODEX_HOME` directories, so you can switch between work and personal Codex
account contexts.

## Why this shape?

Codex stores local state such as config, auth, logs, and sessions under
`CODEX_HOME`. By giving each account its own home directory, we can switch
contexts without copying or editing auth files directly.

## Quick start

```sh
npm install
npm link

cxs list
cxs run @existing

# Optional separate account contexts
cxs add company
cxs add personal

cxs login company
cxs login personal

cxs run company
cxs run personal
```

## 세 Mac에서 사용하는 순서

이 변경이 포함된 체크아웃에서 바로 시험하려면 아래 예시의 `cxs` 대신 `node bin/cxs.js`를 쓴다. 개발용 메뉴 앱은 `npm install` 후 `npm run tray`로 연다. 기존 배포 앱을 쓰는 Mac에는 새 버전을 빌드해 설치해야 메뉴가 바뀐다.

1. **각 Mac에서 기존 대화 위치를 확인한다.** 터미널에서 `cxs list`를 실행하면 Mac 이름과 홈 경로가 보인다. `@existing`은 그 프로세스의 `CODEX_HOME`을 사용하고, 지정하지 않았으면 `~/.codex`를 사용한다. 기존 로그인은 `cxs run @existing -- login status`로 확인한다. Finder에서 실행한 메뉴 앱과 터미널은 환경 변수가 다를 수 있으므로 화면의 홈 경로를 비교한다.
2. **대화를 시작한 Mac에서 재개한다.** 프로젝트 폴더에서 `cxs resume @existing` 또는 `cxs resume personal`을 실행한다. 목록이 비면 `cxs resume personal -- --all`로 같은 홈의 모든 폴더를 조회한다. 이전에 `exec`로 만든 대화라면 지원 버전에서 `--include-non-interactive`도 추가한다. 프로필 이름은 Mac마다 달라도 된다.
3. **자주 쓰는 Mac 한 대를 실행 호스트로 정한다.** 다른 Mac에서는 메뉴의 **Continue on another Mac… → Connect with SSH…**로 원래 Mac에 접속한다. macOS의 원격 로그인과 SSH 접속이 설정되어 있어야 한다. 접속한 터미널에서 프로젝트로 이동한 뒤 그 Mac의 `cxs resume`을 실행한다. 원래 Mac은 깨어 있고 연결되어 있어야 한다.
4. **실행 위치까지 옮길 때는 Hand off를 사용한다.** 데스크톱의 **Settings → Connections**에서 목적지를 연결하고 같은 Git 저장소를 양쪽에 프로젝트로 등록한다. 하위 폴더 프로젝트는 양쪽에서 같은 하위 경로를 사용한다. 출발지에서 대화를 재개한 뒤 CLI에 `/app`을 입력하고 대화 하단의 실행 위치에서 목적지와 **Hand off**를 선택한다. 진행 중인 응답은 중단되므로 응답이 끝난 뒤 옮기는 편이 편하다. 목적지에서 마지막 대화와 Git 상태를 확인한다. [공식 원격 연결 가이드](https://learn.chatgpt.com/docs/remote-connections)
5. **도구를 맞춘다.** 각 Mac에서 `cxs tools @existing` 또는 `cxs tools personal`로 CLI 버전과 지원되는 플러그인 목록을 확인한다. 필요한 `plugin@marketplace` 식별자만 적어 두고 대상 홈에서 `cxs run personal -- plugin add PLUGIN@MARKETPLACE`로 설치한다. 새 대화를 열고 해당 서비스의 연결 승인을 마친다. 메뉴 앱의 **Tool setup…**에서도 조회와 설치가 가능하다. Mac 화면 조작은 **Open desktop for Computer Use → Settings → Computer use → Any App**에서 설정하고 해당 Mac에서 화면 기록과 손쉬운 사용 권한을 승인한다. [플러그인](https://learn.chatgpt.com/docs/plugins) · [Computer Use](https://learn.chatgpt.com/docs/computer-use)

업무 계정은 조직이 허용한 호스트와 저장소에서 사용한다. 세 Mac을 맞추기 위해 인증 파일이나 실행 중인 홈 전체를 동기화할 필요는 없다. 한도에 도달하면 해당 계정의 재설정·크레딧 옵션을 확인한다. [조사 근거와 정책](docs/research/codex-multi-mac.md)

아이콘을 다시 생성할 때는 ImageMagick 7이 필요하다. macOS에서 `brew install imagemagick`으로 설치한 뒤 프로젝트 루트에서 `npm run icons`를 실행한다. 일반 빌드는 저장소의 PNG를 사용한다.

## Menu bar app

Install the Electron development dependency first:

```sh
npm install
```

Then start the macOS menu bar app:

```sh
npm run tray
```

The tray app reads the same profiles as the CLI. From the menu bar you can:

- create a new profile by entering a profile name
- delete a profile after a confirmation prompt
- show experimental Codex usage status next to each profile
- show the most recently opened profile's primary remaining usage next to the tray icon
- open each profile's actions from its submenu
- activate the existing Codex macOS app from a profile submenu
- run Login in Browser for a selected profile, with Terminal login as a fallback
- open the profiles folder

The menu bar app needs the Codex CLI for **Login in Browser** and **Login in
Terminal**. It detects common Homebrew, npm/nvm, Volta, and pnpm installation
locations. If your installation is elsewhere, launch the app with
`CXS_CODEX_PATH` set to the full path of the `codex` executable.

By default, the tray looks for an app named `Codex`. You can override that name
when launching the tray:

```sh
CXS_CODEX_APP_NAME="Codex" \
npm run tray
```

Open App launches Codex with the selected profile's `CODEX_HOME` when Codex is
not already running. If Codex is already running, the tray asks whether to keep
the existing workspace active or quit and reopen Codex with the selected profile.
Profile-specific terminal execution is also available through `cxs run`.

### Codex Usage (experimental)

The tray checks each available home's Codex App Server every ten minutes. It
reads account status and ChatGPT rate-limit windows through `account/read`
and `account/rateLimits/read`. Codex handles credential storage, including
the macOS Keychain. The menu shows remaining percentages, **Needs login** for
signed-out accounts that require authentication, and **Unavailable** for
unsupported accounts or CLI versions. A failed refresh labels cached values
**Last known**. [Codex App Server](https://learn.chatgpt.com/docs/app-server)

For a distributable macOS build:

```sh
npm run pack:mac
```

### Installing a GitHub Release (macOS)

This project is currently distributed without an Apple Developer ID certificate
or Apple notarization. macOS therefore marks the app as quarantined after it is
downloaded from GitHub; this is expected and does not mean the DMG is corrupted.

1. Open the downloaded DMG and drag `Codex Shift.app` into `Applications`.
2. In Finder, Control-click `Codex Shift.app`, then choose **Open** and confirm.

If macOS instead reports that the app is damaged, remove the download quarantine
attribute after copying it to `Applications`:

```sh
xattr -dr com.apple.quarantine "/Applications/Codex Shift.app"
```

Then open the app normally. Only run this command for a release you downloaded
from this repository.

Release builds use an explicit ad-hoc signature and disable the hardened runtime
because they are not Developer ID signed. This makes the unsigned-build intent
clear, but it does not replace Apple signing or notarization; a Developer ID
signed and notarized release is required for a warning-free macOS installation.

### Launch at login

In the packaged app's menu bar menu, enable **Launch at login** to start Codex
Shift automatically when you sign in to macOS. Disable the same item to remove
it from the macOS login items list. This option is unavailable while running the
app in development mode.

## Commands

```sh
cxs add <profile> [--label <name>]
cxs delete <profile>
cxs list
cxs use <profile>
cxs current
cxs path <profile>
cxs env <profile>
cxs login <profile>
cxs run [profile] [-- <codex args...>]
cxs resume [profile] [-- <resume options or session ID>]
cxs tools [profile]
cxs exec [profile] -- <prompt or codex exec args...>
```

If you omit the profile for `run` or `exec`, the CLI shows an interactive profile
list in the terminal:

```sh
cxs run
cxs exec -- "review this change"
```

## Default locations

Profiles:

```text
~/.codex-profiles/<profile>
```

Current profile state:

```text
~/Library/Application Support/Codex Shift/current-profile.json
```

For tests or custom layouts, override these paths:

```sh
CXS_PROFILES_DIR=/tmp/codex-profiles \
CXS_STATE_DIR=/tmp/codex-shift-state \
cxs add company
```

## Next milestones

- Add a Tauri menu bar app that calls this CLI core.
- Add account labels and icons in a small settings UI.
- Add shell integration helpers such as `codex-company` and `codex-personal`.
