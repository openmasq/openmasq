// Folding a file's vault back into the conversation. The file is redacted in main against a
// SNAPSHOT of the vault taken when the call started; a large file resolves seconds later,
// after tool results or the next turn have vaulted new values. Writing the snapshot back
// would drop those — and the next replay would send them in clear. So it MERGES: what the
// conversation holds now, plus what the file added.
export function mergeVault(
  current: Record<string, string> | undefined,
  fromFile: Record<string, string>,
): Record<string, string> {
  return { ...(current ?? {}), ...fromFile };
}
