import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

const allowedSymbols = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN"];

const periods: Record<string, number> = {
  "1d": 1,
  "5d": 5,
  "1mo": 30,
  "3mo": 90,
  "1y": 365,
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "AAPL").toUpperCase();
  const range = searchParams.get("range") || "1mo";

  if (!allowedSymbols.includes(symbol)) {
    return NextResponse.json(
      { error: "Unsupported stock symbol." },
      { status: 400 }
    );
  }

  if (!(range in periods)) {
    return NextResponse.json(
      { error: "Unsupported time range." },
      { status: 400 }
    );
  }

  try {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - periods[range]);

    const candles = await yahooFinance.chart(symbol, {
      period1: start,
      period2: end,
      interval: range === "1d" ? "5m" : "1d",
    });

    const data = candles.quotes
      .filter(
        (item) =>
          item.date instanceof Date &&
          typeof item.close === "number" &&
          Number.isFinite(item.close)
      )
      .map((item) => ({
        time: Math.floor(item.date.getTime() / 1000),
        value: item.close,
      }));

    return NextResponse.json({
      symbol,
      range,
      data,
      source: "Yahoo Finance",
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Historical data request failed:", error);

    return NextResponse.json(
      { error: "Unable to retrieve historical prices right now." },
      { status: 502 }
    );
  }
}
