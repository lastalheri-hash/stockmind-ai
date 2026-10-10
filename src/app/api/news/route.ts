import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const topics = [
  "stock market",
  "financial markets",
  "Federal Reserve economy",
  "technology stocks",
];

export async function GET() {
  const results = await Promise.allSettled(
    topics.map((query) =>
      yahoo.search(query, {
        quotesCount: 0,
        newsCount: 10,
        region: "US",
        lang: "en-US",
      })
    )
  );

  const articles = new Map<string, {
    id: string;
    title: string;
    publisher: string;
    link: string;
    publishedAt: unknown;
    relatedTickers: string[];
    topic: string;
  }>();

  results.forEach((result, index) => {
    if (result.status !== "fulfilled") return;

    for (const article of result.value.news || []) {
      const key = article.uuid || article.link || article.title;

      if (!key || articles.has(key)) continue;

      articles.set(key, {
        id: article.uuid || key,
        title: article.title,
        publisher: article.publisher || "Unknown publisher",
        link: article.link,
        publishedAt: article.providerPublishTime,
        relatedTickers: article.relatedTickers || [],
        topic: topics[index],
      });
    }
  });

  const news = Array.from(articles.values())
    .sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt as string).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt as string).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 30);

  return NextResponse.json({
    news,
    count: news.length,
    source: "Yahoo Finance",
    updatedAt: new Date().toISOString(),
    warnings: results
      .map((result, index) => result.status === "rejected" ? topics[index] : null)
      .filter(Boolean),
  });
}
