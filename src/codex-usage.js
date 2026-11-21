import fs from "node:fs";
import path from "node:path";

import { EXISTING } from "./core.js";
import { readAccountLimits } from "./app-server.js";

const pendingRefresh = new Map();

export const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function getUsageStateFile(paths) {
  return path.join(paths.stateDir, "codex-usage.json");
}

export function readUsageStates(paths) {
  const file = getUsageStateFile(paths);
  if (!fs.existsSync(file)) {
    return Object.create(null);
  }

  return Object.assign(Object.create(null), JSON.parse(fs.readFileSync(file, "utf8")));
}

export function writeUsageStates(states, paths) {
  const file = getUsageStateFile(paths);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(states, null, 2)}\n`);
}

function usageKey(profile) {
  return profile.name === EXISTING ? `${EXISTING}:${profile.codexHome}` : profile.name;
}

export function getUsageState(profile, paths) {
  const states = readUsageStates(paths);
  return normalizeState(states[usageKey(profile)], profile);
}

export function getTrayUsage(profiles, paths) {
  const states = readUsageStates(paths);
  return profiles
    .flatMap((profile) => {
      const state = states[usageKey(profile)];
      if (state?.status !== "ok") return [];
      const percent = getPrimaryRemainingPercent(state);
      if (percent === null) return [];
      return [{ profile, percent, lastLaunchAt: state.lastLaunchAt ?? "" }];
    })
    .sort((first, second) => second.lastLaunchAt.localeCompare(first.lastLaunchAt))
    .slice(0, 2);
}

export function deleteUsageState(profileName, paths) {
  pendingRefresh.delete(path.join(paths.stateDir, profileName));
  const states = readUsageStates(paths);
  if (!Object.hasOwn(states, profileName)) {
    return;
  }

  delete states[profileName];
  writeUsageStates(states, paths);
}

export async function refreshContexts(contexts, selected, paths, options) {
  const targets = new Map(contexts.map(profile => [usageKey(profile), profile]));
  if (selected) targets.set(usageKey(selected), selected);
  for (const profile of targets.values()) {
    if (fs.existsSync(profile.codexHome)) await refreshUsageState(profile, paths, options);
  }
}

export async function refreshUsageState(profile, paths, { probe = readAccountLimits } = {}) {
  const key = path.join(paths.stateDir, usageKey(profile));
  const request = Symbol();
  pendingRefresh.set(key, request);
  let update;
  try {
    const { status, limits } = await probe(profile);
    if (status === "ok" && (hasNumber(limits?.primary?.usedPercent) || hasNumber(limits?.secondary?.usedPercent))) {
      const windows = [limits.primary, limits.secondary].filter(w => hasNumber(w?.usedPercent));
      const remainingText = windows.map(formatRateLimit).join(" / ");
      const lastKnown = {
        type: "rate-limits",
        primary: limits.primary,
        secondary: limits.secondary,
        remainingText,
        measuredAt: new Date().toISOString(),
      };
      update = { status, message: remainingText, lastKnown, reason: null };
    } else {
      const needsLogin = status === "needs-login";
      update = { status: needsLogin ? status : "unavailable", message: needsLogin ? "Needs login" : "Unavailable", lastKnown: null, reason: null };
    }
  } catch (error) {
    const previous = getUsageState(profile, paths);
    update = {
      status: previous.lastKnown ? "last-known" : "unavailable",
      message: previous.lastKnown ? `Last known · ${previous.lastKnown.remainingText}` : "Unavailable",
      reason: error.message,
    };
  }
  if (pendingRefresh.get(key) !== request) return getUsageState(profile, paths);
  pendingRefresh.delete(key);
  const states = readUsageStates(paths);
  const next = { ...normalizeState(states[usageKey(profile)], profile), ...update, checkedAt: new Date().toISOString() };
  states[usageKey(profile)] = next;
  writeUsageStates(states, paths);
  return next;
}

export function recordCodexLaunch(profile, paths) {
  const states = readUsageStates(paths);
  const previous = normalizeState(states[usageKey(profile)], profile);
  const today = new Date().toISOString().slice(0, 10);
  const previousLaunchDate = previous.lastLaunchAt?.slice(0, 10);
  const launchCountToday =
    previousLaunchDate === today ? (previous.launchCountToday || 0) + 1 : 1;

  states[usageKey(profile)] = {
    ...previous,
    lastLaunchAt: new Date().toISOString(),
    launchCountToday,
  };
  writeUsageStates(states, paths);
  return states[usageKey(profile)];
}

export function formatUsageMenuLabel(profile, state) {
  return `${profile.name} · ${state.message}`;
}

export function formatUsageDetail(state) {
  if (state.status === "unavailable" && state.reason) return state.reason;
  if (state.checkedAt) {
    return `Updated ${formatLocalTime(state.checkedAt)}`;
  }

  return state.message;
}

export function formatUsageDialogDetail(state) {
  if (state.status === "needs-login") return "이 프로필에 로그인하면 사용량을 확인할 수 있습니다.";
  if (state.status === "unknown") return "아직 사용량을 확인하지 않았습니다.";
  if (state.status === "unavailable") return "사용량을 조회할 수 없습니다.";

  const lines = [];
  if (state.status === "last-known") lines.push("새로 조회하지 못해 이전 측정값을 표시합니다.");
  for (const [label, limit] of [["기본 한도", state.lastKnown?.primary], ["추가 한도", state.lastKnown?.secondary]]) {
    if (!limit) continue;
    const { windowDurationMins, resetsAt } = normalizeRateLimit(limit);
    const percent = getRemainingPercent(limit);
    if (percent === null) continue;

    const period = formatUsagePeriod(windowDurationMins);
    const reset = resetsAt ? ` · ${formatReset(resetsAt)} 초기화` : "";
    lines.push(`${label}${period} · 잔여 ${Math.round(percent)}%${reset}`);
  }

  const measuredAt = state.lastKnown?.measuredAt ?? (state.status === "ok" ? state.checkedAt : null);
  if (measuredAt) lines.push(`확인 시각 ${formatLocalTime(measuredAt)}`);
  return lines.join("\n") || "사용량을 조회할 수 없습니다.";
}

function formatUsagePeriod(minutes) {
  if (!minutes) return "";
  if (minutes % 1440 === 0) return ` (${minutes / 1440}일)`;
  if (minutes % 60 === 0) return ` (${minutes / 60}시간)`;
  return ` (${minutes}분)`;
}

export function formatUsageTrayTitle(state) {
  if (["needs-login", "unavailable", "last-known"].includes(state.status)) return "";
  const percent = getPrimaryRemainingPercent(state);
  return percent === null ? "" : `${Math.round(percent)}%`;
}

function normalizeState(state, profile) {
  return {
    profileName: profile.name,
    status: "unknown",
    message: "Unknown",
    checkedAt: null,
    lastKnown: null,
    lastLaunchAt: null,
    launchCountToday: 0,
    reason: null,
    ...state,
  };
}

function normalizeRateLimit(value) {
  const remainingPercent = numberOrNull(value.remainingPercent ?? value.remaining_percent);
  const usedPercent = numberOrNull(value.usedPercent ?? value.used_percent);
  return {
    limitId: value.limitId ?? value.limit_id ?? null,
    limitName: value.limitName ?? value.limit_name ?? null,
    remainingPercent,
    usedPercent,
    resetsAt: value.resetsAt ?? value.resets_at ?? null,
    windowDurationMins: value.windowDurationMins ?? value.window_duration_mins ?? null,
  };
}

function formatRateLimit(value) {
  const normalized = normalizeRateLimit(value);
  const percent = getRemainingPercent(normalized);
  const reset = normalized.resetsAt ? `, resets ${formatReset(normalized.resetsAt)}` : "";

  if (percent === null) {
    return `Available${reset}`;
  }

  return `${Math.round(percent)}%${reset}`;
}

function getPrimaryRemainingPercent(state) {
  if (state?.lastKnown?.type !== "rate-limits") {
    return null;
  }

  return getRemainingPercent(state.lastKnown.primary);
}

function getRemainingPercent(value) {
  const normalized = normalizeRateLimit(value || {});
  const percent =
    normalized.remainingPercent ?? (normalized.usedPercent === null ? null : 100 - normalized.usedPercent);

  if (percent === null) {
    return null;
  }

  return Math.max(0, Math.min(100, percent));
}

function formatReset(value) {
  const date = new Date(typeof value === "number" ? value * 1000 : value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function hasNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function numberOrNull(value) {
  return hasNumber(value) ? value : null;
}

function formatLocalTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
