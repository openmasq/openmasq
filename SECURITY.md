# Security policy

<sub>**English** · [Français](#politique-de-sécurité) · [openmasq.com](https://openmasq.com)</sub>

The product is a desktop application whose purpose is to keep sensitive data on the user's
machine: text is redacted before it leaves, the model only ever receives substitutes, and
the reply is restored locally from a per-conversation vault. This document states what that
design does and does not guarantee.

It is written to be read by someone deciding whether to trust the product — a user, a DPO,
a security reviewer. A promise of confidentiality that cannot be checked is worth nothing,
so the limitations below are stated as plainly as the guarantees. They are not a roadmap
and not a promise that any of them will be closed.

## Reporting a vulnerability

Report suspected vulnerabilities **privately**, through this repository's
**Security → Report a vulnerability** flow. If that form is not available to you, write to
**support@openmasq.com** with `security` as the first word of the subject, and we will move
the thread to a private advisory. Either way, do not open a public issue, discussion or
pull request containing exploit details — an unfixed report read in the open arms whoever
is still running the affected version.

Include the affected version, the platform, the impact, and the smallest reproduction you
can safely provide. Do not test against accounts or deployments that are not yours, and do
not access data that is not yours.

---

## What the product protects

**The redaction boundary.** Values the engine detects are replaced before any network
call, and restored only in the user's own copy. What is covered, exactly — the catalogue is
`packages/catalog/src/redaction/`, and `SECURITY.categories.test.ts` pins this paragraph to
it, so a category added or retired in the code fails CI until this list follows:

- **On by default (15).** Names, dates of birth, e-mail addresses, phone numbers,
  addresses, places, companies, cards, IBANs, national identifiers, company identifiers,
  IPs, file paths, secrets, API keys.
- **Off unless you turn them on (2).** Handles (`username`) and URLs. URLs are raised by
  the Strict level; both are off at the default level because redacting every link makes
  ordinary chat unusable, and that trade is the user's to make, not ours to hide.
- **Retired — these cannot be enabled at all (3).** Health data, bare numbers, salaries.
  The detectors were withdrawn rather than left half-working, and the send path forces the
  three off even against a persisted setting or an org policy that still names them. **If
  you are evaluating this tool for medical, insurance or payroll data, read that as: a
  diagnosis or a bare account number in a message is NOT removed.**

The engine runs on-device (deterministic rules, checksums, shape detectors, then a local
NER model).

**Fail closed.** On an error, a timeout or an unknown, the secure outcome is the default:
the send is blocked, the tool result is masked, the tool call is refused. A redaction engine
that could not run does **not** silently degrade to weaker detection — the send is refused.

**The outward leg is unconditional.** Every tool call leaves with the real value and its
result returns redacted, through the same vault. Which categories are protected governs what
the **model** sees, and nothing else.

**Allow-lists, not deny-lists.** Browser tools, connector catalog entries, fetch hosts and
tool-result clear-lists all enumerate what is permitted. A new primitive appearing in a
dependency is denied by default rather than silently exposed.

**Process isolation.** Seven things run outside the privileged process, each because
collapsing it back would be a real weakening: the agent browser (CDP is process-global), the
@playwright/mcp server (third-party code), the Python sandbox (model-generated code running
on de-redacted data, under an OS jail), the PDF print window, the filesystem worker, the NER
and embedding workers. The local MCP broker sidecar is an eighth, spawned the same way.

**The renderer is untrusted.** Every gate the interface shows is UX; the real decision is
re-taken in the privileged process, because a renderer XSS can call any exposed IPC directly.

**Secrets at rest.** Provider keys are write-only from the interface — set and cleared,
never read back — and are injected into the provider call in the privileged process. The
local database, the file blobs and the debug log are encrypted per account.

**Integrity-pinned assets.** OCR traineddata, OCR models, NER weights and the Python runtime
are baked into the build and sha256-verified before they reach a parser or an interpreter.
Each is fetched at *build* time from its vendor's canonical origin, at a pinned commit, and
verified against a digest held in the source. A normal packaged run downloads none of them.
One asset can still fall back to a runtime download when its baked directory is missing from
the build — see **Baked assets have one runtime fallback** under Known limitations.

**Egress is recorded.** Every outbound decision passes one SSRF floor, which records the
origin contacted (or refused) per account, visible in Settings → Journal. Origins only —
never a path or a query, because a signed URL carries its token there.

**Cross-device sync is end-to-end encrypted.** The server stores ciphertext only; keys derive
from a passphrase the user holds. Connector OAuth tokens are **not** synced — each device
performs its own authorization. A vault blob is bound to its conversation as authenticated
data, so a hostile server cannot serve conversation A's vault for B; blobs written before
that binding existed are still readable and carry no such tie, and were deliberately not
rewritten — an account holding them keeps that residual until they are re-encrypted.

---

## Trust boundaries and assumptions

- **The user's machine is trusted.** The app protects data from leaving it; it does not
  protect against a compromised operating system, a malicious local user with the account's
  session, or physical access to an unlocked machine.
- **Model providers receive what is sent to them** — that is, the redacted text. The product
  does not control their retention. When its own gateway is used, it sees the same
  redacted text and meters credits on it.
- **Connected services receive real values**, by necessity: a search for a substitute finds
  nobody. Whoever connects a service inherits that service's exposure.
- **Web pages and tool results are hostile input.** They are data, never instructions. The
  gates around them are damage limitation, not a proof.
- **The model is not an authorization boundary.** It proposes; the deterministic gates and
  the user's confirmations dispose.
- **An organization admin sets policy, and can see audit data.** Mandated redaction
  categories cannot be disabled or revealed by a member.
- **An approval means a human accepted the displayed action** with the information shown at
  that moment — not that the resulting behaviour is safe.

---

## Known limitations

Each of these is a real, currently-open gap. They are documented at the code that owns them;
this list is the consolidated view.

**Redaction is detection, and detection is imperfect.**
- A value no detector recognises ships in clear. The manual "Redact" gesture and the
  Vault (the always-masked terms, « Coffre » in the French UI) exist because of this, and
  the Vault is the only *guarantee* of coverage for a given string.
- **PII baked into pixels that OCR never read is invisible to every gate**, including the
  per-value proof that guards sending a document as redacted images.
- The vault-pollution cleanup can drop a genuinely real file path, which would then ship in
  clear on the next send. This one is fail-**open** and is stated as such at the code.
- A substitute the model *translates* (`[PERSON1]` → `[PERSONNE1]`) is not restored.

**Prompt injection is bounded, not solved.**
- Inbound content is **labelled and screened, not filtered**. Tool results and pages arrive
  wrapped in a provenance marker telling the model they are data; a free heuristic pre-filter
  runs on all of them, and a model classifier only on external content it flagged. The
  screening **marks** — it never removes content, because a false positive would silently
  amputate a legitimate result. It is a heuristic, not a guarantee, and it does not cover
  content the pre-filter does not recognise.
- The remaining defences are on the outbound leg: a domain allow-list, exfiltration scans over
  tool arguments and navigation URLs, and confirmation cards.
- The product **knowingly accepts** that an injected model can steer a real value into a URL
  it constructs. The allow-list, the navigation exfil scan and the confirm card are the line;
  they are heuristics.
- Tool names are heuristically classified as read or write. A tool named to deceive
  (`fetch_customer` that deletes) is caught only by the argument-exfiltration backstop, if at
  all.

**The confirmation model has an accepted hole in `standard` mode.**
- In the default `standard` mode, an ordinary write is confirmed by an in-window card only,
  so a renderer XSS could dispatch a write without a confirmation the user sees. What bounds
  it: the mode itself is owned by the privileged process, and *downgrading* from `renforcé`
  to `standard` requires a confirmation on an un-spoofable system window. `renforcé` routes
  writes through that window.

**Organization policy is enforced in the privileged process, but from an unverified list.**
- A blocked connector is now refused at tool dispatch, at connect, and when the same service
  is re-added by URL. The list itself still arrives from the interface, so a renderer
  compromise that clears it clears the policy; everything short of that is closed.
- The confirmation posture an organization imposes is a floor, composed by taking the
  stricter of floor and member choice. That direction is deliberate: an unverified floor can
  only ever add confirmations, never remove one.

**Encryption at rest is not guaranteed on every install.**
- A distributed build that cannot reach the OS keyring (Linux without libsecret, a transient
  failure) opens the database **in plaintext** rather than locking the user out. This is
  surfaced by a loud one-time security log and a native dialog naming the risk, and
  `OPENMASQ_REQUIRE_DB_ENCRYPTION=1` makes it fail instead. The real fix — a
  passphrase-derived key when no keychain is available — is not implemented.
- The same fallback applies to the two sync secrets — the passphrase and the device secret
  — which are written base64-encoded rather than encrypted when the keyring is unreachable.
  The passphrase is the key that decrypts every device's vault for the account, so this is
  the more consequential of the two fallbacks. It is announced by a log line only: there is
  no dialog and no `OPENMASQ_REQUIRE_…` switch to make it fail instead, unlike the database
  above. The files keep a `.enc` name in that case, which is misleading, and the surrounding
  permissions (`0600`) are all that stands between the passphrase and another local account.
- Development builds are plaintext on purpose.

**The agent browser cannot pin its own DNS.**
- Chromium re-resolves at connect time, so a true DNS-rebinding record (public when checked,
  private at connect) is detected only after the fact. Electron exposes no per-navigation
  resolver pin. Actions taken inside the browser also do not re-enter the write gate; they
  rely on the browser tool allow-list and the navigation gates.

**The Python sandbox is not equally strong on every platform.**
- Windows is an unjailed prototype. On macOS and Linux the jail is real but the read side is
  deliberately broad (the interpreter needs its standard library and dynamic libraries).
- Wheel installation verifies hashes; the residual is a CI-time index compromise. End users
  receive a whole-runtime signature instead.

**Baked assets have one runtime fallback.**
- The OCR language data is bundled and sha256-verified, but the code that points the engine
  at the bundle is conditional on that directory being present. A packaged build whose bake
  step did not produce it — or whose resource path does not resolve — leaves the engine on
  its library default instead, which fetches the language data over the network from a
  public CDN with **no digest to check it against**, and hands the bytes to the OCR parser.
  That parser is native code, and it runs in a process that holds decrypted content. The
  same pinning applies to the OCR detection models, which additionally refuse an unpinned
  model outright; the language data does not yet do the same. Nothing else — no model, no
  wheel, no binary, no executable code — has a network path at runtime.

**Model provenance is not fully first-party.**
- The NER weights originate from a community re-upload of a public multilingual model. The
  desktop build bakes them sha256-pinned and offline; development builds pin the commit
  only. A first-party re-export is the intended fix and is not done.

**Other stated residuals.**
- An `openai-compat` endpoint that is genuinely remote cannot carry a stored key safely: the
  key is attached only for loopback and private-network endpoints and is otherwise dropped.
- The feedback endpoint has no rate limit.
- On sync, the account token can register fresh devices; a per-device scoped token is
  follow-up work. The browser extension (maintained outside this repo) is push-only by server-enforced capability, with one
  deliberate read exception for the Vault's terms, which it must pull to enforce them.
- Three main-process channels fetch a URL the renderer chose — the model call itself
  (`chat:*`), the batch page reader (`web:fetch-many`) and the embeddings endpoint. Each is
  constrained to public hosts by the SSRF guard, and none is constrained to hosts the app
  observed in received content. Script execution in the renderer can therefore send data to
  a public host of its choosing. The first is the model call, so it cannot be closed without
  main knowing the gateway origin; the other two are accepted alongside it, because closing
  them would refuse a URL the user typed and a self-hosted embedder while leaving the
  attacker the first.
- The egress log is best-effort evidence: it is flushed on a short debounce and on quit,
  so a hard kill loses the last seconds. Nothing depends on it.

---

## Supply chain

- **Dependency cooldown.** A package version published less than **three days** ago cannot be
  resolved into the lockfile (`minimumReleaseAge` in `pnpm-workspace.yaml`). The npm attack
  pattern — a stolen maintainer token publishes a malicious patch release — is normally
  caught and unpublished within hours. Only resolution is affected; `--frozen-lockfile`
  installs are unaffected, and an urgent security patch can be taken explicitly with
  `--config.minimumReleaseAge=0`.
- **CI actions are pinned to commit SHAs**, never tags. A tag is a mutable pointer its owner
  can re-aim at code that would then run with the job's secrets. Enforced by
  `pnpm check:actions`.
- **Dependency advisories** are triaged by surface, not by count. `pnpm audit:gate`
  separates advisories that reach a shipped or internet-facing workspace from the
  development and build tooling that never ships, and fails on the former. **It is not a
  required check today**: it runs on a weekly schedule and on demand, and no pull request is
  blocked by it. Treating it as a merge gate waits on the open findings it currently
  reports. Two limits are worth knowing when reading its verdict: it only considers `high`
  and `critical`, so an advisory rated `moderate` on an internet-facing service does not
  appear; and it decides shipped-versus-development from the dependency path the audit
  reports, so a package reached by both a build tool and a shipped one can be classified by
  the wrong path.
- **Nothing privileged is fetched at runtime.** Models, wheels, traineddata and binaries are
  baked at build time and hash-verified.

## Supported versions

Security fixes are made on the current release and the main branch. Older releases may
require upgrading.

---

# Politique de sécurité

Le produit est une application de bureau dont la raison d'être est de garder les données
sensibles sur la machine de l'utilisateur : le texte est masqué avant de partir, le modèle ne
reçoit jamais que des substituts, et la réponse est restaurée localement depuis un coffre
propre à la conversation. Ce document énonce ce que cette conception garantit et ce qu'elle ne
garantit pas.

Il est écrit pour être lu par quelqu'un qui décide s'il fait confiance au produit — un
utilisateur, un DPO, un relecteur sécurité. Une promesse de confidentialité invérifiable ne
vaut rien : les limites ci-dessous sont donc énoncées aussi platement que les garanties. Elles
ne sont ni une feuille de route ni la promesse que l'une d'elles sera comblée.

## Signaler une faille

Signalez une faille présumée **en privé**, par le parcours **Security → Report a
vulnerability** de ce dépôt. Si ce formulaire ne vous est pas accessible, écrivez à
**support@openmasq.com** avec `security` comme premier mot de l'objet, et nous basculerons le
fil vers un avis privé. Dans les deux cas, n'ouvrez pas d'issue, de discussion ou de pull
request publique contenant les détails d'un exploit — un signalement non corrigé lu au grand
jour arme quiconque fait encore tourner la version affectée.

Indiquez la version affectée, la plateforme, l'impact et la plus petite reproduction que vous
puissiez fournir sans risque. Ne testez pas contre des comptes ou des déploiements qui ne sont
pas les vôtres, et n'accédez pas à des données qui ne sont pas les vôtres.

---

## Ce que le produit protège

**La frontière de masquage.** Les valeurs que le moteur détecte sont remplacées avant tout
appel réseau, et restaurées seulement dans la copie de l'utilisateur. Ce qui est couvert,
exactement — le catalogue est `packages/catalog/src/redaction/`, et
`SECURITY.categories.test.ts` épingle ce paragraphe dessus : une catégorie ajoutée ou
retirée dans le code fait échouer la CI tant que cette liste ne suit pas :

- **Actives par défaut (15).** Noms, dates de naissance, adresses e-mail, numéros de
  téléphone, adresses, lieux, entreprises, cartes, IBAN, identifiants nationaux,
  identifiants d'entreprise, IP, chemins de fichiers, secrets, clés d'API.
- **Inactives sauf si vous les activez (2).** Les pseudonymes (`username`) et les URL. Le
  niveau Strict lève les URL ; les deux sont inactives au niveau par défaut parce que
  masquer chaque lien rend une conversation ordinaire inutilisable — cet arbitrage
  appartient à l'utilisateur, il n'est pas à nous de le dissimuler.
- **Retirées — celles-ci ne peuvent pas être activées du tout (3).** Données de santé,
  nombres bruts, salaires. Les détecteurs ont été retirés plutôt que laissés à moitié
  fonctionnels, et le chemin d'envoi force les trois à l'arrêt même contre un réglage
  persisté ou une politique d'organisation qui les nomme encore. **Si vous évaluez cet
  outil pour des données médicales, d'assurance ou de paie, lisez cela comme : un
  diagnostic ou un numéro de compte brut dans un message n'est PAS retiré.**

Le moteur tourne sur l'appareil (règles déterministes, sommes de contrôle, détecteurs de
forme, puis un modèle NER local).

