"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useCallback, useEffect, useState } from "react";
import StockChart from "@/components/StockChart";

type Stock = {
  symbol: string;
  name: string;
  price: number | null;
  currency: string;
  change: number | null;
  changePercent: number | null;
  marketState: string;
};

type Analysis = {
  symbol?: string;
  signal?: "BUY" | "SELL" | "HOLD";
  confidencePercent?: number;
  indicators?: {
    latestClose?: number;
    rsi14?: number;
    sma20?: number;
    sma50?: number;
    dailyMomentumPercent?: number;
    trend?: string;
  };
  reason?: string;
  fundamentals?: {
    marketCap?: number | null;
    trailingPE?: number | null;
    forwardPE?: number | null;
    priceToSales?: number | null;
    beta?: number | null;
    dividendYield?: number | null;
    fiftyTwoWeekLow?: number | null;
    fiftyTwoWeekHigh?: number | null;
    totalRevenue?: number | null;
    revenueGrowth?: number | null;
    profitMargins?: number | null;
    grossMargins?: number | null;
    operatingMargins?: number | null;
    returnOnEquity?: number | null;
    totalCash?: number | null;
    totalDebt?: number | null;
    freeCashflow?: number | null;
    analystTargetMean?: number | null;
    analystOpinions?: number | null;
    analystRecommendation?: string | null;
    currency?: string | null;
    sector?: string | null;
    industry?: string | null;
    companyDescription?: string | null;
  };
  news?: Array<{
    id: string;
    title: string;
    publisher: string;
    link: string;
    publishedAt: string | Date;
    relatedTickers: string[];
  }>;
  riskManagement?: {
    referencePrice?: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
    rewardToRiskRatio?: number;
    stopLossPercent?: number;
    takeProfitPercent?: number;
  };
  source?: string;
  delayedDataPossible?: boolean;
  generatedAt?: string;
  error?: string;
  [key: string]: unknown;
};

