import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

const allowedSymbols = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN"];

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
    const results = await yahooFinance.search(symbol, {
      quotesCount: 0,
      newsCount: 10,
      region: "US",
      lang: "en-US",
    });

    const news = results.news.map((article) => ({
      id: article.uuid,
      title: article.title,
      publisher: article.publisher,
      link: article.link,
      publishedAt: article.providerPublishTime,
      relatedTickers: article.relatedTickers ?? [],
    }));

    return NextResponse.json({
      symbol,
      news,
      count: news.length,
      source: "Yahoo Finance",
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Market news error:", error);

    return NextResponse.json(
      { error: "Unable to load market news. Please try again later." },
      { status: 502 }
    );
  }
}
