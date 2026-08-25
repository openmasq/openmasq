import { app } from "electron";

/**
 * « L'app est en train de se fermer » — l'état que tout rapporteur de mort d'un process
 * enfant doit consulter : la fermeture TUE les workers (NER, embed, fs, broker), et sans
 * cette porte chaque quit produirait quatre faux rapports de crash. UNE maison (règle 9) ;
 * le listener s'installe à l'import, avant tout fork.
 */
let quitting = false;
app.on("before-quit", () => {
  quitting = true;
});

export const isAppQuitting = (): boolean => quitting;
