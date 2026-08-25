/* La démonstration du redaction — une phrase, deux fois : ce que vous écrivez, ce que le
   modèle reçoit. Promue ici (feuille partagée) le jour où l'AIDE l'a montrée elle aussi :
   c'est l'explication la plus claire du produit, et elle ne devait pas disparaître avec
   le premier lancement. */
// Seul le composant sort d'ici : `demo.ts` est importé DIRECTEMENT par ce qui en a
// besoin (le composant, son test). Un barrel qui ré-exporte plus large crée du code
// mort que `check:knip` compte — et que personne ne peut atteindre.
export { RedactionDemo } from "./RedactionDemo";
