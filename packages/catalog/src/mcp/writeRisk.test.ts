import { describe, it, expect } from "vitest";
import { writeRisk, needsSystemConfirm } from "./writeRisk";

// This classifier decides which confirmation surface a write gets, and one of the two is
// forgeable by a renderer XSS (audit M6). So every case below is really asking: "if this
// call were approved WITHOUT the user, how bad is it?" — and the answer must be "harmless"
// for everything that reaches `"low"`.

const gmail = { serverId: "gmail" } as const;

describe("writeRisk — what may be confirmed inside the conversation", () => {
  it("lets workspace-local, reversible edits take the in-conversation card", () => {
    for (const tool of [
      "gmail__create_draft",
      "gmail__add_label",
      "gmail__mark_as_read",
      "gmail__archive_thread",
      "gmail__update_task_status",
      "gmail__rename_folder",
    ]) {
      expect(writeRisk(tool, gmail), tool).toBe("low");
    }
  });

  it("keeps anything that leaves the workspace on the system window", () => {
    for (const tool of [
      "gmail__send_email", // the canonical one: irreversible, reaches a third party
      "gmail__share_folder",
      "gmail__invite_member",
      "gmail__publish_page",
      "gmail__post_message",
      "gmail__transfer_funds",
    ]) {
      expect(writeRisk(tool, gmail), tool).toBe("high");
    }
  });

  it("keeps destructive and privilege changes on the system window", () => {
    for (const tool of [
      "gmail__delete_label", // low-risk OBJECT, high-risk ACT — the veto must win
      "gmail__purge_folder",
      "gmail__revoke_access",
      "gmail__grant_role",
      "gmail__run_script",
      "gmail__reset_password",
    ]) {
      expect(writeRisk(tool, gmail), tool).toBe("high");
    }
  });

  it("refuses the quiet path for a compound name whose second half sends", () => {
    // `create_and_send_draft` reads as a draft operation until the word `send`.
    expect(writeRisk("gmail__create_and_send_draft", gmail)).toBe("high");
  });
});

describe("writeRisk — fail closed", () => {
  it("treats an unknown or empty tool name as high", () => {
    expect(writeRisk("", gmail)).toBe("high");
    expect(writeRisk("gmail__frobnicate", gmail)).toBe("high");
    expect(writeRisk("gmail__update_widget", gmail)).toBe("high"); // low verb, unlisted object
  });

  it("never trusts a server we do not ship — its tool names mean nothing to us", () => {
    // A user-added stdio/remote endpoint can call a destructive operation `add_label`.
    expect(writeRisk("mystery__add_label", { serverId: "mystery" })).toBe("high");
    expect(writeRisk("gmail__add_label", {})).toBe("high"); // no server id at all
  });

  it("lets server hints RAISE the risk but never lower it", () => {
    expect(writeRisk("gmail__add_label", { ...gmail, annotations: { destructiveHint: true } })).toBe("high");
    // A hostile server marking a send read-only must not buy the quiet surface.
    expect(writeRisk("gmail__send_email", { ...gmail, annotations: { readOnlyHint: true } })).toBe("high");
  });

  it("escalates on the loop's own signals — attachments or any exfil flag", () => {
    expect(writeRisk("gmail__add_label", { ...gmail, hasAttachments: true })).toBe("high");
    expect(writeRisk("gmail__add_label", { ...gmail, exfilFlags: 1 })).toBe("high");
    expect(writeRisk("gmail__add_label", { ...gmail, exfilFlags: 0 })).toBe("low");
  });
});

describe("needsSystemConfirm", () => {
  it("is the inverse of a low classification, so a call site reads as its gate", () => {
    expect(needsSystemConfirm("gmail__send_email", gmail)).toBe(true);
    expect(needsSystemConfirm("gmail__create_draft", gmail)).toBe(false);
  });
});
