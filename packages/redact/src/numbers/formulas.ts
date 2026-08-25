// Computing back the formulas the model returns. When numbers are tokenised
// (n1, n2…), the downstream model can't do arithmetic on opaque symbols — so we
// ask it to answer with *formulas* in those tokens (e.g. `n1 - n2 + n3`).
// {@link computeTokenFormulas} then substitutes the real values and evaluates the
// expression locally, so the user sees the actual figure. Run it BEFORE
// `unredact` (while the tokens are still present).
import type { Vault } from "../types";

/** Instruction to give the downstream model so its numeric answers stay computable. */
export const NUMBER_TOKEN_INSTRUCTION = [
  "Some numbers in this conversation are replaced by symbolic tokens written",
  "n1, n2, n3, … Each nN is a fixed but hidden numeric value. NEVER guess or",
  "invent their values. When a numeric result is needed, express it as an",
  "explicit arithmetic formula using these tokens and the operators + - * / and",
  "parentheses (e.g. `n1 - n2 - n3 + n7`), keeping the tokens verbatim so it can",
  "be evaluated afterwards. You may simplify the formula but never replace a",
  "token with a made-up number.",
].join(" ");

/** Parse a human-written number ("850 000", "1 234,56", "1,000,000") to a JS number. */
function parseHumanNumber(raw: string): number | null {
  let s = raw.replace(/\s/g, "");
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(s)) {
    s = s.replace(/[.,]/g, ""); // pure thousands grouping -> integer
  } else if (/^\d+[.,]\d+$/.test(s)) {
    s = s.replace(",", "."); // single decimal separator
  } else {
    s = s.replace(/[.,]/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Safe arithmetic evaluator (+ - * / and parens) — recursive descent, no eval(). */
function evalArith(expr: string): number | null {
  let i = 0;
  const s = expr;
  const skip = () => {
    while (i < s.length && s[i] === " ") i++;
  };
  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    skip();
    while (s[i] === "+" || s[i] === "-") {
      const op = s[i++];
      const right = parseTerm();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
      skip();
    }
    return left;
  }
  function parseTerm(): number | null {
    let left = parseFactor();
    if (left === null) return null;
    skip();
    while (s[i] === "*" || s[i] === "/") {
      const op = s[i++];
      const right = parseFactor();
      if (right === null) return null;
      if (op === "/" && right === 0) return null;
      left = op === "*" ? left * right : left / right;
      skip();
    }
    return left;
  }
  function parseFactor(): number | null {
    skip();
    if (s[i] === "+") {
      i++;
      return parseFactor();
    }
    if (s[i] === "-") {
      i++;
      const v = parseFactor();
      return v === null ? null : -v;
    }
    if (s[i] === "(") {
      i++;
      const v = parseExpr();
      skip();
      if (s[i] !== ")") return null;
      i++;
      return v;
    }
    const m = /^\d+(?:\.\d+)?/.exec(s.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  }
  skip();
  const v = parseExpr();
  skip();
  return i === s.length ? v : null; // reject trailing junk
}

/** Format a number with spaces as thousands separators (e.g. 153000 -> "153 000"). */
function formatNumber(n: number): string {
  const neg = n < 0;
  const abs = Math.abs(n);
  const s = Number.isInteger(abs)
    ? abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")
    : abs.toString();
  return (neg ? "-" : "") + s;
}

// A run that could be an arithmetic formula: tokens / numbers / operators /
// parens / spaces. We then require it to contain a n-token AND an operator.
const FORMULA_RUN = /(?:n\d+|[\d.,]|[-+*/()]|\s)+/g;

/**
 * Replace every arithmetic formula written in n-tokens with its computed value,
 * using the originals stored in `vault`. Tokens that aren't numeric, or
 * expressions that don't parse, are left untouched. Reversible-safe: run this
 * before `unredact`.
 */
export function computeTokenFormulas(input: string, vault: Vault): string {
  const num = new Map<string, number>();
  for (const [token, value] of Object.entries(vault)) {
    if (/^n\d+$/.test(token)) {
      const n = parseHumanNumber(value);
      if (n !== null) num.set(token, n);
    }
  }
  if (num.size === 0) return input;

  return input.replace(FORMULA_RUN, (run) => {
    // Peel off surrounding whitespace and sentence punctuation so we can put it
    // back around the computed value (keeps "= " and a trailing "." intact).
    let start = 0;
    let end = run.length;
    while (start < end && /\s/.test(run[start])) start++;
    while (end > start && /[\s.,]/.test(run[end - 1])) end--;
    const lead = run.slice(0, start);
    const trail = run.slice(end);
    const trimmed = run.slice(start, end);
    if (!/n\d+/.test(trimmed) || !/[-+*/]/.test(trimmed)) return run;

    // Normalise to a clean expression: tokens -> values, numbers -> plain.
    let out = "";
    let i = 0;
    while (i < trimmed.length) {
      const rest = trimmed.slice(i);
      const tok = /^n\d+/.exec(rest);
      if (tok) {
        const v = num.get(tok[0]);
        if (v === undefined) return run; // unknown token -> can't compute
        out += String(v);
        i += tok[0].length;
        continue;
      }
      const c = trimmed[i];
      if ("+-*/()".includes(c)) {
        out += c;
        i++;
        continue;
      }
      if (/\d/.test(c)) {
        const m = /^\d[\d\u00a0\u202f .,]*\d|^\d/.exec(rest)!;
        const val = parseHumanNumber(m[0]);
        if (val === null) return run;
        out += String(val);
        i += m[0].length;
        continue;
      }
      if (c === " " || c === "\t") {
        out += " ";
        i++;
        continue;
      }
      return run; // unexpected char -> leave the run alone
    }

    const result = evalArith(out);
    return result === null || !Number.isFinite(result)
      ? run
      : lead + formatNumber(result) + trail;
  });
}
