# Destinataires autorisés pour une ÉCRITURE réelle

Copier ce fichier en `~/.openmasq-agent/comptes-autorises.md` et le remplir **à la main**.

**Son absence est la protection**, pas un oubli : sans lui, l'agent mène chaque parcours
d'écriture jusqu'à la fenêtre de confirmation — c'est là que se vérifie ce qui compte, ce que
la fenêtre annonce et si un refus refuse vraiment — puis il clique **Refuser**. Il n'enverra
rien à personne. Le remplir, c'est décider que ces destinataires-là peuvent recevoir pour de
vrai un message écrit par un agent qui tourne sans surveillance.

Un destinataire par ligne, sous la rubrique de son connecteur. Une ligne vide ou commentée
n'autorise rien. Ce fichier n'est **jamais** commité.

```
## e-mail
moi@exemple.fr

## slack
#openmasq-agent-bac-a-sable

## agenda
(le calendrier « Bac à sable », pas le principal)

## crm / notion / autres
(rien — donc rien n'est autorisé)
```

Deux conseils tirés de l'usage : préférez des destinataires **à vous** (auto-envoi, canal
dédié, calendrier dédié) — un agent autonome qui écrit à un client, même correctement, est un
message que personne n'a relu. Et gardez la liste **courte** : elle se relit d'un coup d'œil,
ce qui est exactement ce qu'on veut d'une liste d'autorisations.
