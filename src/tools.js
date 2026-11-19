import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { codexCommandNotFoundError, findCodexCommand, getCodexEnv } from "./core.js";

const execute = promisify(execFile);

export async function inspectTools(profile, env = process.env) {
  const command = findCodexCommand(env);
  if (!command) throw codexCommandNotFoundError();
  const options = { env: getCodexEnv(profile, env, command), timeout: 10000 };
  const read = async args => (await execute(command, args, options)).stdout.trim();
  const [version, listHelp, addHelp] = await Promise.all([
    read(["--version"]),
    read(["plugin", "list", "--help"]).catch(() => ""),
    read(["plugin", "add", "--help"]).catch(() => ""),
  ]);
  return {
    version,
    canList: /codex plugin list\b/i.test(listHelp),
    canAdd: /codex plugin add\b/i.test(addHelp),
  };
}
