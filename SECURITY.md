# Security policy

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

**The redaction boundary.** Values the engine detects — names, dates of birth, e-mail
addresses, phone numbers, addresses, places, companies, cards, IBANs, national and company
identifiers, IPs, numbers, file paths, health data, handles, URLs, keys and secrets — are
replaced before any network call, and restored only in the user's own copy. The engine runs
on-device (deterministic rules, checksums, shape detectors, then a local NER model).

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
performs its own authorization.

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
