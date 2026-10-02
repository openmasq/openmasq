import { it } from "vitest";
import { redact } from "../index";
it("od", () => {
  const sample = [
    "Devis Lucane.docx — application/vnd.openxmlformats-officedocument.wordprocessingml.document (2026-09-30) · id:01BYE5RZ6QN3ZWBTUFOFD3GSPGOHDJD36K",
    "Factures — dossier (2026-09-12) · id:A1B2C3D4E5F6G7H8!1234",
    "Utilise OneDrive, One Drive, Notion, Slack et Dropbox pour retrouver le devis.",
    "📁 Projets  [id: 01BYE5RZ5MYLM2SMX75ZBIPQZIHT6OAYPB]",
  ].join("\n");
  const r = redact(sample, { disabledKinds: [] });
  console.log(r.text);
  console.log(r.matches.map((m) => `${m.type}:${m.value}`));
});
