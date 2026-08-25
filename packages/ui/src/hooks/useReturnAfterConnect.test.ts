import { describe, it, expect } from "vitest";
import { shouldReturnAfterConnect } from "./useReturnAfterConnect";

const base = {
  connectorId: "browser",
  returnToConvId: "conv-1",
  connectedIds: ["browser"],
  section: "settings" as const,
};

describe("shouldReturnAfterConnect", () => {
  it("returns the conv id when armed, still on Settings, and the connector is connected", () => {
    expect(shouldReturnAfterConnect(base)).toBe("conv-1");
  });

  it("returns null when not armed (no returnToConvId)", () => {
    expect(shouldReturnAfterConnect({ ...base, returnToConvId: undefined })).toBeNull();
  });

  it("returns null when no connector id", () => {
    expect(shouldReturnAfterConnect({ ...base, connectorId: undefined })).toBeNull();
  });

  it("does NOT fire while the connector is not yet connected", () => {
    expect(shouldReturnAfterConnect({ ...base, connectedIds: ["gmail"] })).toBeNull();
  });

  it("does NOT yank the user back if they already left Settings", () => {
    expect(shouldReturnAfterConnect({ ...base, section: "chats" })).toBeNull();
  });

  it("only fires for the SPECIFIC armed connector, not any connect", () => {
    expect(
      shouldReturnAfterConnect({ ...base, connectorId: "gmail", connectedIds: ["browser"] }),
    ).toBeNull();
  });
});
