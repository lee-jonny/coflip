import fs from "node:fs";
import path from "node:path";

export const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function getUsageStateFile(paths) {
  return path.join(paths.stateDir, "codex-usage.json");
}

export function readUsageStates(paths) {
  const file = getUsageStateFile(paths);
  if (!fs.existsSync(file)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeUsageStates(states, paths) {
  const file = getUsageStateFile(paths);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(states, null, 2)}\n`);
}

export function getUsageState(profile, paths) {
  const states = readUsageStates(paths);
  return normalizeState(states[profile.name], profile);
}

export function deleteUsageState(profileName, paths) {
  const states = readUsageStates(paths);
  if (!Object.hasOwn(states, profileName)) {
    return;
  }

  delete states[profileName];
  writeUsageStates(states, paths);
}

export async function refreshUsageState(profile, paths, options = {}) {
  const states = readUsageStates(paths);
  const previous = normalizeState(states[profile.name], profile);
  const checkedAt = new Date().toISOString();
  const auth = readCodexAuth(profile);

  let next;
  if (!auth) {
    next = {
      ...previous,
      status: "needs-login",
      checkedAt,
      message: "Needs login",
    };
  } else {
    try {
      const lastKnown = await fetchCodexUsage(auth, options);
      next = {
        ...previous,
        status: "ok",
        checkedAt,
        message: formatLastKnown(lastKnown),
        lastKnown,
        reason: null,
      };
    } catch (error) {
      next = {
        ...previous,
        status: previous.lastKnown ? "last-known" : "unknown",
        checkedAt,
        message: previous.lastKnown ? formatLastKnown(previous.lastKnown) : "Unknown",
        reason: sanitizeError(error),
      };
    }
  }

  states[profile.name] = next;
  writeUsageStates(states, paths);
  return next;
}

export function recordCodexLaunch(profile, paths) {
  const states = readUsageStates(paths);
  const previous = normalizeState(states[profile.name], profile);
  const today = new Date().toISOString().slice(0, 10);
  const previousLaunchDate = previous.lastLaunchAt?.slice(0, 10);
  const launchCountToday =
    previousLaunchDate === today ? (previous.launchCountToday || 0) + 1 : 1;

  states[profile.name] = {
    ...previous,
    lastLaunchAt: new Date().toISOString(),
    launchCountToday,
  };
  writeUsageStates(states, paths);
  return states[profile.name];
}

export function formatUsageMenuLabel(profile, state) {
  return `${profile.name} · ${state.message}`;
}

export function formatUsageDetail(state) {
  if (state.checkedAt) {
    return `Updated ${formatLocalTime(state.checkedAt)}`;
  }

  return state.message;
}

export function formatUsageTrayTitle(state) {
  const percent = getPrimaryRemainingPercent(state);
  return percent === null ? "" : `${Math.round(percent)}%`;
}

export async function fetchCodexUsage(auth, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available");
  }

  const accessToken = auth?.tokens?.access_token;
  if (!accessToken) {
    throw new Error("ChatGPT access token is missing");
  }

  const baseUrl =
    options.baseUrl ||
    process.env.CXS_CODEX_BACKEND_URL ||
    process.env.CODEX_SWITCHER_CODEX_BACKEND_URL ||
    "https://chatgpt.com/backend-api";
  const endpoints = [
    "/api/codex/profiles/me",
    "/api/codex/usage",
    "/wham/usage",
  ];
  const errors = [];

  for (const endpoint of endpoints) {
    try {
      const payload = await fetchJson(fetchImpl, `${baseUrl}${endpoint}`, accessToken);
      const parsed = parseCodexUsagePayload(payload);
      if (parsed) {
        return {
          ...parsed,
          source: endpoint,
          fetchedAt: new Date().toISOString(),
        };
      }
      errors.push(`${endpoint}: no usage fields found`);
    } catch (error) {
      errors.push(`${endpoint}: ${sanitizeError(error)}`);
    }
  }

  throw new Error(errors.join("; "));
}

export function parseCodexUsagePayload(payload) {
  const rateLimits = collectObjects(payload).filter((item) => {
    return (
      hasNumber(item.remainingPercent) ||
      hasNumber(item.remaining_percent) ||
      hasNumber(item.usedPercent) ||
      hasNumber(item.used_percent)
    );
  });

  if (rateLimits.length > 0) {
    const primary =
      rateLimits.find((item) => item.primary === true) ||
      rateLimits.find((item) => /5|hour|primary/i.test(String(item.limitName || item.limit_name || ""))) ||
      rateLimits[0];
    const secondary =
      rateLimits.find((item) => item.secondary === true) ||
      rateLimits.find((item) => item !== primary) ||
      null;

    return {
      type: "rate-limits",
      primary: normalizeRateLimit(primary),
      secondary: secondary ? normalizeRateLimit(secondary) : null,
      remainingText: formatRateLimits(primary, secondary),
      rawRateLimitCount: rateLimits.length,
    };
  }

  const tokenSummary = findTokenUsageSummary(payload);
  if (tokenSummary) {
    return {
      type: "token-usage",
      summary: tokenSummary,
      remainingText: "Token usage available",
    };
  }

  return null;
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

function readCodexAuth(profile) {
  const authFile = path.join(profile.codexHome, "auth.json");
  if (!fs.existsSync(authFile)) {
    return null;
  }

  try {
    const auth = JSON.parse(fs.readFileSync(authFile, "utf8"));
    return auth.tokens || auth.OPENAI_API_KEY || auth.auth_mode ? auth : null;
  } catch {
    return null;
  }
}

function formatLastKnown(lastKnown) {
  if (typeof lastKnown.remainingText === "string") {
    return lastKnown.remainingText;
  }

  return "Last known";
}

async function fetchJson(fetchImpl, url, accessToken) {
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "codex-shift",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function collectObjects(value, output = []) {
  if (!value || typeof value !== "object") {
    return output;
  }

  if (!Array.isArray(value)) {
    output.push(value);
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      collectObjects(child, output);
    }
  }

  return output;
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

function formatRateLimits(primary, secondary) {
  const primaryText = formatRateLimit(primary);
  if (!secondary) {
    return primaryText;
  }

  return `${primaryText} / ${formatRateLimit(secondary)}`;
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function findTokenUsageSummary(payload) {
  const objects = collectObjects(payload);
  return objects.find((item) => {
    return (
      hasNumber(item.lifetimeTokens) ||
      hasNumber(item.lifetime_tokens) ||
      hasNumber(item.peakDailyTokens) ||
      hasNumber(item.peak_daily_tokens)
    );
  });
}

function hasNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function numberOrNull(value) {
  return hasNumber(value) ? value : null;
}

function sanitizeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]");
}

function formatLocalTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
