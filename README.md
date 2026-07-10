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

cxs add company
cxs add personal
cxs delete personal
cxs add personal

cxs login company
cxs login personal

cxs run company
cxs run personal
```

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

The tray app refreshes Codex usage state every 10 minutes and immediately after
launching Codex from the tray. Each profile displays one of these states:

```text
Needs login
Unknown
Last known
```

This is intentionally separate from the OpenAI API usage/costs API. The app uses
the selected profile's ChatGPT auth token to call Codex usage endpoints observed
in the local Codex client. If the request or parser fails, the app keeps the last
known parsed value when one exists and otherwise shows `Unknown`.

For a distributable macOS build:

```sh
npm run pack:mac
```

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
cxs exec [profile] -- <prompt or codex exec args...>
```

If you omit the profile for `run` or `exec`, the CLI shows a numbered profile
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
- Improve the experimental Codex usage parser as response shapes evolve.
- Add shell integration helpers such as `codex-company` and `codex-personal`.