function compactMoney(value?: number | null, currency?: string | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function percentRatio(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

type PaperTrade = {
  id: string;
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionValue: number;
  openedAt: string;
  status: string;
};

type ClosedPaperTrade = PaperTrade & {
  exitPrice: number;
  closedAt: string;
  realizedPnl: number;
  closeReason?: string;
};

type PaperPortfolio = {
  startingCash: number;
  availableCash: number;
  openPositionValue: number;
  equity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  totalClosedTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number;
};

type PaperResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  portfolio?: PaperPortfolio;
  openTrades?: PaperTrade[];
  closedTrades?: ClosedPaperTrade[];
  limits?: {
    maxPositionValue: number;
    riskPerTradePercent: number;
    stopLossPercent: number;
    takeProfitPercent: number;
  };
};

type MarketStock = {
  symbol: string;
  name: string;
  price: number | null;
  currency: string;
  change: number | null;
  changePercent: number | null;
  volume?: number | null;
  marketCap?: number | null;
};

type MarketData = {
  indices: (MarketStock & { name: string })[];
  gainers: MarketStock[];
  losers: MarketStock[];
  mostActive: MarketStock[];
  updatedAt: string;
  source: string;
  changePeriod: string;
  warnings: string[];
};

type NewsArticle = {
  id: string;
  title: string;
  publisher: string;
  link: string;
  publishedAt: unknown;
  relatedTickers: string[];
  topic: string;
};

type NewsData = {
  news: NewsArticle[];
  count: number;
  source: string;
  updatedAt: string;
  warnings: string[];
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function Home() {
  const [selected, setSelected] = useState("AAPL");
  const [activePage, setActivePage] = useState<"overview" | "paper" | "ai" | "news">("overview");
  const [stocks, setStocks] = useState<Record<string, Stock>>({});
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [marketTab, setMarketTab] = useState<"gainers" | "losers" | "active">("gainers");
  const [searchSymbol, setSearchSymbol] = useState("AAPL");
  const [newsData, setNewsData] = useState<NewsData | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [paper, setPaper] = useState<PaperResponse | null>(null);
  const [paperLoading, setPaperLoading] = useState(false);
  const [paperBusy, setPaperBusy] = useState(false);
  const [paperError, setPaperError] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [paperMessage, setPaperMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hi! I'm STC-AI. Ask me about a stock's indicators, fundamentals, news, or trading risks."
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

  const loadStocks = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/market", { cache: "no-store" });
      if (!response.ok) throw new Error("Market data is temporarily unavailable.");

      const data = (await response.json()) as MarketData;
      setMarketData(data);

      const allStocks = [
        ...data.gainers,
        ...data.losers,
        ...data.mostActive,
        ...data.indices,
      ];
      setStocks((previous) => {
        const updated = { ...previous };
        for (const item of allStocks) {
          updated[item.symbol] = {
            symbol: item.symbol,
            name: item.name,
            price: item.price,
            currency: item.currency || "USD",
            change: item.change,
            changePercent: item.changePercent,
            marketState: "LATEST REPORTED SESSION",
          };
        }
        return updated;
      });
      setLastUpdated(new Date().toLocaleTimeString());
      if (data.warnings?.length) {
        setError(data.warnings.join(". "));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to retrieve market data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSelectedStock = useCallback(async (symbol: string) => {
    try {
      const response = await fetch(
        `/api/stock?symbol=${encodeURIComponent(symbol)}`,
        { cache: "no-store" }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Stock quote unavailable.");
      setStocks((previous) => ({ ...previous, [symbol]: result as Stock }));
    } catch {
      setError(`Unable to load a quote for ${symbol}. Check the ticker and try again.`);
    }
  }, []);

  const loadNews = useCallback(async () => {
    setNewsLoading(true);
    setNewsError("");
    try {
      const response = await fetch("/api/news", { cache: "no-store" });
      const result = (await response.json()) as NewsData;
      if (!response.ok) throw new Error("Market news is temporarily unavailable.");
      setNewsData(result);
    } catch (err) {
      setNewsError(err instanceof Error ? err.message : "Unable to load market news.");
    } finally {
      setNewsLoading(false);
    }
  }, []);

  const loadAnalysis = useCallback(async (symbol: string) => {
    setAnalysisLoading(true);
    setAnalysisError("");
    setAnalysis(null);

    try {
      const response = await fetch(
        `/api/analysis?symbol=${encodeURIComponent(symbol)}`,
        { cache: "no-store" }
      );

      const result = (await response.json()) as Analysis;

      if (!response.ok) {
        throw new Error(result.error || "Analysis is temporarily unavailable.");
      }

      setAnalysis(result);
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : "Unable to analyse this stock."
      );
    } finally {
      setAnalysisLoading(false);
    }
  }, []);

  const sendChat = async () => {
    const question = chatInput.trim();
    if (!question || chatLoading) return;

    const nextMessages: ChatMessage[] = [
      ...chatMessages,
      { role: "user", content: question }
    ];

    setChatMessages(nextMessages);
    setChatInput("");
    setChatError("");
    setChatLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selected,
          analysis,
          messages: nextMessages.slice(-12)
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "The AI could not answer. Please try again.");
      }

      if (typeof result.reply !== "string") {
        throw new Error("The AI returned an invalid response.");
      }

      setChatMessages((previous) => [
        ...previous,
        { role: "assistant", content: result.reply }
      ]);
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : "Unable to reach STC-AI."
      );
    } finally {
      setChatLoading(false);
    }
  };

  const loadPaperPortfolio = useCallback(async () => {
    setPaperLoading(true);
    setPaperError("");

    try {
      const response = await fetch("/api/paper-trading", {
        cache: "no-store",
      });
      const result = (await response.json()) as PaperResponse;

      if (!response.ok) {
        throw new Error(result.error || "Unable to load paper portfolio.");
      }

      setPaper(result);
    } catch (err) {
      setPaperError(
        err instanceof Error ? err.message : "Paper portfolio unavailable."
      );
    } finally {
      setPaperLoading(false);
    }
  }, []);

  const submitPaperAction = useCallback(
    async (body: Record<string, unknown>) => {
      setPaperBusy(true);
      setPaperError("");
      setPaperMessage("");

      try {
        const response = await fetch("/api/paper-trading", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const result = (await response.json()) as PaperResponse;

        if (!response.ok) {
          throw new Error(result.error || "Paper-trading action failed.");
        }

        setPaperMessage(result.message || "Paper-trading action completed.");
        await loadPaperPortfolio();
      } catch (err) {
        setPaperError(
          err instanceof Error ? err.message : "Paper-trading action failed."
        );
      } finally {
        setPaperBusy(false);
      }
    },
    [loadPaperPortfolio]
  );

  const openPaperTrade = async () => {
    const shares = Number(quantity);

    if (!Number.isSafeInteger(shares) || shares < 1) {
      setPaperError("Enter a positive whole number of shares.");
      return;
    }

    await submitPaperAction({
      action: "open",
      symbol: selected,
      quantity: shares,
    });
  };

  const closePaperTrade = async (tradeId: string) => {
    await submitPaperAction({ action: "close", tradeId });
  };

  useEffect(() => {
    void loadStocks();
    const timer = setInterval(() => void loadStocks(), 60000);
    return () => clearInterval(timer);
  }, [loadStocks]);

  useEffect(() => {
    void loadPaperPortfolio();
  }, [loadPaperPortfolio]);

  useEffect(() => {
    void loadAnalysis(selected);
    void loadSelectedStock(selected);
  }, [selected, loadAnalysis, loadSelectedStock]);

  useEffect(() => {
    if (activePage === "news") void loadNews();
  }, [activePage, loadNews]);

  const current = stocks[selected];

  const money = (value: number | null | undefined) =>
    value == null || !Number.isFinite(value)
      ? "—"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(value);

  const number = (value: number | null | undefined, digits = 2) =>
    value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);

  const signal = analysis?.signal;
  const signalClass =
    signal === "BUY"
      ? "border-indigo-200 bg-emerald-50 text-indigo-700"
      : signal === "SELL"
        ? "border-rose-400/30 bg-rose-400/10 text-rose-700"
        : "border-amber-400/30 bg-amber-400/10 text-amber-800";

  const indicators = analysis?.indicators;

  const analystRecommendation = analysis?.fundamentals?.analystRecommendation;
  const normalizedRecommendation = analystRecommendation
    ?.toLowerCase()
    .replace(/[_-]+/g, ' ')
    .trim();

  const analystTone = !normalizedRecommendation
    ? 'unknown'
    : /strong buy|buy|outperform|overweight/.test(normalizedRecommendation)
      ? 'bullish'
      : /strong sell|sell|underperform|underweight/.test(normalizedRecommendation)
        ? 'bearish'
        : /hold|neutral|equal weight|market perform/.test(normalizedRecommendation)
          ? 'neutral'
          : 'unknown';

  const technicalSignal = signal || 'HOLD';

  const signalAgreement =
    analystTone === 'unknown'
      ? {
          title: 'Analyst view unavailable',
          explanation: 'StockMind cannot compare both views because a recognized analyst consensus is not available.',
        }
      : technicalSignal === 'BUY' && analystTone === 'bullish'
        ? {
            title: 'Broadly aligned — bullish',
            explanation: 'Technical indicators and analyst consensus both lean positive. This is agreement between two views, not a guarantee of price gains.',
          }
        : technicalSignal === 'SELL' && analystTone === 'bearish'
          ? {
              title: 'Broadly aligned — bearish',
              explanation: 'Technical indicators and analyst consensus both lean negative. This agreement does not guarantee further price declines.',
            }
          : {
              title: 'Mixed signals',
              explanation: `StockMind's technical signal is ${technicalSignal}, while analyst consensus is ${analystRecommendation}. These views may use different methods and time horizons, so review both before making a decision.`,
            };

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-3 text-slate-900 sm:px-5 md:px-7">
      <header className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            StockMind <span className="text-indigo-600">AI</span>
          </h1>
          <p className="mt-1 text-[10px] tracking-[0.18em] text-slate-500">
            EQUITY INTELLIGENCE  /  MARKET RESEARCH
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-700">

          <button
            onClick={() => void loadStocks()}
            disabled={loading}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 hover:border-indigo-400 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </header>

      <nav aria-label="Main navigation" className="mx-auto mt-3 flex max-w-[1600px] flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
      <button onClick={() => setActivePage("overview")} className={activePage === "overview" ? "rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white" : "rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"}>Overview</button>
      <button onClick={() => setActivePage("ai")} className={activePage === "ai" ? "rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white" : "rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"}>STC-AI</button>
      <button onClick={() => setActivePage("news")} className={activePage === "news" ? "rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white" : "rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"}>Market News</button>
    </nav>

    <section className="mx-auto mt-3 max-w-[1600px]">
      {activePage === "overview" && (
      <>
        <p className="text-xs font-semibold tracking-[0.2em] text-indigo-700">
          STOCKMIND WORKSPACE
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-bold sm:text-4xl">
              Market Overview
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Technical analysis, risk levels and simulated trading research.
            </p>
          </div>
          <p className="text-xs text-slate-500">
            Last quote refresh: {lastUpdated || "Waiting for data"}
          </p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            const ticker = searchSymbol.trim().toUpperCase();
            if (!/^[A-Z0-9.^=-]{1,20}$/.test(ticker)) {
              setError("Enter a valid stock ticker.");
              return;
            }
            setError("");
            setSelected(ticker);
          }}
          className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row"
        >
          <div className="flex-1">
            <label htmlFor="stock-symbol" className="mb-2 block text-sm font-semibold">
              Search any stock ticker
            </label>
            <input
              id="stock-symbol"
              type="text"
              value={searchSymbol}
              onChange={(event) => setSearchSymbol(event.target.value.toUpperCase())}
              placeholder="Enter ticker, e.g. TSLA, META, AMD"
              maxLength={20}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <button
            type="submit"
            className="self-end rounded-xl bg-indigo-700 px-6 py-3 font-semibold text-white hover:bg-indigo-800"
          >
            Analyze Stock
          </button>
        </form>

        {error && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {error}
          </div>
        )}

        <section className="mt-7 space-y-6">
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold">Major Market Indices</h3>
              <span className="text-xs text-slate-500">Latest available quotes</span>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {(marketData?.indices ?? []).map((item) => {
                const positive = (item.changePercent ?? 0) >= 0;
                return (
                  <button key={item.symbol} onClick={() => setSelected(item.symbol)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-300">
                    <p className="text-sm font-semibold">{item.name}</p>
                    <p className="mt-3 text-xl font-bold">{money(item.price)}</p>
                    <p className={`mt-1 text-sm ${positive ? "text-indigo-700" : "text-rose-700"}`}>
                      {item.changePercent == null ? "—" : `${positive ? "+" : ""}${item.changePercent.toFixed(2)}%`}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div role="tablist" aria-label="Market movers" className="flex border-b border-slate-200 px-3 pt-3 sm:px-5">
              {[
                { id: "gainers", label: "Gainers" },
                { id: "losers", label: "Losers" },
                { id: "active", label: "Active" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={marketTab === tab.id}
                  onClick={() => setMarketTab(tab.id as "gainers" | "losers" | "active")}
                  className={marketTab === tab.id ? "border-b-2 border-emerald-700 px-4 py-3 text-sm font-bold text-indigo-800" : "border-b-2 border-transparent px-4 py-3 text-sm font-semibold text-slate-500 hover:text-slate-900"}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {(() => {
              const items = marketTab === "gainers"
                ? marketData?.gainers ?? []
                : marketTab === "losers"
                  ? marketData?.losers ?? []
                  : marketData?.mostActive ?? [];
              return items.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">Market data is loading or unavailable.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {items.slice(0, 8).map((item) => {
                    const positive = (item.changePercent ?? 0) >= 0;
                    return (
                      <button key={item.symbol} onClick={() => setSelected(item.symbol)} className={"flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 sm:px-5 " + (selected === item.symbol ? "bg-emerald-50" : "")}>
                        <span className="min-w-0">
                          <span className="block font-semibold">{item.symbol}</span>
                          <span className="block truncate text-xs text-slate-500">{item.name}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold">{money(item.price)}</span>
                          <span className={"text-xs " + (positive ? "text-indigo-700" : "text-rose-700")}>
                            {item.changePercent == null ? "—" : `${positive ? "+" : ""}${item.changePercent.toFixed(2)}%`}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          <p className="text-xs text-slate-500">
            {marketData?.changePeriod ?? "Percentage changes reflect the latest reported market session, not a rolling 24-hour return."}
          </p>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 xl:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs tracking-widest text-slate-600">
                  SELECTED ASSET
                </p>
                <h3 className="mt-2 text-3xl font-bold">{selected}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {current?.name || selected}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold">{money(current?.price)}</p>
                <p
                  className={`mt-2 text-sm ${
                    (current?.change ?? 0) >= 0
                      ? "text-indigo-700"
                      : "text-rose-700"
                  }`}
                >
                  {current?.change == null
                    ? "Daily change unavailable"
                    : `${current.change >= 0 ? "+" : ""}${money(current.change)} (${number(current.changePercent)}%)`}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {current?.marketState || "Market state unavailable"}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <StockChart symbol={selected} />
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Market data source: Yahoo Finance. Quotes and historical data may
              be delayed or temporarily unavailable.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs tracking-widest text-slate-600">
                  TECHNICAL RESEARCH
                </p>
                <h3 className="mt-2 text-xl font-bold">AI Market Analyst</h3>
              </div>
              <button
                onClick={() => void loadAnalysis(selected)}
                disabled={analysisLoading}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs hover:bg-indigo-50 disabled:opacity-50"
              >
                Re-analyse
              </button>
            </div>

            {analysisLoading ? (
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                Analysing technical indicators and risk conditions…
              </div>
            ) : analysisError ? (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-800">
                  Analysis unavailable
                </p>
                <p className="mt-2 text-sm text-slate-600">{analysisError}</p>
              </div>
            ) : analysis ? (
              <>
                <div
                  className={`mt-5 rounded-xl border p-5 ${signalClass}`}
                >
                  <p className="text-xs font-semibold tracking-widest">
                    TECHNICAL SIGNAL
                  </p>
                  <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                    <p className="text-3xl font-black">
                      {signal || "HOLD"}
                    </p>
                    <p className="text-sm">
                      Indicator score:{" "}
                      <strong>
                        {number(analysis.confidencePercent, 0)}%
                      </strong>
                    </p>
                  </div>
                  <p className="mt-3 text-xs leading-5 opacity-80">
                    This score reflects indicator agreement, not a verified
                    probability of profit.
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Metric label="TREND" value={indicators?.trend || "—"} />
                  <Metric
                    label="RSI (14)"
                    value={number(indicators?.rsi14)}
                  />
                  <Metric
                    label="SMA 20"
                    value={money(indicators?.sma20)}
                  />
                  <Metric
                    label="SMA 50"
                    value={money(indicators?.sma50)}
                  />
                  <Metric
                    label="DAILY MOMENTUM"
                    value={
                      indicators?.dailyMomentumPercent == null
                        ? "—"
                        : `${number(indicators.dailyMomentumPercent)}%`
                    }
                  />
                  <Metric
                    label="LATEST PRICE"
                    value={money(indicators?.latestClose)}
                  />
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-semibold tracking-widest text-slate-500">WHY THIS SIGNAL?</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {analysis.reason || "The signal is based on the available technical indicators. Review the trend, moving averages and RSI before making a decision."}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Rule-based analysis, not a prediction of guaranteed profit.
                  </p>
                </div>

                <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/60 p-5">
                  <p className="text-xs font-semibold tracking-widest text-indigo-700">SIGNAL AGREEMENT</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">{signalAgreement.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{signalAgreement.explanation}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs text-slate-500">TECHNICAL SIGNAL</p>
                      <p className="mt-1 font-semibold text-slate-900">{technicalSignal}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs text-slate-500">ANALYST CONSENSUS</p>
                      <p className="mt-1 font-semibold text-slate-900">{analystRecommendation || 'Unavailable'}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    Analyst opinions and price targets are estimates, not guarantees. This comparison does not change StockMind's technical trading rules.
                  </p>
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-semibold tracking-widest text-slate-500">COMPANY FUNDAMENTALS</p>
                  {analysis.fundamentals ? (
                    <>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <Metric label="MARKET CAP" value={compactMoney(analysis.fundamentals.marketCap, analysis.fundamentals.currency)} />
                        <Metric label="TRAILING P/E" value={number(analysis.fundamentals.trailingPE)} />
                        <Metric label="FORWARD P/E" value={number(analysis.fundamentals.forwardPE)} />
                        <Metric label="REVENUE" value={compactMoney(analysis.fundamentals.totalRevenue, analysis.fundamentals.currency)} />
                        <Metric label="PROFIT MARGIN" value={percentRatio(analysis.fundamentals.profitMargins)} />
                        <Metric label="REVENUE GROWTH" value={percentRatio(analysis.fundamentals.revenueGrowth)} />
                        <Metric label="OPERATING MARGIN" value={percentRatio(analysis.fundamentals.operatingMargins)} />
                        <Metric label="RETURN ON EQUITY" value={percentRatio(analysis.fundamentals.returnOnEquity)} />
                        <Metric label="FREE CASH FLOW" value={compactMoney(analysis.fundamentals.freeCashflow, analysis.fundamentals.currency)} />
                        <Metric label="TOTAL DEBT" value={compactMoney(analysis.fundamentals.totalDebt, analysis.fundamentals.currency)} />
                        <Metric label="52-WEEK LOW" value={money(analysis.fundamentals.fiftyTwoWeekLow)} />
                        <Metric label="52-WEEK HIGH" value={money(analysis.fundamentals.fiftyTwoWeekHigh)} />
                      </div>
                      {(analysis.fundamentals.sector || analysis.fundamentals.industry) && (
                        <p className="mt-4 text-xs text-slate-500">
                          {[analysis.fundamentals.sector, analysis.fundamentals.industry].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {analysis.fundamentals.analystRecommendation && (
                        <p className="mt-2 text-sm text-slate-600">
                          Analyst consensus: <strong>{analysis.fundamentals.analystRecommendation}</strong>
                          {analysis.fundamentals.analystOpinions ? ` (${analysis.fundamentals.analystOpinions} opinions)` : ""}
                          {analysis.fundamentals.analystTargetMean != null ? ` · Average target ${money(analysis.fundamentals.analystTargetMean)}` : ""}
                        </p>
                      )}
                      {analysis.fundamentals.companyDescription && (
                        <p className="mt-3 text-sm leading-6 text-slate-600">
                          {analysis.fundamentals.companyDescription}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">Company fundamentals are unavailable for this symbol right now.</p>
                  )}
                  <p className="mt-3 text-xs text-slate-500">
                    Metrics may be unavailable for some symbols. Valuation and analyst targets are not guarantees of future performance.
                  </p>
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-semibold tracking-widest text-slate-500">LATEST STOCK NEWS</p>
                  {analysis.news && analysis.news.length > 0 ? (
                    <div className="mt-3 divide-y divide-slate-100">
                      {analysis.news.map((article) => (
                        <a
                          key={article.id}
                          href={article.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block py-3 first:pt-0 hover:text-indigo-800"
                        >
                          <span className="text-sm font-semibold leading-5">{article.title}</span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {article.publisher}
                            {article.publishedAt && !Number.isNaN(new Date(article.publishedAt).getTime())
                              ? ` · ${new Date(article.publishedAt).toLocaleDateString()}`
                              : ""}
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">No recent company news was returned. This does not mean there is no news.</p>
                  )}
                  <p className="mt-3 text-xs text-slate-500">News supplied by Yahoo Finance. Headlines alone do not determine the trading signal.</p>
                </div>


              </>
            ) : (
              <div className="mt-6 text-sm text-slate-600">
                No analysis is available for this stock yet.
              </div>
            )}

            <p className="mt-4 text-xs leading-5 text-slate-500">
              Research only, not financial advice. Signals are rule-based and
              should not be treated as guaranteed trading recommendations.
            </p>
          </section>
        </div>

        </>
      )}

      {activePage === "ai" && (
        <section className="mx-auto max-w-5xl">
          <div className="mb-6">
  
          {/* STOCKMIND_FIRST_SCREEN_TERMINAL */}
          <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-2xl shadow-black/20">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-[10px] font-bold tracking-[0.22em] text-indigo-600">STOCKMIND TERMINAL</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <h2 className="text-xl font-black text-slate-900">{selected}</h2>
                  <span className="text-xs text-slate-500">{current?.name || "Loading company…"}</span>
                  <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] text-slate-700">{current?.marketState || "Market status unavailable"}</span>
                </div>
              </div>
              <form onSubmit={(event) => {
                event.preventDefault();
                const ticker = searchSymbol.trim().toUpperCase();
                if (!/^[A-Z0-9.^=-]{1,20}$/.test(ticker)) {
                  setError("Enter a valid stock ticker.");
                  return;
                }
                setError("");
                setSelected(ticker);
              }} className="flex min-w-0 gap-2">
                <input aria-label="Stock ticker" value={searchSymbol} onChange={(event) => setSearchSymbol(event.target.value.toUpperCase())} placeholder="Ticker e.g. TSLA" maxLength={20} className="w-32 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 sm:w-40" />
                <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-[#08111b] hover:bg-indigo-700">Analyze</button>
              </form>
            </div>

            <div className="grid min-w-0 gap-3 p-3 lg:grid-cols-12">
              <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 lg:col-span-8">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold tracking-widest text-slate-500">LATEST REPORTED PRICE</p>
                    <p className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{money(current?.price)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${(current?.change ?? 0) >= 0 ? "text-indigo-600" : "text-rose-400"}`}>
                      {current?.change == null ? "Change unavailable" : `${current.change >= 0 ? "+" : ""}${money(current.change)} (${number(current.changePercent)}%)`}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">Updated {lastUpdated || "when data arrives"}</p>
                  </div>
                </div>
                <div className="mt-3 h-[260px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-1 sm:h-[310px]">
                  <StockChart symbol={selected} />
                </div>
                <p className="mt-2 text-[10px] text-slate-500">Quotes and chart data may be delayed or temporarily unavailable.</p>
              </section>

              <aside className="grid content-start gap-3 lg:col-span-4">
                <section className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold tracking-widest text-slate-500">STOCKMIND SIGNAL</p>
                    <button onClick={() => void loadAnalysis(selected)} disabled={analysisLoading} className="rounded-md border border-slate-300 px-2 py-1 text-[10px] text-slate-700 hover:border-indigo-400 disabled:opacity-50">{analysisLoading ? "Checking…" : "Refresh"}</button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className={`rounded-lg border px-3 py-2 text-lg font-black ${signal === "BUY" ? "border-indigo-400/40 bg-indigo-50 text-indigo-700" : signal === "SELL" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{analysisLoading ? "…" : signal || "HOLD"}</span>
                    <div className="text-right">
                      <p className="text-xl font-black text-slate-900">{number(analysis?.confidencePercent, 0)}%</p>
                      <p className="text-[10px] text-slate-500">Indicator agreement</p>
                    </div>
                  </div>
                  {analysisError && <p className="mt-2 text-xs text-amber-300">{analysisError}</p>}
                  <p className="mt-2 text-xs leading-5 text-slate-500">{analysis?.reason || (analysisLoading ? "Analysing available indicators…" : "Analysis will appear when data is available.")}</p>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-bold tracking-widest text-slate-500">TECHNICAL SNAPSHOT</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {[
                      ["TREND", indicators?.trend || "—"],
                      ["RSI (14)", number(indicators?.rsi14)],
                      ["SMA 20", money(indicators?.sma20)],
                      ["SMA 50", money(indicators?.sma50)],
                      ["MOMENTUM", indicators?.dailyMomentumPercent == null ? "—" : number(indicators.dailyMomentumPercent) + "%"],
                      ["LATEST CLOSE", money(indicators?.latestClose)]
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-2">
                        <p className="text-[9px] font-semibold tracking-wider text-slate-500">{label}</p>
                        <p className="mt-1 truncate text-sm font-bold text-slate-900">{value}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-bold tracking-widest text-slate-500">RISK REFERENCES</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div><p className="text-[9px] text-slate-500">REFERENCE</p><p className="mt-1 text-xs font-bold text-slate-900">{money(analysis?.riskManagement?.referencePrice)}</p></div>
                    <div><p className="text-[9px] text-slate-500">STOP LOSS</p><p className="mt-1 text-xs font-bold text-rose-400">{money(analysis?.riskManagement?.stopLossPrice)}</p></div>
                    <div><p className="text-[9px] text-slate-500">TAKE PROFIT</p><p className="mt-1 text-xs font-bold text-indigo-600">{money(analysis?.riskManagement?.takeProfitPrice)}</p></div>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">Reference levels are estimates, not orders or guarantees.</p>
                </section>

                <section className="rounded-xl border border-indigo-400/20 bg-indigo-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold tracking-widest text-indigo-600">ASK STC-AI</p>
                    <button type="button" onClick={() => setActivePage("ai")} className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-700">Open chat ↗</button>
                  </div>
                  <form onSubmit={(event) => { event.preventDefault(); void sendChat(); }} className="mt-2 flex gap-2">
                    <input aria-label="Ask STC-AI" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder={`Ask about ${selected}…`} maxLength={3000} disabled={chatLoading} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-indigo-400 disabled:opacity-50" />
                    <button type="submit" disabled={chatLoading || !chatInput.trim()} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-[#08111b] disabled:opacity-40">{chatLoading ? "…" : "Ask"}</button>
                  </form>
                  {chatError && <p className="mt-2 text-[10px] text-amber-300">{chatError}</p>}
                  <p className="mt-2 text-[10px] text-slate-500">AI research only. It does not guarantee trading outcomes.</p>
                </section>
              </aside>
            </div>
          </section>

          <p className="text-xs font-semibold tracking-[0.2em] text-indigo-700">
              STC-AI CONVERSATIONAL ASSISTANT
            </p>
            <h2 className="mt-2 text-3xl font-bold">Ask your stock analyst</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Discuss technical indicators, company fundamentals, market news and trading risks.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="font-semibold text-slate-900">STC-AI</p>
                <p className="mt-1 text-xs text-slate-500">
                  Current stock: {selected} · Context-aware research assistant
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setChatMessages([{
                    role: "assistant",
                    content: "Hi! I'm STC-AI. Ask me about a stock's indicators, fundamentals, news, or trading risks."
                  }]);
                  setChatError("");
                }}
                disabled={chatLoading}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                New conversation
              </button>
            </div>

            <div className="max-h-[55vh] min-h-[300px] space-y-4 overflow-y-auto p-4 sm:p-6" aria-live="polite">
              {chatMessages.map((message, index) => (
                <div
                  key={index}
                  className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={
                      message.role === "user"
                        ? "max-w-[90%] rounded-2xl rounded-br-sm bg-indigo-700 px-4 py-3 text-sm leading-6 text-white sm:max-w-[80%]"
                        : "max-w-[95%] rounded-2xl rounded-bl-sm border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800 sm:max-w-[85%]"
                    }
                  >
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider opacity-70">
                      {message.role === "user" ? "You" : "STC-AI"}
                    </p>
                    <div className="break-words [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:font-semibold [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_strong]:font-bold [&_a]:text-indigo-600 [&_a]:underline [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:p-2 [&_td]:border [&_td]:border-slate-300 [&_td]:p-2"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div className="flex justify-start">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    STC-AI is thinking…
                  </div>
                </div>
              )}

              {chatError && (
                <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  {chatError}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap gap-2">
                {[
                  "Explain the current " + selected + " analysis",
                  "What risks should I consider?",
                  "Explain RSI and moving averages"
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={chatLoading}
                    onClick={() => setChatInput(suggestion)}
                    className="rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendChat();
                }}
                className="flex items-end gap-2"
              >
                <label className="sr-only" htmlFor="stc-ai-chat-input">
                  Message STC-AI
                </label>
                <textarea
                  id="stc-ai-chat-input"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendChat();
                    }
                  }}
                  placeholder={"Ask about " + selected + " or the stock market…"}
                  maxLength={3000}
                  rows={2}
                  disabled={chatLoading}
                  className="min-h-[52px] flex-1 resize-y rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="rounded-xl bg-indigo-700 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {chatLoading ? "Sending…" : "Send"}
                </button>
              </form>

              <p className="mt-3 text-xs leading-5 text-slate-500">
                Research assistance only, not financial advice. Market data may be delayed.
                STC-AI cannot guarantee trading outcomes. Press Enter to send or Shift+Enter for a new line.
              </p>
            </div>
          </div>
        </section>
      )}

      {activePage === "news" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-widest text-indigo-700">MARKET INTELLIGENCE</p>
              <h2 className="mt-2 text-3xl font-bold text-slate-900">Market News</h2>
              <p className="mt-2 text-sm text-slate-600">
                Financial markets, technology stocks, economic updates and Federal Reserve news.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Source: {newsData?.source || "Yahoo Finance"}
                {newsData?.updatedAt ? " · Updated " + new Date(newsData.updatedAt).toLocaleTimeString() : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadNews()}
              disabled={newsLoading}
              className="rounded-xl bg-indigo-700 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
            >
              {newsLoading ? "Refreshing…" : "Refresh News"}
            </button>
          </div>

          {newsLoading && (
            <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Loading the latest available headlines…
            </p>
          )}

          {newsError && (
            <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm text-rose-800">{newsError}</p>
              <button
                type="button"
                onClick={() => void loadNews()}
                className="mt-3 text-sm font-semibold text-rose-800 underline"
              >
                Try again
              </button>
            </div>
          )}

          {newsData?.warnings && newsData.warnings.length > 0 && (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              Some news searches did not respond. Available headlines are shown below.
            </p>
          )}

          {newsData && newsData.news.length > 0 && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {newsData.news.map((article) => {
                const rawDate = article.publishedAt;
                const timestamp = typeof rawDate === "number"
                  ? (rawDate < 1000000000000 ? rawDate * 1000 : rawDate)
                  : rawDate ? new Date(String(rawDate)).getTime() : NaN;
                const dateLabel = Number.isFinite(timestamp)
                  ? new Date(timestamp).toLocaleString()
                  : "Publication time unavailable";

                return (
                  <article
                    key={article.id}
                    className="flex h-full flex-col rounded-2xl border border-slate-200 p-5 transition hover:border-emerald-500 hover:shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-indigo-800">
                        {article.topic}
                      </span>
                      {article.relatedTickers?.slice(0, 3).map((ticker) => (
                        <button
                          key={ticker}
                          type="button"
                          onClick={() => {
                            setSearchSymbol(ticker);
                            setSelected(ticker);
                            setActivePage("overview");
                          }}
                          className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-emerald-100"
                        >
                          {ticker}
                        </button>
                      ))}
                    </div>
                    <h3 className="mt-4 text-lg font-semibold leading-7 text-slate-900">
                      {article.title}
                    </h3>
                    <div className="mt-auto pt-5">
                      <p className="text-xs text-slate-500">{article.publisher}</p>
                      <p className="mt-1 text-xs text-slate-500">{dateLabel}</p>
                      <a
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex text-sm font-semibold text-indigo-700 hover:text-emerald-900"
                      >
                        Read original article ↗
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!newsLoading && !newsError && newsData && newsData.news.length === 0 && (
            <p className="mt-6 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
              No headlines are available right now. Try refreshing in a little while.
            </p>
          )}

          <p className="mt-6 text-xs leading-5 text-slate-500">
            Headlines are provided by Yahoo Finance. Publication times and availability depend on the original source.
            News is for information only and is not a trading recommendation.
          </p>
        </section>
      )}

      <footer className="mt-8 border-t border-slate-200 pt-5 text-xs leading-6 text-slate-500">
          <p>StockMind AI · Yahoo Finance market data · General market coverage</p>
          <p>
            Quotes may be delayed. StockMind AI provides research tools; no real orders
            are sent to a brokerage.
          </p>
        </footer>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[10px] font-semibold tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-semibold text-slate-900">
        {value}
      </p>
    </div>
  );
}
