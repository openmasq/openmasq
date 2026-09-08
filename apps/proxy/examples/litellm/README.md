# OpenMasq as a LiteLLM guardrail — what it would take

<sub>**English** · [Français](#openmasq-comme-garde-litellm--ce-quil-faudrait) · [openmasq.com](https://openmasq.com)</sub>

`openmasq_guardrail.py` is a design sketch. It answers one question — *what does slotting
OpenMasq into LiteLLM demand?* — and the answer is one concrete addition plus one decision.

**Why this matters.** LiteLLM's built-in PII masking runs on Presidio. On our corpus
(`packages/redact/bench`) Presidio's default install scored 46 % recall to the product's 95 %,
and its masking is not reversed the way a per-conversation vault reverses. A team already on
LiteLLM is the audience that gains the most, in a single config change.

**The gap: the proxy has no redaction-only endpoint.** Today `apps/proxy` relays *full LLM
calls* — it masks a request on its way to a provider and restores the provider's reply. A
LiteLLM guardrail does not want that: LiteLLM owns the provider call. It wants two smaller
operations, over loopback:

```
POST /redact    { text }              → { text: <masked>, masked: <count> }   (x-openmasq-session)
POST /unredact  { text }              → { text: <restored> }                  (x-openmasq-session)
```

Both already exist as functions — `createMasker().mask` / `.restoreReply`, keyed by
`VaultSessions` — so the addition is a thin non-LLM route pair reusing them, ~40 lines, guarded
like the rest (loopback only, JSON body or 400, fail closed). No new engine code.

**The decision it raises (rule 7).** `/unredact` returns REAL values to whoever holds the
session id. That is by design for the caller who did the masking, but it turns the proxy from
"nothing sensitive leaves the box" into "an HTTP surface that hands back the vault to a local
client." That is a genuine boundary change: it must stay loopback, the session id must be the
capability (unguessable, short-lived — `VaultSessions` already evicts after an hour), and it
should be OFF unless explicitly enabled (a `--redact-api` flag), so the default proxy keeps its
current, smaller surface. Worth a deliberate yes before it ships.

**If we build it**, wiring is the standard LiteLLM custom guardrail:

```yaml
guardrails:
  - guardrail_name: "openmasq"
    litellm_params:
      guardrail: openmasq_guardrail.OpenMasqGuardrail
      mode: "pre_call"          # mask the input; a second post_call entry restores the reply
```

⚠️ Streaming: LiteLLM runs `async_post_call_success_hook` on the fully assembled response, so
restore works but only after the last chunk. A token-by-token restore would need the
boundary-safe `StreamRestorer` the proxy already uses — a later step, not this sketch.

---

# OpenMasq comme garde LiteLLM — ce qu'il faudrait

<sub>[English](#openmasq-as-a-litellm-guardrail--what-it-would-take) · **Français** · [openmasq.com](https://openmasq.com)</sub>

`openmasq_guardrail.py` est une esquisse. Elle répond à une question — *que demande le
branchement d'OpenMasq dans LiteLLM ?* — et la réponse tient en un ajout concret et une
décision.

**Pourquoi c'est la meilleure cible.** Le masquage PII intégré de LiteLLM tourne sur Presidio.
Sur notre corpus, l'installation par défaut de Presidio faisait 46 % de rappel contre 95 % pour
le produit, sans la réversibilité par coffre. Une équipe déjà sous LiteLLM gagne le plus, en un
seul changement de config.

**Le manque : le proxy n'a pas de point de terminaison de masquage seul.** Aujourd'hui il relaie
des *appels LLM complets*. Une garde LiteLLM ne veut pas ça — LiteLLM détient l'appel au
fournisseur. Elle veut deux opérations plus petites, en boucle locale : `POST /redact` et
`POST /unredact`, portées par un `x-openmasq-session`. Les fonctions existent déjà
(`createMasker().mask` / `.restoreReply`, coffres par `VaultSessions`) : l'ajout est une paire
de routes non-LLM qui les réutilise, une quarantaine de lignes, gardée comme le reste.

**La décision qu'elle soulève (règle 7).** `/unredact` rend de vraies valeurs à qui détient
l'identifiant de session. C'est voulu pour l'appelant qui a masqué, mais ça fait passer le proxy
de « rien de sensible ne quitte la machine » à « une surface HTTP qui rend le coffre à un client
local ». C'est un vrai changement de frontière : boucle locale obligatoire, l'identifiant de
session comme capacité (imprévisible, courte durée — déjà expiré après une heure), et éteint sauf
activation explicite (un drapeau `--redact-api`), pour que le proxy par défaut garde sa surface
actuelle, plus petite. Cela mérite un oui délibéré avant d'être livré.
