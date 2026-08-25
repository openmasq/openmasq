/**
 * Per-fragment aliases for a PLACE faked as a composite — the identity family's third
 * member, beside `name.ts` and `email.ts`.
 *
 * The rule and its bounds live one layer down, in `engine/geo/composite.ts`, because the
 * REVERSE pass (`engine/vault.ts`) needs the same derivation to repair a vault written
 * before these aliases existed — and `engine/` may not import `model/`.
 */
export { placeFragments as placeAliases } from "../../engine/geo/composite";
