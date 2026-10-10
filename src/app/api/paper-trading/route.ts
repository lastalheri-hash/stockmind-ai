import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import YahooFinance from "yahoo-finance2";
import { randomUUID } from "crypto";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const yahoo = new YahooFinance();

const SYMBOLS = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN"];
const STARTING_CASH = 10_000;
const MAX_POSITION_VALUE = 3_000;
const RISK_PER_TRADE = 0.01;
const STOP_LOSS_PERCENT = 0.03;
const TAKE_PROFIT_PERCENT = 0.06;


type OpenTrade = {
  id: string;
  symbol: string;
  side: "BUY";
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionValue: number;
  openedAt: string;
  status: "OPEN";
};

type ClosedTrade = Omit<OpenTrade, "status"> & {
  status: "CLOSED";
  exitPrice: number;
  closedAt: string;
  realizedPnl: number;
  closeReason?: "STOP_LOSS" | "TAKE_PROFIT" | "MANUAL";
};

type Portfolio = {
  startingCash: number;
  cash: number;
  openTrades: OpenTrade[];
  closedTrades: ClosedTrade[];
};

function initialPortfolio(): Portfolio {
  return {
    startingCash: STARTING_CASH,
    cash: STARTING_CASH,
    openTrades: [],
    closedTrades: [],
  };
}


function getSql() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return neon(connectionString);
}

async function ensurePortfolioTable() {
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS stockmind_portfolio (
      id TEXT PRIMARY KEY,
      portfolio JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  return sql;
}

async function readPortfolio(): Promise<Portfolio> {
  const sql = await ensurePortfolioTable();

  const rows = await sql`
    SELECT portfolio
    FROM stockmind_portfolio
    WHERE id = 'main'
  `;

  if (rows.length > 0) {
    const portfolio = rows[0].portfolio as Portfolio;

    if (
      !portfolio ||
      typeof portfolio.cash !== "number" ||
      !Array.isArray(portfolio.openTrades) ||
      !Array.isArray(portfolio.closedTrades)
    ) {
      throw new Error("Invalid portfolio data in Neon database.");
    }

    return portfolio;
  }

  const portfolio = initialPortfolio();

  await sql`
    INSERT INTO stockmind_portfolio (id, portfolio)
    VALUES ('main', ${JSON.stringify(portfolio)}::jsonb)
    ON CONFLICT (id) DO NOTHING
  `;

  const savedRows = await sql`
    SELECT portfolio
    FROM stockmind_portfolio
    WHERE id = 'main'
  `;

  if (savedRows.length === 0) {
    throw new Error("Unable to initialize the paper-trading portfolio.");
  }

  return savedRows[0].portfolio as Portfolio;
}

async function writePortfolio(portfolio: Portfolio) {
  const sql = await ensurePortfolioTable();

  await sql`
    INSERT INTO stockmind_portfolio (id, portfolio, updated_at)
    VALUES ('main', ${JSON.stringify(portfolio)}::jsonb, NOW())
    ON CONFLICT (id)
    DO UPDATE SET
      portfolio = EXCLUDED.portfolio,
      updated_at = NOW()
  `;
}

async function getPrice(symbol: string): Promise<number> {
  const quote = await yahoo.quote(symbol);
  const price = quote.regularMarketPrice;

  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    throw new Error(`A valid price is unavailable for ${symbol}.`);
  }

  return price;
}

function calculateSummary(portfolio: Portfolio) {
  const openValue = portfolio.openTrades.reduce(
    (sum, trade) => sum + trade.quantity * trade.currentPrice,
    0
  );

  const realizedPnl = portfolio.closedTrades.reduce(
    (sum, trade) => sum + trade.realizedPnl,
    0
  );

  const unrealizedPnl = portfolio.openTrades.reduce(
    (sum, trade) =>
      sum + (trade.currentPrice - trade.entryPrice) * trade.quantity,
    0
  );

  const wins = portfolio.closedTrades.filter(
    (trade) => trade.realizedPnl > 0
  ).length;

  const losses = portfolio.closedTrades.filter(
    (trade) => trade.realizedPnl < 0
  ).length;

  const closedCount = portfolio.closedTrades.length;

  return {
    startingCash: portfolio.startingCash,
    availableCash: Number(portfolio.cash.toFixed(2)),
    openPositionValue: Number(openValue.toFixed(2)),
    equity: Number((portfolio.cash + openValue).toFixed(2)),
    realizedPnl: Number(realizedPnl.toFixed(2)),
    unrealizedPnl: Number(unrealizedPnl.toFixed(2)),
    totalPnl: Number((realizedPnl + unrealizedPnl).toFixed(2)),
    totalClosedTrades: closedCount,
    winningTrades: wins,
    losingTrades: losses,
    winRatePercent:
      closedCount > 0 ? Number(((wins / closedCount) * 100).toFixed(2)) : 0,
  };
}

