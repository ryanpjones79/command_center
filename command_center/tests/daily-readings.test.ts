import { describe, expect, it } from "vitest";
import {
  dailyReadings,
  getDailyReadingForDate,
  getDayOfYear
} from "@/lib/daily-readings";

describe("daily readings", () => {
  it("provides one reading for every possible day of the year", () => {
    expect(dailyReadings).toHaveLength(366);
    expect(new Set(dailyReadings.map((reading) => reading.day)).size).toBe(
      366
    );
  });

  it("rotates evenly across Buddhism, Gita, and Stoicism", () => {
    const counts = dailyReadings.reduce<Record<string, number>>(
      (accumulator, reading) => {
        accumulator[reading.tradition] =
          (accumulator[reading.tradition] ?? 0) + 1;
        return accumulator;
      },
      {}
    );

    expect(counts).toEqual({
      Buddhism: 122,
      Gita: 122,
      Stoicism: 122
    });
  });

  it("keeps each passage source-backed and substantial", () => {
    for (const reading of dailyReadings) {
      expect(reading.passage.length).toBeGreaterThanOrEqual(95);
      expect(reading.attribution).toBeTruthy();
      expect(reading.sourceUrl).toMatch(/^https:\/\/www\.gutenberg\.org/);
    }
  });

  it("uses local calendar dates for leap-year-safe lookup", () => {
    expect(getDayOfYear(new Date(2026, 0, 1, 12))).toBe(1);
    expect(getDayOfYear(new Date(2026, 6, 3, 12))).toBe(184);
    expect(getDayOfYear(new Date(2028, 1, 29, 12))).toBe(60);
    expect(getDayOfYear(new Date(2028, 11, 31, 12))).toBe(366);

    expect(getDailyReadingForDate(new Date(2026, 0, 1, 12)).day).toBe(1);
    expect(getDailyReadingForDate(new Date(2028, 11, 31, 12)).day).toBe(366);
  });
});