**Échouer fermé.** En cas d'erreur, d'expiration ou d'inconnu, le résultat sûr est le défaut :
l'envoi est bloqué, le résultat d'outil est masqué, l'appel d'outil est refusé. Un moteur de
masquage qui n'a pas pu tourner ne se dégrade **pas** en silence vers une détection plus
faible — l'envoi est refusé.

**Le trajet vers l'extérieur est inconditionnel.** Chaque appel d'outil part avec la vraie
valeur et son résultat revient masqué, par le même coffre. Les catégories protégées
gouvernent ce que voit le **modèle**, et rien d'autre.

**Des listes d'autorisation, pas d'interdiction.** Les outils du navigateur, les entrées du
catalogue de connecteurs, les hôtes de `fetch` et les listes de résultats d'outils laissés en
clair énumèrent tous ce qui est permis. Une primitive nouvellement apparue dans une dépendance
est refusée par défaut plutôt qu'exposée en silence.

**L'isolation des processus.** Sept choses tournent hors du processus privilégié, chacune
parce que la replier serait un affaiblissement réel : le navigateur agent (CDP est global au
processus), le serveur @playwright/mcp (code tiers), le bac à sable Python (du code écrit par
le modèle tournant sur des données démasquées, sous une prison de l'OS), la fenêtre
d'impression PDF, le worker de système de fichiers, les workers NER et d'embeddings. Le
sidecar du broker MCP local est un huitième, lancé de la même façon.

**Le renderer n'est pas de confiance.** Chaque porte que l'interface montre est de l'UX ; la
vraie décision est reprise dans le processus privilégié, parce qu'un XSS dans le renderer peut
appeler directement n'importe quel IPC exposé.

**Les secrets au repos.** Les clés de fournisseur sont en écriture seule depuis l'interface —
posées et effacées, jamais relues — et sont injectées dans l'appel au fournisseur par le
processus privilégié. La base locale, les blobs de fichiers et le journal de débogage sont
chiffrés par compte.

**Des ressources épinglées par empreinte.** Les traineddata et les modèles d'OCR, les poids
NER et le runtime Python sont cuits dans le build et vérifiés en sha256 avant d'atteindre un
analyseur ou un interpréteur. Chacun est récupéré au moment du *build* depuis l'origine
canonique de son éditeur, sur un commit épinglé, et vérifié contre une empreinte gardée dans
les sources. Une exécution packagée normale n'en télécharge aucun. Une ressource peut encore
retomber sur un téléchargement à l'exécution si son répertoire cuit manque au build — voir
**Les ressources cuites ont un repli à l'exécution** dans les limites connues.

**Les sorties réseau sont consignées.** Chaque décision sortante passe par un plancher SSRF
unique, qui consigne par compte l'origine contactée (ou refusée), visible dans Réglages →
Journal. Les origines seulement — jamais un chemin ni une requête, parce qu'une URL signée y
porte son jeton.

**La synchronisation entre appareils est chiffrée de bout en bout.** Le serveur ne stocke que
du chiffré ; les clés dérivent d'une phrase secrète que l'utilisateur détient. Les jetons OAuth
des connecteurs ne sont **pas** synchronisés — chaque appareil fait sa propre autorisation.
Un coffre est lié à sa conversation en donnée authentifiée : un serveur hostile ne peut pas
servir le coffre de la conversation A pour B. Les coffres écrits avant l'existence de ce
lien restent lisibles et n'en portent aucun ; ils n'ont délibérément pas été réécrits — un
compte qui en détient conserve ce résidu jusqu'à leur rechiffrement.

---

## Frontières de confiance et hypothèses

- **La machine de l'utilisateur est de confiance.** L'application empêche les données d'en
  sortir ; elle ne protège pas contre un système d'exploitation compromis, un utilisateur
  local malveillant disposant de la session du compte, ou un accès physique à une machine
  déverrouillée.
- **Les fournisseurs de modèles reçoivent ce qu'on leur envoie** — c'est-à-dire le texte
  masqué. Le produit ne contrôle pas leur rétention. Quand sa propre passerelle est utilisée,
  elle voit le même texte masqué et compte les crédits dessus.
- **Les services connectés reçoivent de vraies valeurs**, par nécessité : chercher un
  substitut ne trouve personne. Qui connecte un service hérite de l'exposition de ce service.
- **Les pages web et les résultats d'outils sont des entrées hostiles.** Ce sont des données,
  jamais des instructions. Les portes qui les entourent limitent les dégâts, elles ne
  démontrent rien.
- **Le modèle n'est pas une frontière d'autorisation.** Il propose ; les portes déterministes
  et les confirmations de l'utilisateur disposent.
- **Un administrateur d'organisation fixe la politique et peut voir les données d'audit.** Les
  catégories de masquage imposées ne peuvent être ni désactivées ni révélées par un membre.
- **Une approbation signifie qu'un humain a accepté l'action affichée** avec l'information
  montrée à cet instant — pas que le comportement qui en découle est sûr.

---

## Limites connues

Chacune est un manque réel et actuellement ouvert. Elles sont documentées au niveau du code
qui les porte ; cette liste en est la vue consolidée.

**Le masquage est une détection, et une détection est imparfaite.**
- Une valeur qu'aucun détecteur ne reconnaît part en clair. Le geste manuel « Masquer » et le
  Coffre (les termes toujours masqués) existent pour cela, et le Coffre est la seule
  *garantie* de couverture pour une chaîne donnée.
- **Des données personnelles cuites dans des pixels que l'OCR n'a jamais lus sont invisibles à
  toutes les portes**, y compris à la preuve valeur par valeur qui garde l'envoi d'un document
  sous forme d'images masquées.
- Le nettoyage de la pollution du coffre peut écarter un chemin de fichier réellement vrai, qui
  partirait alors en clair à l'envoi suivant. Celui-ci échoue **ouvert** et le dit à l'endroit
  du code.
- Un substitut que le modèle *traduit* (`[PERSON1]` → `[PERSONNE1]`) n'est pas restauré.

**L'injection de prompt est bornée, pas résolue.**
- Le contenu entrant est **étiqueté et examiné, pas filtré**. Les résultats d'outils et les
  pages arrivent enveloppés d'un marqueur de provenance qui dit au modèle que ce sont des
  données ; un pré-filtre heuristique gratuit tourne sur tous, et un classifieur modèle
  seulement sur le contenu externe qu'il a signalé. L'examen **marque** — il ne retire jamais
  de contenu, parce qu'un faux positif amputerait en silence un résultat légitime. C'est une
  heuristique, pas une garantie, et elle ne couvre pas le contenu que le pré-filtre ne
  reconnaît pas.
- Les défenses restantes sont sur le trajet sortant : une liste de domaines autorisés, des
  analyses d'exfiltration sur les arguments d'outils et les URL de navigation, et des cartes de
  confirmation.
- Le produit **accepte sciemment** qu'un modèle sous injection puisse glisser une vraie valeur
  dans une URL qu'il construit. La liste d'autorisation, l'analyse d'exfiltration à la
  navigation et la carte de confirmation sont la ligne ; ce sont des heuristiques.
- Les noms d'outils sont classés en lecture ou écriture par heuristique. Un outil nommé pour
  tromper (`fetch_customer` qui supprime) n'est rattrapé que par le filet d'exfiltration sur
  les arguments, s'il l'est.

**Le modèle de confirmation a un trou accepté en mode `standard`.**
- Dans le mode `standard` par défaut, une écriture ordinaire n'est confirmée que par une carte
  dans la fenêtre : un XSS dans le renderer pourrait donc déclencher une écriture sans
  confirmation visible par l'utilisateur. Ce qui la borne : le mode lui-même appartient au
  processus privilégié, et *redescendre* de `renforcé` à `standard` exige une confirmation sur
  une fenêtre système non usurpable. `renforcé` fait passer les écritures par cette fenêtre.

**La politique d'organisation est appliquée dans le processus privilégié, mais depuis une liste
non vérifiée.**
- Un connecteur bloqué est désormais refusé au dispatch d'outil, à la connexion, et quand le
  même service est rajouté par URL. La liste elle-même arrive encore de l'interface : une
  compromission du renderer qui la vide vide la politique ; tout ce qui est en deçà est fermé.
- La posture de confirmation qu'une organisation impose est un plancher, composé en prenant le
  plus strict du plancher et du choix du membre. Cette direction est délibérée : un plancher
  non vérifié ne peut jamais qu'ajouter des confirmations, jamais en retirer une.

**Le chiffrement au repos n'est pas garanti sur toutes les installations.**
- Un build distribué qui n'atteint pas le trousseau de l'OS (Linux sans libsecret, une panne
  passagère) ouvre la base **en clair** plutôt que d'enfermer l'utilisateur dehors. C'est
  signalé par un log de sécurité bruyant, une seule fois, et par une boîte de dialogue native
  qui nomme le risque, et `OPENMASQ_REQUIRE_DB_ENCRYPTION=1` le fait échouer à la place. Le
  vrai correctif — une clé dérivée d'une phrase secrète quand aucun trousseau n'est disponible
  — n'est pas implémenté.
- Le même repli s'applique aux deux secrets de synchronisation — la phrase secrète et le
  secret d'appareil — qui sont écrits encodés en base64 plutôt que chiffrés quand le trousseau
  est inaccessible. La phrase secrète est la clé qui déchiffre le coffre de tous les appareils
  du compte : c'est donc le plus lourd de conséquences des deux replis. Il n'est annoncé que
  par une ligne de log : il n'y a ni dialogue ni interrupteur `OPENMASQ_REQUIRE_…` pour le
  faire échouer, contrairement à la base ci-dessus. Les fichiers gardent dans ce cas un nom en
  `.enc`, ce qui induit en erreur, et les permissions autour (`0600`) sont tout ce qui sépare
  la phrase secrète d'un autre compte local.
- Les builds de développement sont en clair, à dessein.

**Le navigateur agent ne peut pas épingler son propre DNS.**
- Chromium re-résout au moment de la connexion : un vrai enregistrement de DNS rebinding
  (public à la vérification, privé à la connexion) n'est donc détecté qu'après coup. Electron
  n'expose aucun épinglage de résolveur par navigation. Les actions faites dans le navigateur
  ne repassent pas non plus par la porte d'écriture ; elles s'appuient sur la liste
  d'autorisation des outils du navigateur et sur les portes de navigation.

**Le bac à sable Python n'est pas aussi solide sur toutes les plateformes.**
- Windows est un prototype sans prison. Sur macOS et Linux la prison est réelle mais le côté
  lecture est délibérément large (l'interpréteur a besoin de sa bibliothèque standard et de ses
  bibliothèques dynamiques).
- L'installation des wheels vérifie les empreintes ; le résiduel est une compromission de
  l'index au moment de la CI. Les utilisateurs finaux reçoivent à la place une signature du
  runtime entier.

**Les ressources cuites ont un repli à l'exécution.**
- Les données de langue de l'OCR sont embarquées et vérifiées en sha256, mais le code qui
  pointe le moteur vers le bundle est conditionné à la présence de ce répertoire. Un build
  packagé dont l'étape de bake ne l'a pas produit — ou dont le chemin de ressource ne se
  résout pas — laisse le moteur sur le défaut de sa bibliothèque, qui récupère les données de
  langue sur le réseau depuis un CDN public **sans empreinte pour les vérifier**, et remet les
  octets à l'analyseur OCR. Cet analyseur est du code natif, et il tourne dans un processus qui
  détient du contenu déchiffré. Le même épinglage s'applique aux modèles de détection de l'OCR,
  qui refusent en plus catégoriquement un modèle non épinglé ; les données de langue ne le font
  pas encore. Rien d'autre — aucun modèle, aucune wheel, aucun binaire, aucun code exécutable —
  n'a de chemin réseau à l'exécution.

**La provenance des modèles n'est pas entièrement de première main.**
- Les poids NER proviennent d'un ré-upload communautaire d'un modèle multilingue public. Le
  build de bureau les cuit épinglés en sha256 et hors ligne ; les builds de développement
  n'épinglent que le commit. Un ré-export de première main est le correctif prévu et n'est pas
  fait.

**Autres résiduels énoncés.**
- Un point d'accès `openai-compat` réellement distant ne peut pas porter une clé stockée sans
  risque : la clé n'est attachée que pour les points d'accès en loopback et sur réseau privé,
  et est abandonnée sinon.
- Le point d'accès des retours n'a pas de limite de débit.
- À la synchronisation, le jeton de compte peut enregistrer de nouveaux appareils ; un jeton
  restreint par appareil est un travail de suite. L'extension de navigateur (maintenue hors de
  ce dépôt) est en écriture seule par une capacité imposée côté serveur, avec une exception de
  lecture délibérée pour les termes du Coffre, qu'elle doit tirer pour les appliquer.
