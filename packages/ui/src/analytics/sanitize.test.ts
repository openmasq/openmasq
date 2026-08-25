import { describe, it, expect } from "vitest";
import { sanitize, bucket, bucketMs } from "./sanitize";
import type { TrackEvent } from "./events";

describe("analytics sanitize (privacy guard)", () => {
  it("keeps only allow-listed fields and drops anything else", () => {
    // A mis-cast call site trying to smuggle content must be stripped.
    const sneaky = {
      name: "send_message",
      chars: 42,
      promptText: "Email marcus@acme.com about Q3", // NOT allow-listed → dropped
      vault: { t1: "Marcus Foy" },
    } as unknown as TrackEvent;
    const out = sanitize(sneaky);
    expect(out.name).toBe("send_message");
    expect(out.props.promptText).toBeUndefined();
    expect(out.props.vault).toBeUndefined();
    expect("chars" in out.props).toBe(true);
  });

  it("buckets noisy numeric fields (chars) so exact length can't fingerprint", () => {
    expect(sanitize({ name: "send_message", chars: 7 }).props.chars).toBe("1-20");
    expect(sanitize({ name: "send_message", chars: 350 }).props.chars).toBe("101-500");
    expect(bucket(50000)).toBe("10k+");
  });

  it("passes through declared enum/id/count fields untouched", () => {
    const out = sanitize({ name: "redaction_applied", count: 3, kinds: ["name", "email"] });
    expect(out.props.count).toBe(3);
    expect(out.props.kinds).toEqual(["name", "email"]);
  });

  it("buckets redaction_timing latency and keeps enum/id/cold but nothing else", () => {
    const out = sanitize({
      name: "redaction_timing",
      engine: "local",
      model: "bert-ner",
      ms: 4200,
      cold: true,
    });
    expect(out.props.ms).toBe("3-10s"); // bucketed, not the raw 4200
    expect(out.props.engine).toBe("local");
    expect(out.props.model).toBe("bert-ner");
    expect(out.props.cold).toBe(true);
    // a mis-cast attempt to attach the scanned text must be stripped
    const sneaky = sanitize({
      name: "redaction_timing",
      engine: "model",
      model: "mistral",
      ms: 30,
      text: "Jean Valjean",
    } as unknown as TrackEvent);
    expect(sneaky.props.ms).toBe("<50ms");
    expect((sneaky.props as Record<string, unknown>).text).toBeUndefined();
  });

  it("bucketMs quantises latency into coarse ranges", () => {
    expect(bucketMs(10)).toBe("<50ms");
    expect(bucketMs(300)).toBe("200-500ms");
    expect(bucketMs(750)).toBe("500ms-1s");
    // The tail above 10s is now split (was a single opaque "10s+").
    expect(bucketMs(15000)).toBe("10-20s");
    expect(bucketMs(25000)).toBe("20-40s");
    expect(bucketMs(50000)).toBe("40-60s");
    expect(bucketMs(120000)).toBe("60s+");
  });

  it("drops nested objects even on an allow-listed key (no content leak)", () => {
    const out = sanitize({
      name: "change_model",
      provider: "openai",
      model: "gpt-4o",
      // @ts-expect-error — extra object field must never survive
      meta: { secret: "x" },
    });
    expect(out.props.provider).toBe("openai");
    expect(out.props.model).toBe("gpt-4o");
    expect((out.props as Record<string, unknown>).meta).toBeUndefined();
  });
});
