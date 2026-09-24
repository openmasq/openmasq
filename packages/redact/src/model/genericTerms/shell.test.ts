import { describe, it, expect } from "vitest";
import { isGenericTerm, isNonPiiTerm, isShellCommandOccurrence } from "./index";
import { SHELL_TERMS, SHELL_CONTEXT_TERMS } from "../vocab/shell";
import { FIRST_NAMES } from "../../engine/names/firstNames.data";

/**
 * The shell volume, both halves. The flat one is an ordinary allow-list; the
 * context-scoped one is the interesting part — it is what lets `ls` and `ruby` be
 * commands without letting them spare somebody's initials or somebody's name.
 */
describe("shell commands are never faked", () => {
  it("spares a command name outright when it can only be a command", () => {
    for (const cmd of ["echo", "grep", "chmod", "awk", "curl", "xargs", "systemctl", "tar"])
      expect(isGenericTerm(cmd), cmd).toBe(true);
  });

  /**
   * The volume covers the whole terminal, not only coreutils: an interpreter, a compiler,
   * a package manager, a container/cloud CLI, a database client or a media tool is typed
   * exactly like `grep` and gets faked exactly like it. One name per family — the point is
   * the family, not the sample.
   */
  it("spares the developer families, not only the UNIX base", () => {
    const families = [
      "node", "python3", "perl", "php", "java", "cargo", "dotnet", // interpreters/compilers
      "gcc", "clang", "make", "cmake", "bazel", "gradle", // build
      "npm", "pnpm", "pip", "apt-get", "pacman", "brew", // package managers
      "docker", "podman", "kubectl", "terraform", "ansible", "gcloud", // infra & cloud
      "psql", "mysqldump", "sqlite3", "mongosh", "redis-cli", // databases
      "ffmpeg", "exiftool", "pandoc", "tesseract", // media & documents
      "nginx", "haproxy", "journalctl", "openssl", "shellcheck", // daemons, ops, quality
    ];
    expect(families.filter((c) => !isGenericTerm(c))).toEqual([]);
  });

  it("keeps the flat half clear of the two traps the volumes bound", () => {
    const key = (x: string) => x.trim().toLowerCase().replace(/[.\s_'’-]+/g, "");
    expect(SHELL_TERMS.filter((t) => key(t).length <= 2)).toEqual([]);
    expect(SHELL_TERMS.filter((t) => FIRST_NAMES.has(key(t)))).toEqual([]);
  });

  it("never spares a context-scoped command on its own", () => {
    for (const cmd of SHELL_CONTEXT_TERMS) expect(isGenericTerm(cmd), cmd).toBe(false);
    // …not even inside a sentence that merely CONTAINS the word.
    expect(isShellCommandOccurrence("ls", "la ls des présents est jointe")).toBe(false);
    expect(isShellCommandOccurrence("ping", "Ping Wei anime la réunion de lundi")).toBe(false);
  });

  it("spares it where the text proves a command line", () => {
    expect(isShellCommandOccurrence("ls", "ls -la /var/log")).toBe(true);
    expect(isShellCommandOccurrence("rm", "sudo rm build.log")).toBe(true);
    expect(isShellCommandOccurrence("jq", "cat data.json | jq '.items'")).toBe(true);
    expect(isShellCommandOccurrence("go", "$ go build ./cmd/server")).toBe(true);
    expect(isShellCommandOccurrence("cd", "  cd ~/projets && make")).toBe(true);
    expect(isShellCommandOccurrence("ping", "ping -c 3 registre.example.org")).toBe(true);
    expect(isShellCommandOccurrence("ruby", "ruby scripts/seed.rb")).toBe(true);
    // …including the ones a DIGIT does not exempt from the 2-char rule, and the tools
    // whose name is somebody's (`hugo`, `octave`, `axel`, `packer`).
    expect(isShellCommandOccurrence("7z", "7z x archive.7z -o/tmp")).toBe(true);
    expect(isShellCommandOccurrence("hugo", "hugo --minify -d public/")).toBe(true);
    expect(isGenericTerm("hugo")).toBe(false);
    expect(isGenericTerm("octave")).toBe(false);
  });

  it("reads the CASING as the shell does — « Ruby » is a person, `ruby` a command", () => {
    // `applyVault` is case-sensitive, so the two spellings are two decisions.
    expect(isShellCommandOccurrence("Ruby", "Ruby scripts/seed.rb")).toBe(false);
    expect(isShellCommandOccurrence("Ping", "Ping -c 3 example.org")).toBe(false);
  });

  it("fails CLOSED with no text to read", () => {
    expect(isShellCommandOccurrence("ls", undefined)).toBe(false);
    expect(isNonPiiTerm("ls")).toBe(false);
    expect(isNonPiiTerm("ls", "name", "ls -la /tmp")).toBe(true);
  });

  it("is not fooled by the word glued into another", () => {
    expect(isShellCommandOccurrence("cd", "Alice-cd -la")).toBe(false);
    expect(isShellCommandOccurrence("go", "gomez -v /tmp")).toBe(false);
  });
});