- Trois canaux du processus principal récupèrent une URL choisie par le renderer — l'appel au
  modèle lui-même (`chat:*`), le lecteur de pages en lot (`web:fetch-many`) et le point d'accès
  d'embeddings. Chacun est contraint aux hôtes publics par la garde SSRF, et aucun n'est
  contraint aux hôtes que l'application a observés dans du contenu reçu. Une exécution de script
  dans le renderer peut donc envoyer des données vers un hôte public de son choix. Le premier
  est l'appel au modèle : il ne peut pas être fermé sans que le processus principal connaisse
  l'origine de la passerelle ; les deux autres sont acceptés à côté, parce que les fermer
  refuserait une URL tapée par l'utilisateur et un service d'embeddings auto-hébergé tout en
  laissant le premier à l'attaquant.
- Le journal des sorties réseau est une preuve au mieux : il est vidé sur un court debounce et
  à la fermeture, donc une mort brutale perd les dernières secondes. Rien n'en dépend.

---

## Chaîne d'approvisionnement

- **Délai de refroidissement des dépendances.** Une version de paquet publiée depuis moins de
  **trois jours** ne peut pas être résolue dans le lockfile (`minimumReleaseAge` dans
  `pnpm-workspace.yaml`). Le schéma d'attaque npm — un jeton de mainteneur volé publie une
  version corrective malveillante — est normalement repéré et dépublié en quelques heures.
  Seule la résolution est concernée ; les installations `--frozen-lockfile` ne le sont pas, et
  un correctif de sécurité urgent peut être pris explicitement avec
  `--config.minimumReleaseAge=0`.
