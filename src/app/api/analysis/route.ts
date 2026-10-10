import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

const allowedSymbols = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN"];

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  const changes = closes.slice(1).map((price, index) =>
    price - closes[index]
  );

  const recent = changes.slice(-period);

  const gains = recent.map((change) => Math.max(change, 0));
  const losses = recent.map((change) => Math.max(-change, 0));

  const averageGain = average(gains);
  const averageLoss = average(losses);

  if (averageGain === 0 && averageLoss === 0) return 50;
  if (averageLoss === 0) return 100;
  if (averageGain === 0) return 0;

  const relativeStrength = averageGain / averageLoss;

  return Number((100 - 100 / (1 + relativeStrength)).toFixed(2));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "AAPL").toUpperCase();

  if (!allowedSymbols.includes(symbol)) {
    return NextResponse.json(
      { error: "Unsupported stock symbol." },
      { status: 400 }
    );
  }

  try {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 120);

    const history = await yahooFinance.chart(symbol, {
      period1: start,
      period2: end,
      interval: "1d",
    });

    const closes = history.quotes
      .filter(
        (item) =>
          item.date instanceof Date &&
          typeof item.close === "number" &&
          Number.isFinite(item.close) &&
          item.close > 0
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((item) => item.close as number);

    if (closes.length < 50) {
      return NextResponse.json({
        symbol,
        status: "INSUFFICIENT_DATA",
        signal: "HOLD",
        reason: "At least 50 valid daily closing prices are required.",
        observations: closes.length,
        source: "Yahoo Finance",
        delayedDataPossible: true,
      });
    }

    const latest = closes[closes.length - 1];
    const previous = closes[closes.length - 2];

    const sma20 = average(closes.slice(-20));
    const sma50 = average(closes.slice(-50));
    const rsi = calculateRSI(closes);

    const momentumPercent =
      previous > 0
        ? Number((((latest - previous) / previous) * 100).toFixed(2))
        : 0;

    const bullishTrend = sma20 > sma50 && latest > sma20;
    const bearishTrend = sma20 < sma50 && latest < sma20;

    let signal: "BUY" | "SELL" | "HOLD" = "HOLD";
    let reason = "The indicators do not agree strongly enough to justify a directional signal.";

    if (rsi !== null && bullishTrend && rsi >= 50 && rsi < 70) {
      signal = "BUY";
      reason = "The short-term average is above the long-term average, price is above SMA20, and RSI supports positive momentum.";
    } else if (rsi !== null && bearishTrend && rsi <= 50 && rsi > 30) {
      signal = "SELL";
      reason = "The short-term average is below the long-term average, price is below SMA20, and RSI supports negative momentum.";
    } else if (rsi !== null && rsi >= 70) {
      reason = "RSI is at or above 70. The system avoids a new BUY signal because momentum may be overextended.";
    } else if (rsi !== null && rsi <= 30) {
      reason = "RSI is at or below 30. The system avoids a new SELL signal because the stock may be oversold.";
    }

    return NextResponse.json({
      symbol,
      status: "OK",
      signal,
      reason,
      indicators: {
        latestClose: Number(latest.toFixed(2)),
        rsi14: rsi,
        sma20: Number(sma20.toFixed(2)),
        sma50: Number(sma50.toFixed(2)),
        dailyMomentumPercent: momentumPercent,
        trend: bullishTrend
          ? "BULLISH"
          : bearishTrend
            ? "BEARISH"
            : "MIXED",
      },
      riskManagement: {
        stopLossPercent: 3,
        takeProfitPercent: 6,
        note: "Illustrative risk levels only. They are not personalized financial advice or a guarantee of execution.",
      },
      observations: closes.length,
      source: "Yahoo Finance",
      delayedDataPossible: true,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Stock analysis failed:", error);

    return NextResponse.json(
      {
        error: "Unable to calculate stock analysis right now.",
        source: "Yahoo Finance",
      },
      { status: 502 }
    );
  }
}
