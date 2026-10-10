import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const indices = [
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^IXIC", name: "Nasdaq Composite" },
  { symbol: "^DJI", name: "Dow Jones" },
  { symbol: "^RUT", name: "Russell 2000" },
];

export async function GET() {
  const [gainersResult, losersResult, activeResult, ...indexResults] =
    await Promise.allSettled([
      yahoo.screener({ scrIds: "day_gainers", count: 10, region: "US", lang: "en-US" }),
      yahoo.screener({ scrIds: "day_losers", count: 10, region: "US", lang: "en-US" }),
      yahoo.screener({ scrIds: "most_actives", count: 10, region: "US", lang: "en-US" }),
      ...indices.map((index) => yahoo.quote(index.symbol)),
    ]);

  type MarketQuote = {
  symbol: string;
  shortName?: string | null;
  longName?: string | null;
  regularMarketPrice?: number | null;
  currency?: string | null;
  regularMarketChange?: number | null;
  regularMarketChangePercent?: number | null;
  regularMarketVolume?: number | null;
  marketCap?: number | null;
};

const formatStocks = (result: PromiseSettledResult<unknown>) => {
    if (result.status !== "fulfilled") return [];

    const quotes = (result.value as { quotes?: MarketQuote[] }).quotes ?? [];
    return quotes.map((stock: MarketQuote) => ({
      symbol: stock.symbol,
      name: stock.shortName || stock.longName || stock.symbol,
      price: stock.regularMarketPrice ?? null,
      currency: stock.currency || "USD",
      change: stock.regularMarketChange ?? null,
      changePercent: stock.regularMarketChangePercent ?? null,
      volume: stock.regularMarketVolume ?? null,
      marketCap: stock.marketCap ?? null,
    }));
  };

  const marketIndices = indices.map((index, position) => {
    const result = indexResults[position];

    if (result.status !== "fulfilled") {
      return { ...index, price: null, change: null, changePercent: null };
    }

    const quote = result.value;

    return {
      ...index,
      name: quote.shortName || quote.longName || index.name,
      price: quote.regularMarketPrice ?? null,
      change: quote.regularMarketChange ?? null,
      changePercent: quote.regularMarketChangePercent ?? null,
    };
  });

  const categories = [
    { name: "gainers", result: gainersResult },
    { name: "losers", result: losersResult },
    { name: "mostActive", result: activeResult },
  ];

  return NextResponse.json({
    indices: marketIndices,
    gainers: formatStocks(gainersResult),
    losers: formatStocks(losersResult),
    mostActive: formatStocks(activeResult),
    updatedAt: new Date().toISOString(),
    source: "Yahoo Finance",
    changePeriod: "Latest reported market session; not a rolling 24-hour return",
    warnings: categories
      .filter((item) => item.result.status === "rejected")
      .map((item) => `${item.name} data is temporarily unavailable`),
  });
}
