import { createServer } from "node:net";
import { existsSync, unlinkSync } from "node:fs";
import { executer, estArret, type Requete } from "./commands";
import { SOCK, ensureRunDir } from "./paths";

/**
 * The daemon: it keeps ONE app session open and serves commands over a unix socket.
 *
 * It's the only form that suits an agent: between two commands it thinks, reads a
 * screenshot, changes its mind. Relaunching the app on every gesture would cost a minute per click AND
 * would erase the state the previous gesture had just created — so it would make impossible the
 * one kind of bug that matters here, the one that only shows up after six chained gestures.
 *
 * A UNIX socket, not a port: it's protected by the filesystem's permissions,
 * it exposes on no interface, and it dies with the file.
 */
async function main(): Promise<void> {
  ensureRunDir();
  if (existsSync(SOCK)) unlinkSync(SOCK);

  const serveur = createServer((sock) => {
    let tampon = "";
    sock.on("data", async (chunk) => {
      tampon += chunk.toString();
      // One request = one JSON line. The buffer exists because TCP/unix splits wherever it wants.
      let i: number;
      while ((i = tampon.indexOf("\n")) >= 0) {
        const ligne = tampon.slice(0, i).trim();
        tampon = tampon.slice(i + 1);
        if (!ligne) continue;
        let rep: Record<string, unknown>;
        let cmd = "";
        try {
          const req = JSON.parse(ligne) as Requete;
          cmd = req.cmd;
          rep = await executer(req);
        } catch (err) {
          rep = { ok: false, erreur: err instanceof Error ? err.message : String(err) };
        }
        sock.write(JSON.stringify(rep) + "\n");
        if (estArret(cmd)) {
          sock.end();
          serveur.close();
          process.exit(0);
        }
      }
    });
    sock.on("error", () => {
      /* a client hanging up doesn't kill the daemon */
    });
  });

  serveur.listen(SOCK, () => process.stdout.write(`pilote prêt: ${SOCK}\n`));

  const fermer = async () => {
    await executer({ cmd: "stop" }).catch(() => {});
    if (existsSync(SOCK)) unlinkSync(SOCK);
    process.exit(0);
  };
  process.on("SIGINT", fermer);
  process.on("SIGTERM", fermer);
}

main().catch((err) => {
  process.stderr.write(`pilote: démarrage impossible — ${String(err)}\n`);
  process.exit(1);
});
