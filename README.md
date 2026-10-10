# StockMind AI

AI-powered US stock research and decision support for retail traders.

StockMind AI combines technical analysis, company fundamentals, analyst consensus, market news, and conversational AI in one research workspace.

## Live Demo
https://stockmind-ai-eight.vercel.app/

## GitHub Repository
https://github.com/lastalheri-hash/stockmind-ai

## Key Features
- Technical indicators: RSI 14, SMA 20, SMA 50, and daily momentum.
- Rule-based BUY, SELL, and HOLD signals.
- Company fundamentals and analyst recommendations when data is available.
- Stock-related news for additional research context.
- STC-AI conversational research assistant powered by Groq.
- Signal Agreement to compare technical signals with analyst consensus.

## How It Works
1. Select a US stock ticker.
2. Review technical indicators and the generated signal.
3. Explore company fundamentals and available news.
4. Ask STC-AI questions about the stock.
5. Review risks and make your own informed decisions.

## Technology Stack
- Next.js
- React
- TypeScript
- Yahoo Finance via yahoo-finance2
- Groq API
- Vercel

## Local Setup
Install dependencies:

    npm install

Create a .env.local file with:

    GROQ_API_KEY=your_groq_api_key
    GROQ_MODEL=openai/gpt-oss-120b

Start the development server:

    npm run dev

## Limitations
Market data may be delayed, incomplete, or unavailable. AI responses can be inaccurate. The application does not claim verified trading profitability or automated order execution.

Bitget-specific market-data and execution integrations are not claimed as implemented in this version.

## Responsible Use
StockMind AI is a research tool, not personalized financial advice. BUY, SELL, and HOLD signals do not guarantee future results. Always verify important information and consider the risks before trading.

## Project Goal
Make stock research easier to understand while keeping uncertainty visible and human judgment central.
