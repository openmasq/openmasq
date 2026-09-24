// The three environment variables a tool reads to talk to the proxy instead of the vendor.
// One home: the banner prints them, the `c` key copies them, the `--` wrapper injects them.
export function envLines(url: string): string[] {
  return [
    `OPENAI_BASE_URL=${url}/v1`,
    `ANTHROPIC_BASE_URL=${url}`,
    `GOOGLE_GEMINI_BASE_URL=${url}`,
  ];
}
