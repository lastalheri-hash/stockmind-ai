"use client";

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

const watchlist = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "NVDA", name: "NVIDIA Corporation" },
  { symbol: "TSLA", name: "Tesla Inc." },
  { symbol: "MSFT", name: "Microsoft Corporation" },
  { symbol: "AMZN", name: "Amazon.com Inc." },
];

export default function Home() {
  const [selected, setSelected] = useState("AAPL");
  const [stocks, setStocks] = useState<Record<string, Stock>>({});
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

  const loadStocks = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const results = await Promise.all(
        watchlist.map(async (item) => {
          try {
            const response = await fetch(
              `/api/stock?symbol=${item.symbol}`,
              { cache: "no-store" }
            );

            if (!response.ok) return null;

            const data = (await response.json()) as Stock;
            return [item.symbol, data] as const;
          } catch {
            return null;
          }
        })
      );

      const successful: Record<string, Stock> = {};

      for (const result of results) {
        if (result) successful[result[0]] = result[1];
      }

      setStocks(successful);
      setLastUpdated(new Date().toLocaleTimeString());

      if (Object.keys(successful).length === 0) {
        setError("Market data is temporarily unavailable. Please try again.");
      }
    } catch {
      setError("Unable to retrieve market quotes.");
    } finally {
      setLoading(false);
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
  }, [selected, loadAnalysis]);

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
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : signal === "SELL"
        ? "border-rose-400/30 bg-rose-400/10 text-rose-700"
        : "border-amber-400/30 bg-amber-400/10 text-amber-800";

  const indicators = analysis?.indicators;
  const risk = analysis?.riskManagement;

  return (
    <main className="min-h-screen bg-[#f7faf8] px-4 py-6 text-slate-900 sm:px-6 md:px-10">
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            StockMind <span className="text-emerald-700">AI</span>
          </h1>
          <p className="mt-2 text-xs tracking-[0.18em] text-slate-600">
            EQUITY INTELLIGENCE  /  PAPER TRADING LAB
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span
            className={`h-2 w-2 rounded-full ${
              loading ? "bg-amber-400" : "bg-emerald-600"
            }`}
          />
          {loading ? "UPDATING QUOTES" : "DASHBOARD READY"}
          <button
            onClick={() => void loadStocks()}
            disabled={loading}
            className="rounded-lg border border-slate-200 px-3 py-2 text-slate-900 hover:bg-emerald-50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </header>

      <section className="mx-auto mt-8 max-w-7xl">
        <p className="text-xs font-semibold tracking-[0.2em] text-emerald-700">
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

        {error && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {error}
          </div>
        )}

        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {watchlist.map((item) => {
            const stock = stocks[item.symbol];
            const positive = (stock?.change ?? 0) >= 0;

            return (
              <button
                key={item.symbol}
                onClick={() => setSelected(item.symbol)}
                className={`rounded-2xl border p-4 text-left transition hover:border-emerald-300 ${
                  selected === item.symbol
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{item.symbol}</span>
                  <span
                    className={`text-xs ${
                      stock?.changePercent == null
                        ? "text-slate-500"
                        : positive
                          ? "text-emerald-700"
                          : "text-rose-700"
                    }`}
                  >
                    {stock?.changePercent == null
                      ? "—"
                      : `${positive ? "+" : ""}${stock.changePercent.toFixed(2)}%`}
                  </span>
                </div>
                <p className="mt-3 text-xl font-bold">{money(stock?.price)}</p>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {item.name}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 xl:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs tracking-widest text-slate-600">
                  SELECTED ASSET
                </p>
                <h3 className="mt-2 text-3xl font-bold">{selected}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {current?.name ||
                    watchlist.find((item) => item.symbol === selected)?.name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold">{money(current?.price)}</p>
                <p
                  className={`mt-2 text-sm ${
                    (current?.change ?? 0) >= 0
                      ? "text-emerald-700"
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

            <div className="mt-6 rounded-xl border border-slate-200 bg-[#f7faf8] p-3">
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
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs hover:bg-emerald-50 disabled:opacity-50"
              >
                Re-analyse
              </button>
            </div>

            {analysisLoading ? (
              <div className="mt-6 rounded-xl border border-slate-200 bg-[#f7faf8] p-6 text-sm text-slate-600">
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
                    label="REFERENCE PRICE"
                    value={money(risk?.referencePrice ?? indicators?.latestClose)}
                  />
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-[#f7faf8] p-4">
                  <p className="text-xs font-semibold tracking-widest text-slate-600">
                    RISK MANAGEMENT LEVELS
                  </p>
                  <div className="mt-4 flex justify-between gap-3 text-sm">
                    <span className="text-rose-700">Stop loss</span>
                    <strong>{money(risk?.stopLossPrice)}</strong>
                  </div>
                  <div className="mt-3 flex justify-between gap-3 text-sm">
                    <span className="text-emerald-700">Take profit</span>
                    <strong>{money(risk?.takeProfitPrice)}</strong>
                  </div>
                  <div className="mt-3 flex justify-between gap-3 text-sm">
                    <span className="text-slate-600">Reward / risk</span>
                    <strong>
                      {number(risk?.rewardToRiskRatio, 1)}:1
                    </strong>
                  </div>
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

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs tracking-widest text-emerald-700">
                SIMULATED TRADING
              </p>
              <h3 className="mt-2 text-2xl font-bold">Paper Trading Desk</h3>
              <p className="mt-2 text-sm text-slate-600">
                Practice with virtual money. No real brokerage orders are placed.
              </p>
            </div>
            <button
              onClick={() => void loadPaperPortfolio()}
              disabled={paperLoading || paperBusy}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-emerald-50 disabled:opacity-50"
            >
              {paperLoading ? "Refreshing…" : "Refresh portfolio"}
            </button>
          </div>

          {paperError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {paperError}
            </div>
          )}

          {paperMessage && (
            <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-50 p-3 text-sm text-emerald-700">
              {paperMessage}
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="PORTFOLIO EQUITY" value={money(paper?.portfolio?.equity)} />
            <Metric label="AVAILABLE CASH" value={money(paper?.portfolio?.availableCash)} />
            <Metric
              label="UNREALIZED P&L"
              value={money(paper?.portfolio?.unrealizedPnl)}
            />
            <Metric
              label="REALIZED P&L"
              value={money(paper?.portfolio?.realizedPnl)}
            />
            <Metric label="TOTAL P&L" value={money(paper?.portfolio?.totalPnl)} />
            <Metric
              label="WIN RATE"
              value={paper?.portfolio ? number(paper.portfolio.winRatePercent) + "%" : "—"}
            />
            <Metric
              label="CLOSED TRADES"
              value={paper?.portfolio ? String(paper.portfolio.totalClosedTrades) : "—"}
            />
            <Metric
              label="STARTING BALANCE"
              value={money(paper?.portfolio?.startingCash)}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-[#f7faf8] p-4">
              <h4 className="font-semibold">Open a virtual position</h4>
              <p className="mt-2 text-sm text-slate-600">
                Selected stock: <strong className="text-slate-900">{selected}</strong>
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Quote: <strong className="text-slate-900">{money(current?.price)}</strong>
              </p>

              <label className="mt-4 block text-xs text-slate-600" htmlFor="paper-quantity">
                Number of shares
              </label>
              <input
                id="paper-quantity"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-slate-900 outline-none focus:border-emerald-300"
              />

              <button
                onClick={() => void openPaperTrade()}
                disabled={paperBusy || paperLoading}
                className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-3 font-bold text-slate-900 hover:bg-emerald-300 disabled:opacity-50"
              >
                {paperBusy ? "Processing…" : "Open paper trade"}
              </button>

              <p className="mt-3 text-xs leading-5 text-slate-500">
                Backend limits: maximum position {money(paper?.limits?.maxPositionValue ?? 3000)};
                risk budget {number(paper?.limits?.riskPerTradePercent ?? 1)}% per trade.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-[#f7faf8] p-4 lg:col-span-2">
              <h4 className="font-semibold">Open positions</h4>

              {!paper?.openTrades?.length ? (
                <p className="mt-4 text-sm text-slate-500">
                  {paperLoading ? "Loading positions…" : "No open paper trades."}
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {paper.openTrades.map((trade) => {
                    const pnl = (trade.currentPrice - trade.entryPrice) * trade.quantity;

                    return (
                      <div key={trade.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-bold">{trade.symbol} · {trade.quantity} shares</p>
                            <p className="mt-1 text-xs text-slate-500">
                              Entry {money(trade.entryPrice)} · Current {money(trade.currentPrice)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={pnl >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
                              {pnl >= 0 ? "+" : ""}{money(pnl)}
                            </p>
                            <button
                              onClick={() => void closePaperTrade(trade.id)}
                              disabled={paperBusy}
                              className="mt-2 rounded-lg border border-rose-400/30 px-3 py-2 text-xs text-rose-700 hover:bg-rose-400/10 disabled:opacity-50"
                            >
                              Close position
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                          <span>Stop loss: {money(trade.stopLoss)}</span>
                          <span>Take profit: {money(trade.takeProfit)}</span>
                          <span>Value: {money(trade.positionValue)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-[#f7faf8] p-4">
            <h4 className="font-semibold">Closed trade history</h4>

            {!paper?.closedTrades?.length ? (
              <p className="mt-3 text-sm text-slate-500">
                Closed trades will appear here.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {paper.closedTrades.slice(0, 20).map((trade) => (
                  <div key={trade.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 py-3 last:border-0">
                    <div>
                      <p className="font-semibold">{trade.symbol} · {trade.quantity} shares</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Exit {money(trade.exitPrice)} · {trade.closeReason || "CLOSED"}
                      </p>
                    </div>
                    <p className={trade.realizedPnl >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
                      {trade.realizedPnl >= 0 ? "+" : ""}{money(trade.realizedPnl)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="mt-4 text-xs leading-5 text-slate-500">
            Stop-loss and take-profit checks run when the paper-trading API is requested;
            they are not a continuously running background service. Quote availability
            and delays may affect updates. On serverless hosting, this file-based portfolio
            needs persistent storage before deployment.
          </p>
        </section>

        <footer className="mt-8 border-t border-slate-200 pt-5 text-xs leading-6 text-slate-500">
          <p>StockMind AI · Yahoo Finance market data · Five-stock watchlist</p>
          <p>
            Quotes may be delayed. Paper trading is simulated; no real orders
            are sent to a brokerage.
          </p>
        </footer>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-[#f7faf8] p-3">
      <p className="text-[10px] font-semibold tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-semibold text-slate-200">
        {value}
      </p>
    </div>
  );
}
