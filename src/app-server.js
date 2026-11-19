import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { codexCommandNotFoundError, findCodexCommand, getCodexEnv } from "./core.js";

// Each probe owns a stdio server. No account token is requested or returned to Shift.
export function readAccountLimits(profile, env = process.env) {
  const command = findCodexCommand(env);
  if (!command) throw codexCommandNotFoundError();
  return new Promise((resolve, reject) => {
    const child = spawn(command, ["app-server"], {
      env: getCodexEnv(profile, env, command),
      stdio: ["pipe", "pipe", "ignore"],
    });
    const lines = createInterface({ input: child.stdout });
    const timeout = setTimeout(() => finish(new Error("Codex App Server timed out")), 15000);
    let finished = false;
    let pending;
    let id = 0;
    function finish(error, result) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      lines.close();
      child.stdin.destroy();
      child.kill();
      if (error) reject(error);
      else resolve(result);
    }
    function send(method, params) {
      pending = method;
      child.stdin.write(JSON.stringify({ id: ++id, method, params }) + "\n");
    }
    child.on("error", finish);
    child.stdin.on("error", finish);
    child.on("close", () => finish(new Error("Codex App Server closed before replying")));
    lines.on("line", line => {
      if (finished) return;
      try {
        const reply = JSON.parse(line);
        if (reply.id !== id || reply.method) return;
        if (reply.error) throw new Error(`Codex App Server could not complete ${pending}`);
        if (pending === "initialize") {
          child.stdin.write('{"method":"initialized"}\n');
          send("account/read", { refreshToken: false });
        } else if (pending === "account/read") {
          const { account, requiresOpenaiAuth } = reply.result;
          if (!account || account.type !== "chatgpt") {
            finish(null, { status: !account && requiresOpenaiAuth ? "needs-login" : "unavailable" });
          } else {
            send("account/rateLimits/read", {});
          }
        } else {
          finish(null, { status: "ok", limits: reply.result.rateLimits });
        }
      } catch (error) {
        finish(error);
      }
    });
    send("initialize", { clientInfo: { name: "codex_shift", version: "1" } });
  });
}
