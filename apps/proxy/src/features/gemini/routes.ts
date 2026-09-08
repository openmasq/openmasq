// The Gemini family. A model name sits in the path (`/v1beta/models/gemini-2.5-pro:generateContent`)
// with a `:` Express would read as a parameter marker, hence the regular expressions. Mounted
// at `/` and at `/gemini` by `routes/index.ts`.
import type { Router } from "express";
import type { RelayDeps } from "../../lib/relay.js";
import generateContent from "./gemini_commands/generateContent.js";

export const GENERATE_PATH =
  /^\/v1(?:beta|alpha)?\/models\/[^/:]+:(?:generateContent|streamGenerateContent)$/;

export default (router: Router, deps: RelayDeps): Router => {
  router.post(GENERATE_PATH, generateContent(deps));
  return router;
};
