import { describe, expect, it } from "vitest";
import { BRAND } from "@openmasq/branding";
import { isAiModelName } from "./modelNames";
import { isNotoriousEntity } from "./notorious";

describe("modelNames — la grammaire famille + version/variante", () => {
  it("reconnaît les étiquettes réelles du catalogue (l'audit du 13/08)", () => {
    for (const v of [
      "Claude Sonnet 4.6", "Claude Opus 4.8", "Claude Haiku 4.5", "Claude Fable 5",
      "GPT-5.5", "GPT-5.6 Luna", "GPT-4o mini", "GPT-4.1 nano", "GPT-OSS 120B",
      "o3", "o3-mini", "o4-mini",
      "Gemini 2.5 Pro", "Gemini 3.1 Flash-Lite", "Gemma 4 26B (gratuit)",
      "Llama 3.3 70B", "Llama 3.1 (local)", "Qwen3.5 397B", "Qwen 2.5 Coder (local)",
      "Mistral Large", "Mistral Medium 3.5", "Ministral 8B", "Pixtral 12B",
      "DeepSeek V4 Pro", "DeepSeek-R1", "Grok 4.20", "Kimi K2.6",
      "GLM-5.2", "Phi-4 (local)", "Nemotron 3 Ultra (gratuit)",
    ]) {
      expect(isAiModelName(v), v).toBe(true);
    }
  });

  it("refuse ce qui n'a pas la forme : prénoms nus, marques hors familles, bruit", () => {
    for (const v of [
      "Claude", "Gemini", "Mistral", // nus — l'affaire de notorious.ts / des prénoms
      "Renault 5", "Peugeot 208", "Marie 3", "Chapitre 12", "Windows 11",
      "le chat noir", "Sonnet 18 de Shakespeare",
    ]) {
      expect(isAiModelName(v), v).toBe(false);
    }
  });

  // ⚠️ AUDIT 13/08 — la GRAMMAIRE reste étroite sur ces mots nus (elle est insensible à
  // la catégorie, donc les dispenser ici les ferait fuir en tant que PERSONNE aussi). Ce
  // sont bien des noms d'outils, mais ils sont dispensés par la liste ORGS SCOPÉE
  // company (voir le test de portée plus bas), pas par la forme.
  it("la grammaire ne couvre pas les mots nus ambigus (ORGS s'en charge, category-scopé)", () => {
    for (const v of [
      "Opus", "Sonnet", "Haiku", "Gemma", "Kimi", "Grok", "Llama", "Qwen", "Gpt", "Le Chat",
    ]) {
      expect(isAiModelName(v), v).toBe(false);
    }
  });

  it("REFUSE les références et identifiants que la forme frôlait", () => {
    for (const v of [
      "PHI-2024-001", "O-123456", "NORTH-2024", "LAGUNA-1998",
      "REF-2024-001", "DOSSIER-2024", "HOLO-847362",
    ]) {
      expect(isAiModelName(v), v).toBe(false);
    }
  });

  it("mais la série « o » d'OpenAI et les vraies versions passent toujours", () => {
    for (const v of ["o3", "o3-mini", "o4-mini", "GPT-4o", "GLM-5.2", "Phi-4", "Holo2 30B"]) {
      expect(isAiModelName(v), v).toBe(true);
    }
  });
});

describe("notorious ⇄ modelNames — la portée par catégorie", () => {
  const std = { commercial: true, people: true };
  const strict = { commercial: false, people: false };

  it("company : un nom de modèle passe à TOUS les niveaux (comme ChatGPT/Excel)", () => {
    for (const v of ["Claude Sonnet 4.6", "GPT-5.5", "Gemini 2.5 Pro", "Qwen3.6 35B"]) {
      expect(isNotoriousEntity(v, "company", std), v).toBe(true);
      expect(isNotoriousEntity(v, "company", strict), v).toBe(true);
    }
  });

  it("name : le produit mal-lu passe (multi-mots ou chiffré), le PRÉNOM nu reste protégé", () => {
    expect(isNotoriousEntity("Claude Sonnet 4.6", "name", std)).toBe(true);
    expect(isNotoriousEntity("GPT-4o", "name", std)).toBe(true);
    expect(isNotoriousEntity("Claude", "name", std)).toBe(false);
    expect(isNotoriousEntity("Gemini", "name", std)).toBe(false);
  });

  it("les outils que l'app cite passent en company : Ollama, LM Studio, l'app elle-même…", () => {
    for (const v of ["Ollama", "LM Studio", "OpenRouter", "Cursor", "VS Code", "Claude Code", BRAND.name]) {
      expect(isNotoriousEntity(v, "company", std), v).toBe(true);
    }
  });

  // Les familles de modèles en un mot (« compare Opus et Sonnet ») : dispensées en tant
  // qu'OUTIL, à TOUS les niveaux — décision produit 13/08. Mais SCOPÉES : la même graphie
  // reste protégée en tant que PERSONNE (un prénom Gemma/Kimi ne fuit pas).
  it("les noms d'outils nus : dispensés en company (Strict compris), protégés en name", () => {
    const strict = { commercial: false, people: false };
    for (const v of ["Opus", "Sonnet", "Haiku", "Gemma", "Kimi", "Grok", "Llama", "Qwen", "Le Chat"]) {
      expect(isNotoriousEntity(v, "company", strict), `${v} company`).toBe(true);
    }
    // Les mots d'UN SEUL tenant restent protégés en PERSONNE (un prénom ne fuit pas) ;
    // « Le Chat » est multi-mots, donc dispensé aussi en name par la règle org-mal-lu
    // existante — une personne nommée « Le Chat » est invraisemblable (c'est la marque).
    for (const v of ["Opus", "Sonnet", "Haiku", "Gemma", "Kimi", "Grok", "Llama", "Qwen"]) {
      expect(isNotoriousEntity(v, "name", strict), `${v} name`).toBe(false);
    }
  });

  // ⚠️ AUDIT 13/08 — le gate de FRAGMENT (`pseudonymize/textContext.ts`) recompose
  // « valeur + voisin » ; avec la grammaire de forme, « madame Claude 3 fois » libérait
  // « Claude ». `shape: false` l'exclut, et c'est ce que ce test épingle.
  it("shape:false neutralise la grammaire de forme (le chemin du gate de fragment)", () => {
    const noShape = { ...std, shape: false as const };
    for (const v of ["Claude 3", "Claude 45", "Gemma 2", "Kimi 4"]) {
      expect(isNotoriousEntity(v, "name", noShape), v).toBe(false);
    }
    // …sans toucher aux entités NOMMÉES, qui restent dispensées par la liste fermée.
    expect(isNotoriousEntity("ChatGPT", "company", noShape)).toBe(true);
    expect(isNotoriousEntity("Pôle emploi", "company", noShape)).toBe(true);
  });
});
