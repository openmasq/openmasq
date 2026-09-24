// The few questions the wizard asks, and nothing more. No dependency: `node:readline` is
// enough, and a prompt library would be a third package on the path of a credential.
//
// ⚠️ A SECRET is read without echo. Not decoration: a client secret typed into a terminal
// stays in that terminal's scrollback, which is copied into bug reports and screen shares.
import { createInterface, type Interface } from "node:readline";

export interface Prompt {
  ask(question: string, opts?: { default?: string; required?: boolean }): Promise<string>;
  secret(question: string): Promise<string>;
  choose<T extends string>(question: string, options: [T, string][]): Promise<T>;
  confirm(question: string, fallback?: boolean): Promise<boolean>;
  close(): void;
}

export function createPrompt(
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
): Prompt {
  const rl: Interface = createInterface({ input, output });
  const question = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

  return {
    async ask(q, opts = {}) {
      const suffix = opts.default ? ` [${opts.default}]` : "";
      for (;;) {
        const answer = (await question(`  ${q}${suffix}: `)) || opts.default || "";
        if (answer || !opts.required) return answer;
        output.write("  (required)\n");
      }
    },

    async secret(q) {
      // Mute the echo for the duration of the answer, and restore it whatever happens —
      // a terminal left with echo off is a terminal the user has to reset by hand.
      const anyOut = output as NodeJS.WriteStream & { muted?: boolean };
      const write = output.write.bind(output);
      anyOut.muted = true;
      (output as unknown as { write: (c: string) => boolean }).write = (chunk: string) =>
        anyOut.muted && !chunk.includes(q) ? true : write(chunk);
      try {
        const answer = await question(`  ${q} (hidden): `);
        return answer;
      } finally {
        anyOut.muted = false;
        (output as unknown as { write: typeof write }).write = write;
        write("\n");
      }
    },

    async choose(q, options) {
      output.write(`  ${q}\n`);
      options.forEach(([key, label], i) => output.write(`    ${i + 1}) ${label}\n`));
      for (;;) {
        const answer = await question("  > ");
        const byIndex = options[Number(answer) - 1];
        if (byIndex) return byIndex[0];
        const byKey = options.find(([k]) => k === answer.toLowerCase());
        if (byKey) return byKey[0];
        output.write(`  (1-${options.length})\n`);
      }
    },

    async confirm(q, fallback = false) {
      const answer = (await question(`  ${q} ${fallback ? "[Y/n]" : "[y/N]"}: `)).toLowerCase();
      if (!answer) return fallback;
      return answer.startsWith("y") || answer.startsWith("o");
    },

    close: () => rl.close(),
  };
}
