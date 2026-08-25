import { describe, it, expect } from "vitest";
import { microsoftOutlookConnector } from "./outlook";
import type { ConnectorToolCtx } from "../types";

const sendEmail = microsoftOutlookConnector.tools.find((t) => t.name === "send_email")!;

/** A ctx that captures the last `sendMail` request body instead of hitting Graph. */
function captureCtx() {
  const calls: { url: string; body: any }[] = [];
  const ctx: ConnectorToolCtx = {
    accessToken: "tok",
    fetchText: async () => "",
    fetchJson: async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return {} as any;
    },
  };
  return { ctx, calls };
}

describe("Outlook send_email — attachments", () => {
  it("advertises an `attachments` param so the model can attach a conversation file", () => {
    const props = (sendEmail.inputSchema as any).properties;
    expect(props.attachments?.type).toBe("array");
  });

  it("injects desktop-resolved bytes as a Graph fileAttachment", async () => {
    const { ctx, calls } = captureCtx();
    const res = await sendEmail.run(
      {
        to: "alice@example.com",
        subject: "Rapport",
        body: "Ci-joint.",
        attachments: ["rapport.docx"], // what the MODEL named (bytes never seen by it)
        __attachmentData: [
          { filename: "rapport.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", contentBase64: "QUJD" },
        ],
      },
      ctx,
    );
    expect(res.isError).toBeFalsy();
    const msg = calls[0].body.message;
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments[0]).toMatchObject({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "rapport.docx",
      contentBytes: "QUJD",
    });
    expect(res.content[0].text).toContain("1 pièce jointe");
  });

  it("sends with NO attachments key when none are provided", async () => {
    const { ctx, calls } = captureCtx();
    const res = await sendEmail.run({ to: "a@b.com", subject: "s", body: "hi" }, ctx);
    expect(res.isError).toBeFalsy();
    expect(calls[0].body.message.attachments).toBeUndefined();
  });

  it("refuses an oversize attachment set without calling Graph", async () => {
    const { ctx, calls } = captureCtx();
    const huge = "A".repeat(4_000_001);
    const res = await sendEmail.run(
      {
        to: "a@b.com",
        subject: "s",
        body: "hi",
        attachments: ["big.bin"],
        __attachmentData: [{ filename: "big.bin", mimeType: "application/octet-stream", contentBase64: huge }],
      },
      ctx,
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/volumineuse/i);
    expect(calls).toHaveLength(0); // never hit Graph
  });

  it("still validates required to/body", async () => {
    const { ctx } = captureCtx();
    const res = await sendEmail.run({ subject: "s", body: "" }, ctx);
    expect(res.isError).toBe(true);
  });
});

describe("Outlook — les listes portent l'id, get_message lit le corps", () => {
  const tool = (name: string) => microsoftOutlookConnector.tools.find((t) => t.name === name)!;

  it("list_recent : chaque ligne porte [id: …]", async () => {
    const ctx: ConnectorToolCtx = {
      accessToken: "tok",
      fetchText: async () => "",
      fetchJson: async () => ({
        value: [{ id: "m1", subject: "Point client", from: { emailAddress: { address: "bob@x.fr" } }, receivedDateTime: "2026-07-30T10:00:00Z" }],
      }) as never,
    };
    const res = await tool("list_recent").run({}, ctx);
    expect(res.content[0].text).toContain("[id: m1]");
  });

  it("get_message : corps HTML débalisé, en-têtes présents", async () => {
    const ctx: ConnectorToolCtx = {
      accessToken: "tok",
      fetchText: async () => "",
      fetchJson: async (url: string) => {
        expect(url).toContain("/me/messages/m1");
        expect(url).toContain("body");
        return {
          id: "m1",
          subject: "Contrat",
          from: { emailAddress: { address: "bob@x.fr" } },
          receivedDateTime: "2026-07-30T10:00:00Z",
          body: { contentType: "html", content: "<div>Le contrat est <b>signé</b>.</div>" },
        } as never;
      },
    };
    const res = await tool("get_message").run({ id: "m1" }, ctx);
    expect(res.content[0].text).toContain("Objet : Contrat");
    expect(res.content[0].text).toContain("Le contrat est signé");
    expect(res.content[0].text).not.toContain("<div>");
  });
});
