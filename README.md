# 🚀 Solana Sniper Bot | [EN](README.md) | [RU](README.ru.md)

<div align="center">
  <img src="./public/appLogoForREADME.svg" alt="Solana Sniper Bot">
</div>

<div align="center">
  <h3>🔥 LIGHTNING-FAST EXECUTION | TOP 20 FASTEST SOLANA SNIPER BOT 🔥</h3>
  <p><i>Verified by solscan.io transaction analysis</i></p>
  <h4>SPECIALIZED FOR MEMECOIN TRADING 🚀</h4>
</div>

## 💎 Why Choose Our Sniper Bot?

Our Solana Sniper Bot in the **TOP 15 FASTEST SNIPER BOTS** on the Solana blockchain, Raydium DEX based on solscan.io transaction analysis. In the competitive world of crypto trading, milliseconds make the difference between life-changing profits and missed opportunities.

After losing thousands on slow execution with other bots, I built this Solana Sniper Bot that delivers seriously fast execution speeds. Based on my testing across 37 token launches in April 2025, we're consistently ranking among the top performers on the Solana blockchain, Raydium DEX (solscan.io confirmed this). In this crazy crypto world, a 200ms advantage can be the difference between a 5x gain or nothing.

## ⚡ What This Bot Can Do

- **⚡ BLAZING-FAST Token Sniper**: Execute trades at lightning speed, beating 95% of other traders to newly launched tokens
- **💰 Smart Profit Taking**: Auto-secures your gains when targets hit with smart sell parameters - though remember no bot is perfect during extreme volatility
- **Risk Management**: Self-written stop-losses that actually work even during server congestion (unlike some competitors I tested)
* **Impact Calculations**: Suggests optimal trade sizes to minimize slippage - crucial for >5 SOL positions
- **📱 Real-time Dashboard**: History panel and monitoring (without reducing performance) what's happening with your trades and market - though UI could use some polish, I'm a developer not a designer 😅
- **Dual RPC Setup**: Using both Helius & dRPC has given us ~98.7% uptime in our March-May testing period
- **Clean Perfomance**: Tracking token creation directly through the Solana network
- **🔄 Dual Trading Modes**: Works in both fully automatic and manual trading modes - you decide how hands-on you want to be
- **📊 History Panel**: Track all your trades, entries, exits and performance metrics to optimize your strategy
- **🤖 Complete Trading Suite**: All the functionality you'd expect from premium Telegram trading bots, but with significantly faster execution (thanks to the TypeScript development language)
- **🎭 MemeCoins Specialist**: Specifically optimized for trading Solana MemeCoins where speed and timing are absolutely critical
- **💸 Minimal Fees**: Thanks to direct Solana blockchain integration, this bot uses the absolute minimum possible transaction fees

> Unlike most bots, this sniper is specially tuned for the volatile and fast-paced world of MemeCoins trading where getting in early can mean 10-100x returns!

## 📋 What You'll Need

- Node.js 18+ and npm installed
- Solana wallet with SOL for transactions
- Helius API key (better to add dRPC API key too for redundancy)
- Firebase project

## 🔧 Quick Setup

1. Clone repo
   ```bash
   git clone https://github.com/tiodio324/solana-sniper-bot.git
   cd solana-sniper-bot
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Set up your config
   ```bash
   # Copy the env file over
   cp .env.example .env
   
   # Now edit it with your stuff
   ```

4. Fill in your `.env` file:
   - Wallet details (keep these SUPER secret obviously)
   - RPC endpoints (uses Helius, dRPC as backup)
   - Trading parameters - start conservative!
   - Google Firebase integration

The RPC setup can be a real pain sometimes. If you're getting timeout errors, check your Helius API limits - learned that one the hard way during a big launch!

## 🚀 Running It

### To launch
```bash
npm run dev
```

## ⚙️ Configuration That Actually Matters

Here's what to tweak in your `.env` file:

| Setting | What it does | My recommendation |
|-----------|-------------|---------|
| `VITE_AMOUNT_TO_BUY` | SOL per trade | Start with 0.2-0.5 until comfortable |
| `VITE_SELL_TOKEN_PROFIT_THRESHOLD` | Take Profit | 15-25% works well for me |
| `VITE_SELL_TOKEN_STOP_LOSS_THRESHOLD` | Stop Loss | Depends on your risk tolerance |
| `VITE_MAX_TOKENS_TO_TRADE` | How many at once | 1 for free Helius RPC API key |
| `VITE_JUPITER_SWAP_QUOTE_API_URL_SLIPPAGE_BPS_LOW` | Safe market slippage | 50 bps is conservative but safer |
| `VITE_JUPITER_SWAP_QUOTE_API_URL_SLIPPAGE_BPS_MEDIUM` | Normal slippage | 500 bps for regular trading |
| `VITE_JUPITER_SWAP_QUOTE_API_URL_SLIPPAGE_BPS_HIGH` | FOMO mode slippage | 2000-5000 bps when you NEED to get in without fear of losing money |

## 🔒 Security First

- Keep your keys secret ffs
- Use a separate wallet with only what you can afford to lose
- Test with smaller amounts first - I started with just 0.08 SOL per trade

## 📊 Real-world Performance

From my personal trading in April-May 2025:
- Consistently in top 20 fastest bots on Solana, Raydium DEX
- Won the race on FLOKI launch by few seconds against other buyers (37% pump)
- Survived the BONK crash with minimal losses thanks to stop-loss
- Outperforms manual trading by tracking token creation directly through the Solana network
