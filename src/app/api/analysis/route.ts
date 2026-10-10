import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  const changes = closes.slice(1).map((price, index) => price - closes[index]);
  const recent = changes.slice(-period);
  const averageGain = average(recent.map((change) => Math.max(change, 0)));
  const averageLoss = average(recent.map((change) => Math.max(-change, 0)));

  if (averageGain === 0 && averageLoss === 0) return 50;
  if (averageLoss === 0) return 100;
  if (averageGain === 0) return 0;

  return Number(
    (100 - 100 / (1 + averageGain / averageLoss)).toFixed(2)
  );
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "AAPL").trim().toUpperCase();

  if (!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)) {
    return NextResponse.json(
      { error: "Unsupported stock symbol." },
      { status: 400 }
    );
  }

  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 120);

  const [historyResult, fundamentalsResult, searchResult] =
    await Promise.allSettled([
      yahooFinance.chart(symbol, {
        period1: start,
        period2: end,
        interval: "1d",
      }),
      yahooFinance.quoteSummary(symbol, {
        modules: [
          "price",
          "summaryDetail",
          "defaultKeyStatistics",
          "financialData",
          "assetProfile",
        ],
      }),
      yahooFinance.search(symbol, {
        quotesCount: 0,
        newsCount: 8,
        region: "US",
        lang: "en-US",
      }),
    ]);

  if (historyResult.status === "rejected") {
    console.error("Stock history failed:", historyResult.reason);
    return NextResponse.json(
      {
        error: "Unable to retrieve price history for this symbol right now.",
        source: "Yahoo Finance",
      },
      { status: 502 }
    );
  }

  const summary =
    fundamentalsResult.status === "fulfilled"
      ? fundamentalsResult.value
      : null;

  if (fundamentalsResult.status === "rejected") {
    console.error("Stock fundamentals unavailable:", fundamentalsResult.reason);
  }

  const detail = summary?.summaryDetail;
  const stats = summary?.defaultKeyStatistics;
  const financial = summary?.financialData;
  const profile = summary?.assetProfile;
  const priceInfo = summary?.price;

  const fundamentals = {
    marketCap: numeric(detail?.marketCap),
    trailingPE: numeric(detail?.trailingPE),
    forwardPE: numeric(detail?.forwardPE),
    priceToSales: numeric(detail?.priceToSalesTrailing12Months),
    beta: numeric(detail?.beta),
    dividendYield: numeric(detail?.dividendYield),
    fiftyTwoWeekLow: numeric(detail?.fiftyTwoWeekLow),
    fiftyTwoWeekHigh: numeric(detail?.fiftyTwoWeekHigh),
    totalRevenue: numeric(financial?.totalRevenue),
    revenueGrowth: numeric(financial?.revenueGrowth),
    profitMargins: numeric(financial?.profitMargins ?? stats?.profitMargins),
    grossMargins: numeric(financial?.grossMargins),
    operatingMargins: numeric(financial?.operatingMargins),
    returnOnEquity: numeric(financial?.returnOnEquity),
    totalCash: numeric(financial?.totalCash),
    totalDebt: numeric(financial?.totalDebt),
    freeCashflow: numeric(financial?.freeCashflow),
    analystTargetMean: numeric(financial?.targetMeanPrice),
    analystOpinions: numeric(financial?.numberOfAnalystOpinions),
    analystRecommendation: financial?.recommendationKey ?? null,
    currency: financial?.financialCurrency ?? priceInfo?.currency ?? null,
    sector: profile?.sector ?? null,
    industry: profile?.industry ?? null,
    companyDescription: profile?.longBusinessSummary ?? null,
  };

  const news =
    searchResult.status === "fulfilled"
      ? (searchResult.value.news || []).map((article) => ({
          id: article.uuid,
          title: article.title,
          publisher: article.publisher || "Unknown publisher",
          link: article.link,
          publishedAt: article.providerPublishTime,
          relatedTickers: article.relatedTickers || [],
        }))
      : [];

  if (searchResult.status === "rejected") {
    console.error("Stock news unavailable:", searchResult.reason);
  }

  const history = historyResult.value;
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
      confidencePercent: 0,
      reason: "At least 50 valid daily closing prices are required for this technical analysis.",
      observations: closes.length,
      fundamentals,
      news,
      source: "Yahoo Finance",
      delayedDataPossible: true,
      generatedAt: new Date().toISOString(),
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
  let confidencePercent = 50;
  let reason =
    "The technical indicators do not agree strongly enough to support a directional signal.";

  if (rsi !== null && bullishTrend && rsi >= 50 && rsi < 70) {
    signal = "BUY";
    confidencePercent = 75;
    reason =
      "Price is above SMA20, SMA20 is above SMA50, and RSI supports positive momentum. This is a technical setup, not a guarantee of future gains.";
  } else if (rsi !== null && bearishTrend && rsi <= 50 && rsi > 30) {
    signal = "SELL";
    confidencePercent = 75;
    reason =
      "Price is below SMA20, SMA20 is below SMA50, and RSI supports negative momentum. This is a technical setup, not a guarantee of future declines.";
  } else if (rsi !== null && rsi >= 70) {
    confidencePercent = 65;
    reason =
      "RSI is at or above 70. Momentum may be overextended, so the system avoids opening a new BUY signal based on these indicators alone.";
  } else if (rsi !== null && rsi <= 30) {
    confidencePercent = 65;
    reason =
      "RSI is at or below 30. The stock may be oversold, so the system avoids opening a new SELL signal based on these indicators alone.";
  }

  return NextResponse.json({
    symbol,
    status: "OK",
    signal,
    confidencePercent,
    reason,
    indicators: {
      latestClose: Number(latest.toFixed(2)),
      rsi14: rsi,
      sma20: Number(sma20.toFixed(2)),
      sma50: Number(sma50.toFixed(2)),
      dailyMomentumPercent: momentumPercent,
      trend: bullishTrend ? "BULLISH" : bearishTrend ? "BEARISH" : "MIXED",
    },
    fundamentals,
    news,
    observations: closes.length,
    source: "Yahoo Finance",
    delayedDataPossible: true,
    generatedAt: new Date().toISOString(),
  });
}
