import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

describe("provider failover integration", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, ALPHA_VANTAGE_API_KEY: "demo" };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("falls back from Stooq to Alpha Vantage when Stooq fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("stooq.com")) {
        return {
          ok: false,
          status: 503,
          text: async () => ""
        } as Response;
      }

      if (url.includes("alphavantage.co")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            "Time Series (Daily)": {
              "2026-02-20": {
                "1. open": "100",
                "2. high": "105",
                "3. low": "99",
                "4. close": "104",
                "5. adjusted close": "104",
                "6. volume": "1000000"
              },
              "2026-02-21": {
                "1. open": "104",
                "2. high": "106",
                "3. low": "103",
                "4. close": "105",
                "5. adjusted close": "105",
                "6. volume": "900000"
              }
            }
          })
        } as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { getDailyBarsWithFailover } = await import("@/providers");
    const result = await getDailyBarsWithFailover({
      symbol: "AAPL",
      start: new Date("2026-02-01T00:00:00.000Z"),
      end: new Date("2026-02-23T00:00:00.000Z")
    });

    expect(result.provider).toBe("alpha-vantage");
    expect(result.bars).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("stooq.com");
    expect(String(fetchMock.mock.calls[1][0])).toContain("alphavantage.co");
  });
});
