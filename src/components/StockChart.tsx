"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  AreaSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";

type PricePoint = {
  time: number;
  value: number;
};

const ranges = [
  { label: "1D", value: "1d" },
  { label: "5D", value: "5d" },
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "1Y", value: "1y" },
];

export default function StockChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);

  const [range, setRange] = useState("1mo");
  const [data, setData] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create the chart once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: Math.max(container.clientWidth, 300),
      height: 260,
      layout: {
        background: { type: ColorType.Solid, color: "#080b12" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#18202d" },
        horzLines: { color: "#18202d" },
      },
      rightPriceScale: { borderColor: "#263244" },
      timeScale: { borderColor: "#263244" },
      crosshair: {
        vertLine: { color: "#64748b" },
        horzLine: { color: "#64748b" },
      },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#34d399",
      topColor: "rgba(52, 211, 153, 0.30)",
      bottomColor: "rgba(52, 211, 153, 0.01)",
      lineWidth: 2,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const observer = new ResizeObserver(() => {
      if (container.clientWidth > 0) {
        chart.applyOptions({ width: container.clientWidth });
      }
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Update chart data when the stock or timeframe changes.
  useEffect(() => {
    let active = true;

    async function loadHistory() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/history?symbol=${symbol}&range=${range}`,
          { cache: "no-store" }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Unable to load chart data.");
        }

        if (!Array.isArray(result.data)) {
          throw new Error("The historical data response is invalid.");
        }

        const valid = result.data
          .filter(
            (item: PricePoint) =>
              Number.isFinite(item.time) &&
              Number.isFinite(item.value) &&
              item.value > 0
          )
          .map((item: PricePoint) => ({
            time: item.time as UTCTimestamp,
            value: item.value,
          }))
          .sort((a: PricePoint, b: PricePoint) => a.time - b.time);

        const unique = valid.filter(
          (item: PricePoint, index: number) =>
            index === 0 || item.time !== valid[index - 1].time
        );

        if (!active) return;

        setData(unique);

        if (unique.length === 0) {
          setError("No historical prices are available for this period.");
        }
      } catch (err) {
        if (!active) return;

        setData([]);
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load historical prices."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    loadHistory();

    return () => {
      active = false;
    };
  }, [symbol, range]);

  // Draw new data on the existing series.
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;

    if (!series || !chart) return;

    try {
      series.setData(data);
      chart.timeScale().fitContent();
    } catch (err) {
      console.error("Stock chart rendering failed:", err);
      setError("Unable to render the historical chart.");
    }
  }, [data]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          Historical closing prices
        </p>

        <div className="flex gap-1 rounded-lg bg-[#080b12] p-1">
          {ranges.map((item) => (
            <button
              key={item.value}
              onClick={() => setRange(item.value)}
              className={`rounded-md px-3 py-2 text-xs font-semibold ${
                range === item.value
                  ? "bg-emerald-400 text-[#080b12]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <div ref={containerRef} className="w-full" />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#080b12]/70 text-sm text-slate-300">
            Loading historical prices…
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-amber-300">{error}</p>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Source: Yahoo Finance · Historical data may be delayed.
      </p>
    </div>
  );
}
