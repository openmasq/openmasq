import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { existsSync, openSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DAEMON_LOG, SOCK, ensureRunDir } from "./paths";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Translates `click "Library" 2` into `{cmd:"click", args:{nom:"…", n:2}}`. */
function versRequete(argv: string[]): { cmd: string; args: Record<string, unknown> } {
  const [cmd, ...reste] = argv;
  const un = reste[0];
  switch (cmd) {
    case "start":
      return { cmd, args: un ? (JSON.parse(un) as Record<string, unknown>) : {} };
    case "look":
      return { cmd, args: { nom: un ?? "vue" } };
    case "click":
      return { cmd, args: { nom: un, n: reste[1] ? Number(reste[1]) : 1 } };
    case "type":
      return { cmd, args: { texte: un, champ: reste[1] } };
    case "key":
      return { cmd, args: { touche: un } };
    case "ask":
      return { cmd, args: { prompt: reste.join(" ") } };
    case "eval":
      return { cmd, args: { js: reste.join(" ") } };
    case "drop":
      return { cmd, args: { chemin: un } };
    default:
      return { cmd: cmd ?? "state", args: {} };
  }
}

/** Spins up the daemon in the background and waits for the socket to answer. */
async function lever(): Promise<void> {
  ensureRunDir();
  const log = openSync(DAEMON_LOG, "a");
  // tsx is hoisted to the monorepo root. We call it by its path when it's there —
  // an `npx` would fall back to the network — and we only fall back to `npx` if it isn't there.
  const tsx = resolve(HERE, "../../../../../node_modules/tsx/dist/cli.mjs");
  const [bin, args] = existsSync(tsx)
    ? [process.execPath, [tsx, resolve(HERE, "daemon.ts")]]
    : ["npx", ["-y", "tsx", resolve(HERE, "daemon.ts")]];
  const enfant = spawn(bin, args, {
    detached: true,
    stdio: ["ignore", log, log],
    cwd: resolve(HERE, "../../.."),
  });
  enfant.unref();
  for (let i = 0; i < 120; i++) {
    if (existsSync(SOCK)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`le pilote n'a pas démarré — lire ${DAEMON_LOG}`);
}

async function envoyer(req: unknown): Promise<string> {
  return new Promise((res, rej) => {
    const sock = createConnection(SOCK);
    let tampon = "";
    sock.on("connect", () => sock.write(JSON.stringify(req) + "\n"));
    sock.on("data", (c) => {
      tampon += c.toString();
      const i = tampon.indexOf("\n");
      if (i >= 0) {
        sock.end();
        res(tampon.slice(0, i));
      }
    });
    sock.on("error", rej);
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === "down") {
    if (existsSync(SOCK)) {
      await envoyer({ cmd: "stop" }).catch(() => {});
      if (existsSync(SOCK)) unlinkSync(SOCK);
    }
    process.stdout.write('{"ok":true,"arrete":true}\n');
    return;
  }
  if (!existsSync(SOCK)) await lever();
  if (argv[0] === "up") {
    process.stdout.write('{"ok":true,"pilote":"prêt"}\n');
    return;
  }
  const brut = await envoyer(versRequete(argv));
  // Re-indented: the answer is read by an agent AND by a human leaning over the terminal.
  process.stdout.write(JSON.stringify(JSON.parse(brut), null, 2) + "\n");
  if (!(JSON.parse(brut) as { ok: boolean }).ok) process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`pilote: ${String(err)}\n`);
  process.exit(1);
});
