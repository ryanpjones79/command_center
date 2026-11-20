import { describe, expect, it } from "vitest";
import { buildLifeFeed, type LifeTask } from "@/server/today-feed/life-feeds";

// Day window: 2026-11-19 in America/Los_Angeles (08:00Z to next 08:00Z).
const day = {
  start: new Date("2026-11-19T08:00:00.000Z"),
  end: new Date("2026-11-20T08:00:00.000Z"),
  timeZone: "America/Los_Angeles"
};

function task(id: string, overrides: Partial<LifeTask> = {}): LifeTask {
  return {
    id, title: `Task ${id}`, domainSlug: "health", domainId: "health-domain", blockType: null,
    whenBucket: "LATER", dueDate: null, scheduledStart: null, pinToTodayUntilDone: false,
    ...overrides
  };
}

describe("Kids and Health Today feeds", () => {
  it("asks for a domain when the area has none", () => {
    const feed = buildLifeFeed("KIDS", { domainIds: [], openTasks: [], doneTodayCount: 0, day });
    expect(feed.status).toBe("UNAVAILABLE");
    expect(feed.message).toMatch(/Family or Kids/);
  });

  it("flags a day with nothing planned, scheduled or done", () => {
    const feed = buildLifeFeed("HEALTH", { domainIds: ["health-domain"], openTasks: [task("later")], doneTodayCount: 0, day });
    expect(feed.cards).toHaveLength(1);
    expect(feed.cards[0]).toMatchObject({ id: "health:none-planned", href: "/tasks?domainId=health-domain" });
  });

  it("puts overdue first, then due-today tasks not yet on the grid", () => {
    const feed = buildLifeFeed("HEALTH", {
      domainIds: ["health-domain"],
      openTasks: [
        task("protein", { title: "Hit protein target", whenBucket: "TODAY" }),
        task("old", { title: "Weigh in", dueDate: new Date("2026-11-17T16:00:00.000Z") }),
        task("other-area", { domainSlug: "rykas", whenBucket: "TODAY" })
      ],
      doneTodayCount: 0,
      day
    });
    expect(feed.cards.map((card) => card.id)).toEqual(["health:overdue:old", "health:unscheduled:protein"]);
    expect(feed.cards[1].href).toBe("/tasks?taskId=protein");
  });

  it("treats a block already on today's grid as handled and reports progress", () => {
    const feed = buildLifeFeed("KIDS", {
      domainIds: ["family-domain"],
      openTasks: [
        task("pickup", {
          domainSlug: "family", title: "School pickup", whenBucket: "TODAY",
          scheduledStart: new Date("2026-11-19T23:00:00.000Z")
        })
      ],
      doneTodayCount: 1,
      day
    });
    expect(feed.status).toBe("EMPTY");
    expect(feed.cards).toEqual([]);
    expect(feed.message).toBe("1 done today · on the grid: School pickup 3:00 PM.");
  });

  it("counts a completed check-in as handled", () => {
    const feed = buildLifeFeed("HEALTH", { domainIds: ["health-domain"], openTasks: [], doneTodayCount: 2, day });
    expect(feed).toMatchObject({ status: "EMPTY", cards: [], message: "2 done today." });
  });

  it("links task-backed cards to their task so they can be scheduled in place", () => {
    const feed = buildLifeFeed("HEALTH", { domainIds: ["health-domain"], openTasks: [task("w", { whenBucket: "TODAY" })], doneTodayCount: 0, day });
    expect(feed.cards[0].taskId).toBe("w");
  });

  it("CCHCS uses Work tasks but not Pipeline blocks, and nags only on weekdays", () => {
    const work = (id: string, overrides: Partial<LifeTask> = {}) => task(id, { domainSlug: "work", domainId: "work-domain", ...overrides });
    const thursday = buildLifeFeed("CCHCS", {
      domainIds: ["work-domain"],
      openTasks: [work("pipe", { blockType: "pipeline", whenBucket: "TODAY" }), work("memo", { title: "OPPE memo", whenBucket: "TODAY" })],
      doneTodayCount: 0,
      day
    });
    expect(thursday.cards.map((card) => card.id)).toEqual(["cchcs:unscheduled:memo"]);

    const empty = buildLifeFeed("CCHCS", { domainIds: ["work-domain"], openTasks: [], doneTodayCount: 0, day });
    expect(empty.cards.map((card) => card.id)).toEqual(["cchcs:none-planned"]);

    const saturday = {
      start: new Date("2026-11-21T08:00:00.000Z"),
      end: new Date("2026-11-22T08:00:00.000Z"),
      timeZone: "America/Los_Angeles"
    };
    expect(buildLifeFeed("CCHCS", { domainIds: ["work-domain"], openTasks: [], doneTodayCount: 0, day: saturday }).cards).toEqual([]);
  });

  it("Casino AP surfaces due plays but never nags when nothing is planned", () => {
    const casino = buildLifeFeed("CASINO_AP", {
      domainIds: ["casino-domain"],
      openTasks: [task("promo", { domainSlug: "casino-ap", domainId: "casino-domain", title: "Use free play before Sunday", dueDate: new Date("2026-11-18T20:00:00.000Z") })],
      doneTodayCount: 0,
      day
    });
    expect(casino.cards.map((card) => card.id)).toEqual(["casino_ap:overdue:promo"]);
    const quiet = buildLifeFeed("CASINO_AP", { domainIds: ["casino-domain"], openTasks: [], doneTodayCount: 0, day });
    expect(quiet).toMatchObject({ status: "EMPTY", cards: [], message: "Nothing planned for Casino AP." });
  });

  it("caps at three actions", () => {
    const openTasks = ["a", "b", "c", "d"].map((id) => task(id, { whenBucket: "TODAY" }));
    const feed = buildLifeFeed("HEALTH", { domainIds: ["health-domain"], openTasks, doneTodayCount: 0, day });
    expect(feed.cards).toHaveLength(3);
  });
});