export async function GET() {
  try {
    const portfolio = await readPortfolio();

    const updates = await Promise.all(
      portfolio.openTrades.map(async (trade) => {
        try {
          const currentPrice = await getPrice(trade.symbol);
          return { trade: { ...trade, currentPrice }, priceUpdated: true };
        } catch {
          return { trade, priceUpdated: false };
        }
      })
    );

    const remainingTrades: OpenTrade[] = [];

    for (const update of updates) {
      const trade = update.trade;
      const hitStop =
        update.priceUpdated && trade.currentPrice <= trade.stopLoss;
      const hitTarget =
        update.priceUpdated && trade.currentPrice >= trade.takeProfit;

      if (!hitStop && !hitTarget) {
        remainingTrades.push(trade);
        continue;
      }

      const exitPrice = trade.currentPrice;
      const realizedPnl = Number(
        ((exitPrice - trade.entryPrice) * trade.quantity).toFixed(2)
      );

      const closedTrade: ClosedTrade = {
        ...trade,
        currentPrice: exitPrice,
        status: "CLOSED",
        exitPrice,
        closedAt: new Date().toISOString(),
        realizedPnl,
        closeReason: hitStop ? "STOP_LOSS" : "TAKE_PROFIT",
      };

      portfolio.cash = Number(
        (portfolio.cash + exitPrice * trade.quantity).toFixed(2)
      );

      portfolio.closedTrades.push(closedTrade);
    }

    portfolio.openTrades = remainingTrades;
    await writePortfolio(portfolio);

    return NextResponse.json({
      success: true,
      portfolio: calculateSummary(portfolio),
      openTrades: portfolio.openTrades,
      closedTrades: [...portfolio.closedTrades].reverse(),
      limits: {
        startingCash: STARTING_CASH,
        maxPositionValue: MAX_POSITION_VALUE,
        riskPerTradePercent: RISK_PER_TRADE * 100,
        stopLossPercent: STOP_LOSS_PERCENT * 100,
        takeProfitPercent: TAKE_PROFIT_PERCENT * 100,
      },
    });
  } catch (error) {
    console.error("Paper trading GET error:", error);
    return NextResponse.json(
      { error: "Unable to load paper-trading portfolio." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action || "").toLowerCase();
    const portfolio = await readPortfolio();

    if (action === "open") {
      const symbol = String(body.symbol || "").toUpperCase();
      const quantity = Number(body.quantity);

      if (!SYMBOLS.includes(symbol)) {
        return NextResponse.json(
          { error: "Unsupported stock symbol." },
          { status: 400 }
        );
      }

      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        return NextResponse.json(
          { error: "Quantity must be a positive whole number of shares." },
          { status: 400 }
        );
      }

      const price = await getPrice(symbol);
      const positionValue = price * quantity;
      const equity = portfolio.cash + portfolio.openTrades.reduce(
        (sum, trade) => sum + trade.quantity * trade.currentPrice,
        0
      );

      const riskBudget = equity * RISK_PER_TRADE;
      const estimatedStopLoss = price * STOP_LOSS_PERCENT;
      const estimatedRisk = estimatedStopLoss * quantity;

      if (positionValue > MAX_POSITION_VALUE) {
        return NextResponse.json(
          { error: `Position exceeds the $${MAX_POSITION_VALUE} limit.` },
          { status: 400 }
        );
      }

      if (estimatedRisk > riskBudget) {
        return NextResponse.json(
          {
            error: "Trade exceeds the 1% portfolio risk budget.",
            riskBudget: Number(riskBudget.toFixed(2)),
            estimatedRisk: Number(estimatedRisk.toFixed(2)),
          },
          { status: 400 }
        );
      }

      if (positionValue > portfolio.cash) {
        return NextResponse.json(
          { error: "Insufficient virtual cash." },
          { status: 400 }
        );
      }

      const trade: OpenTrade = {
        id: randomUUID(),
        symbol,
        side: "BUY",
        quantity,
        entryPrice: price,
        currentPrice: price,
        stopLoss: Number((price * (1 - STOP_LOSS_PERCENT)).toFixed(2)),
        takeProfit: Number((price * (1 + TAKE_PROFIT_PERCENT)).toFixed(2)),
        positionValue: Number(positionValue.toFixed(2)),
        openedAt: new Date().toISOString(),
        status: "OPEN",
      };

      portfolio.cash = Number((portfolio.cash - positionValue).toFixed(2));
      portfolio.openTrades.push(trade);
      await writePortfolio(portfolio);

      return NextResponse.json({
        message: "Paper trade opened successfully.",
        trade,
        portfolio: calculateSummary(portfolio),
      });
    }

    if (action === "close") {
      const tradeId = String(body.tradeId || "");
      const index = portfolio.openTrades.findIndex(
        (trade) => trade.id === tradeId
      );

      if (index === -1) {
        return NextResponse.json(
          { error: "Open paper trade not found." },
          { status: 404 }
        );
      }

      const trade = portfolio.openTrades[index];
      const exitPrice = await getPrice(trade.symbol);
      const realizedPnl = Number(
        ((exitPrice - trade.entryPrice) * trade.quantity).toFixed(2)
      );

      const closedTrade: ClosedTrade = {
        ...trade,
        currentPrice: exitPrice,
        status: "CLOSED",
        exitPrice,
        closedAt: new Date().toISOString(),
        realizedPnl,
      };

      portfolio.cash = Number(
        (portfolio.cash + exitPrice * trade.quantity).toFixed(2)
      );
      portfolio.openTrades.splice(index, 1);
      portfolio.closedTrades.push(closedTrade);

      await writePortfolio(portfolio);

      return NextResponse.json({
        message: "Paper trade closed successfully.",
        trade: closedTrade,
        portfolio: calculateSummary(portfolio),
      });
    }

    return NextResponse.json(
      { error: "Action must be open or close." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Paper trade operation failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete paper-trading operation.",
      },
      { status: 500 }
    );
  }
}
