import { createServer } from "node:net";
import { existsSync, unlinkSync } from "node:fs";
import { executer, estArret, type Requete } from "./commands";
import { SOCK, ensureRunDir } from "./paths";

/**
 * Le démon : il garde UNE session d'app ouverte et sert des commandes sur une socket unix.
 *
 * C'est la seule forme qui convient à un agent : entre deux commandes il réfléchit, lit une
 * capture, change d'avis. Relancer l'app à chaque geste coûterait une minute par clic ET
 * effacerait l'état que le geste précédent venait de créer — donc rendrait impossible le
 * seul type de bug qui compte ici, celui qui n'apparaît qu'après six gestes enchaînés.
 *
 * Une socket UNIX, pas un port : elle est protégée par les droits du système de fichiers,
 * elle ne s'expose sur aucune interface, et elle meurt avec le fichier.
 */
async function main(): Promise<void> {
  ensureRunDir();
  if (existsSync(SOCK)) unlinkSync(SOCK);

  const serveur = createServer((sock) => {
    let tampon = "";
    sock.on("data", async (chunk) => {
      tampon += chunk.toString();
      // Une requête = une ligne JSON. Le tampon existe parce que TCP/unix découpe où il veut.
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
      /* un client qui raccroche ne tue pas le démon */
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
