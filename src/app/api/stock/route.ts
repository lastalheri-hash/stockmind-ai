import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "AAPL").toUpperCase();

  const allowedSymbols = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN"];

  if (!allowedSymbols.includes(symbol)) {
    return NextResponse.json(
      { error: "Unsupported stock symbol." },
      { status: 400 }
    );
  }

  try {
    const quote = await yahooFinance.quote(symbol);

    return NextResponse.json({
      symbol,
      name: quote.shortName || quote.longName || symbol,
      price: quote.regularMarketPrice ?? null,
      currency: quote.currency || "USD",
      change: quote.regularMarketChange ?? null,
      changePercent: quote.regularMarketChangePercent ?? null,
      marketState: quote.marketState || "UNKNOWN",
      updatedAt: new Date().toISOString(),
      source: "Yahoo Finance",
    });
  } catch (error) {
    console.error("Yahoo Finance request failed:", error);

    return NextResponse.json(
      { error: "Unable to retrieve stock data right now." },
      { status: 502 }
    );
  }
}