- **Les actions de CI sont épinglées à des SHA de commit**, jamais à des tags. Un tag est un
  pointeur mutable que son propriétaire peut re-viser vers du code qui tournerait alors avec
  les secrets du job. Tenu par `pnpm check:actions`.
- **Les avis de sécurité des dépendances** sont triés par surface, pas par nombre.
  `pnpm audit:gate` sépare les avis qui atteignent un workspace livré ou exposé à Internet de
  l'outillage de développement et de build qui ne part jamais, et échoue sur les premiers.
  **Ce n'est pas une vérification obligatoire aujourd'hui** : il tourne sur une planification
  hebdomadaire et à la demande, et aucune pull request n'est bloquée par lui. En faire une
  porte de fusion attend les constats ouverts qu'il rapporte actuellement. Deux limites méritent
  d'être connues à la lecture de son verdict : il ne considère que `high` et `critical`, donc un
  avis noté `moderate` sur un service exposé à Internet n'apparaît pas ; et il décide du
  caractère livré ou de développement d'après le chemin de dépendance que l'audit rapporte,
  donc un paquet atteint à la fois par un outil de build et par un paquet livré peut être classé
  par le mauvais chemin.
- **Rien de privilégié n'est récupéré à l'exécution.** Modèles, wheels, traineddata et binaires
  sont cuits au moment du build et vérifiés par empreinte.

## Versions suivies

Les correctifs de sécurité sont faits sur la version courante et sur la branche principale. Les
versions plus anciennes peuvent demander une mise à jour.
