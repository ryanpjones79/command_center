"use client";

import { useEffect, useRef } from "react";
import { createChart, type ISeriesApi, type Time } from "lightweight-charts";

type ChartPoint = {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
};

export function TickerChart({ data }: { data: ChartPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const chart = createChart(ref.current, {
      height: 440,
      layout: {
        background: { color: "#0b1220" },
        textColor: "#d1d5db"
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.15)" },
        horzLines: { color: "rgba(148, 163, 184, 0.15)" }
      }
    });

    const candleSeries = (chart as any).addCandlestickSeries();
    candleSeries.setData(data);

    function addLine(color: string, values: Array<{ time: Time; value: number }>) {
      const line = (chart as any).addLineSeries({ color, lineWidth: 2, priceLineVisible: false });
      line.setData(values);
      return line;
    }

    const sma20 = addLine(
      "#22c55e",
      data.filter((row) => row.sma20 !== null).map((row) => ({ time: row.time, value: row.sma20 as number }))
    );
    const sma50 = addLine(
      "#38bdf8",
      data.filter((row) => row.sma50 !== null).map((row) => ({ time: row.time, value: row.sma50 as number }))
    );
    const sma200 = addLine(
      "#f97316",
      data.filter((row) => row.sma200 !== null).map((row) => ({ time: row.time, value: row.sma200 as number }))
    );

    chart.timeScale().fitContent();

    const resize = () => chart.applyOptions({ width: ref.current?.clientWidth || 900 });
    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      sma20.applyOptions({ visible: false });
      sma50.applyOptions({ visible: false });
      sma200.applyOptions({ visible: false });
      chart.remove();
    };
  }, [data]);

  return <div ref={ref} className="w-full" />;
}
