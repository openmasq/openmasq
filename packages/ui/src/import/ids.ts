// The ids of imported conversations and messages — `imp-<provider>-<source id>` and
// `<conversation id>:m<n>`. The parsers mint them HERE, and the send path reads them
// (`send/replayable.ts`): an imported message holds what another assistant saw in clear,
// so it goes back to a model only once the on-device detector has run over it.
export type ImportedSource = "gpt" | "claude";

export const importedConvId = (source: ImportedSource, sourceId: string): string =>
  `imp-${source}-${sourceId}`;

export const importedMessageId = (convId: string, n: number): string => `${convId}:m${n}`;

export const isImportedMessageId = (id: string | undefined): boolean =>
  !!id && /^imp-(gpt|claude)-.+:m\d+$/.test(id);
