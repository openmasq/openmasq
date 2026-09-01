/**
 * The starter TEMPLATES contract — the routines and skills the app offers
 * when the list is empty.
 *
 * Their `prompt` PRE-FILLS the person's message: it is therefore not prose
 * for the model (which follows the conversation's language and stays out of the catalogue),
 * but text they will read, edit and send. It translates like the rest.
 *
 * The STRUCTURE stays in the code (`suggestions/`): the id, the order, each routine's
 * connectors, each skill's category. Here, only the words.
 */

export interface TemplateCopy {
  name: string;
  desc: string;
  prompt: string;
}

export interface TemplatesMessages {
  /** One routine per id of the `ROUTINE_SUGGESTIONS` catalogue. */
  routines: Record<string, TemplateCopy>;
  /** One skill per id of the `COMPETENCE_SUGGESTIONS` catalogue. */
  skills: Record<string, TemplateCopy>;
  /** The idea BUILT for a connector the curated list does not cover. */
  generic: {
    name: (service: string) => string;
    desc: (what: string) => string;
    prompt: (service: string) => string;
  };
}
