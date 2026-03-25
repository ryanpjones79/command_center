import { describe, expect, it } from "vitest";
import { classifySeries, classifyStratBar } from "@/strat/classifier";

describe("classifyStratBar", () => {
  it("classifies inside as 1", () => {
    expect(classifyStratBar({ high: 10, low: 6 }, { high: 11, low: 5 })).toBe("1");
  });

  it("classifies directional up as 2u", () => {
    expect(classifyStratBar({ high: 12, low: 5 }, { high: 11, low: 5 })).toBe("2u");
  });

  it("classifies directional down as 2d", () => {
    expect(classifyStratBar({ high: 11, low: 4 }, { high: 11, low: 5 })).toBe("2d");
  });

  it("classifies outside as 3", () => {
    expect(classifyStratBar({ high: 12, low: 4 }, { high: 11, low: 5 })).toBe("3");
  });
});

describe("classifySeries", () => {
  it("marks first bar as null", () => {
    const labeled = classifySeries([
      { high: 11, low: 5 },
      { high: 12, low: 5 }
    ]);

    expect(labeled[0].stratLabel).toBeNull();
    expect(labeled[1].stratLabel).toBe("2u");
  });
});
