import { describe, expect, it } from "vitest";
import type { ConnectorToolCtx } from "../types";
import { googleCalendarConnector } from "./calendar";

const listEvents = googleCalendarConnector.tools.find((t) => t.name === "list_events")!;

/** Capture the URL the tool builds, and hand back a scripted Calendar payload. */
function ctxFor(items: unknown[]): { ctx: ConnectorToolCtx; urls: string[] } {
  const urls: string[] = [];
  const ctx = {
    accessToken: "tok",
    fetchJson: async <T,>(url: string): Promise<T> => {
      urls.push(url);
      return { items } as T;
    },
    fetchText: async () => "",
  } as unknown as ConnectorToolCtx;
  return { ctx, urls };
}

const q = (url: string) => new URL(url).searchParams;

describe("list_events — la fenêtre de dates", () => {
  it("couvre la JOURNÉE ENTIÈRE quand on ne donne que `from`", async () => {
    // "Prépare ma journée du 3 août": the tool had NO date parameter, so
    // the model asked the user for a date it wouldn't have been able to pass along.
    const { ctx, urls } = ctxFor([]);
    await listEvents.run({ from: "2026-08-03" }, ctx);
    const p = q(urls[0]);
    // Local bounds: midnight → 23:59:59.999 of August 3rd IN THE USER'S timezone.
    expect(new Date(p.get("timeMin")!).getTime()).toBe(new Date(2026, 7, 3, 0, 0, 0, 0).getTime());
    expect(new Date(p.get("timeMax")!).getTime()).toBe(
      new Date(2026, 7, 3, 23, 59, 59, 999).getTime(),
    );
  });

  it("accepte une vraie fenêtre, et un date-heure RFC3339", async () => {
    const { ctx, urls } = ctxFor([]);
    await listEvents.run({ from: "2026-08-03", to: "2026-08-05" }, ctx);
    expect(new Date(q(urls[0]).get("timeMax")!).getTime()).toBe(
      new Date(2026, 7, 5, 23, 59, 59, 999).getTime(),
    );

    const { ctx: c2, urls: u2 } = ctxFor([]);
    await listEvents.run({ from: "2026-08-03T14:00:00+02:00" }, c2);
    expect(q(u2[0]).get("timeMin")).toBe(new Date("2026-08-03T14:00:00+02:00").toISOString());
  });

  it("sans argument : à partir de maintenant, sans borne haute (le comportement d'avant)", async () => {
    const { ctx, urls } = ctxFor([]);
    await listEvents.run({}, ctx);
    expect(q(urls[0]).get("timeMax")).toBeNull();
    expect(q(urls[0]).get("timeMin")).toBeTruthy();
  });

  it("une date illisible ne coûte PAS son agenda à l'utilisateur", async () => {
    const { ctx, urls } = ctxFor([]);
    await listEvents.run({ from: "la semaine prochaine" }, ctx);
    expect(q(urls[0]).get("timeMin")).toBeTruthy();
    expect(q(urls[0]).get("timeMax")).toBeNull();
  });
});

describe("list_events — ce que la ligne porte", () => {
  it("remonte fin, lieu, participants et notes — que l'API renvoyait déjà", async () => {
    // Without them, "with the participants and the location" and "what overlaps or doesn't
    // leave me time to travel" were uncomputable: the line only said
    // "start — title".
    const { ctx } = ctxFor([
      {
        summary: "Point produit",
        location: "Salle B, 12 rue de Rivoli",
        start: { dateTime: "2026-08-03T09:00:00+02:00" },
        end: { dateTime: "2026-08-03T10:00:00+02:00" },
        attendees: [{ displayName: "Claire Skateboarder" }, { email: "b@karl.studio" }],
        description: "Revue  du   backlog",
      },
    ]);
    const res = await listEvents.run({ from: "2026-08-03" }, ctx);
    const text = res.content[0].text;
    expect(text).toContain("09:00–10:00");
    expect(text).toContain("Point produit");
    expect(text).toContain("lieu : Salle B, 12 rue de Rivoli");
    expect(text).toContain("participants : Claire Skateboarder, b@karl.studio");
    expect(text).toContain("notes : Revue du backlog");
  });

  it("nomme un événement sur la journée entière au lieu d'inventer une heure", async () => {
    const { ctx } = ctxFor([{ summary: "Congés", start: { date: "2026-08-03" } }]);
    const res = await listEvents.run({ from: "2026-08-03" }, ctx);
    expect(res.content[0].text).toContain("2026-08-03 (journée entière)");
  });

  it("le dit quand la période est vide, sans prétendre qu'il n'y a « rien à venir »", async () => {
    const { ctx } = ctxFor([]);
    const res = await listEvents.run({ from: "2026-08-03" }, ctx);
    expect(res.content[0].text).toBe("Aucun événement sur cette période.");
  });
});
