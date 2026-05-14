# Portfolio Dashboard — Live Web App

A fully live, self-updating stock portfolio dashboard built with Next.js.
Prices refresh every 5 minutes from Finnhub (free tier, no credit card).

---

## 🔄 How to update your holdings after a Robinhood trade

Only one file ever needs to change: **`lib/data.ts`**

### On GitHub (easiest, no setup needed)

1. Go to your repo on github.com
2. Click `lib` → `data.ts`
3. Click the **pencil icon** (Edit this file) in the top right
4. Find the symbol you traded and update the `shares` number:

```ts
// Before (you bought 0.5 more shares of NVDA)
{ sym: 'NVDA', shares: 1.67, type: 'stock', name: 'NVIDIA' },

// After
{ sym: 'NVDA', shares: 2.17, type: 'stock', name: 'NVIDIA' },
```

5. Scroll down, click **"Commit changes"**
6. Vercel auto-redeploys in ~60 seconds — dashboard is updated ✓

### Adding a new holding

Copy any existing line and change the symbol, shares, type, and name:

```ts
// Adding 5 shares of AAPL as a stock
{ sym: 'AAPL', shares: 5, type: 'stock', name: 'Apple' },
```

### Moving a stock from Watchlist to Holdings (after you buy it)

1. Add it to the `HOLDINGS` array with your share count
2. Optionally remove it from `WATCHLIST` (or keep it there to track)

### Quick reference — what each field means

| Field    | What it is                        | Example         |
|----------|-----------------------------------|-----------------|
| `sym`    | Stock ticker (must be exact)      | `'NVDA'`        |
| `shares` | How many shares you own           | `1.67`          |
| `type`   | `'stock'` or `'etf'`             | `'stock'`       |
| `name`   | Display name (can be anything)    | `'NVIDIA'`      |

---

## 🚀 First-time deploy (takes ~10 minutes)

### Step 1 — Get a free Finnhub API key
1. Go to https://finnhub.io
2. Click "Get free API key" — no credit card required
3. Copy your API key from the dashboard

### Step 2 — Push to GitHub
1. Go to https://github.com and create a new repository named `portfolio-dashboard`
2. Upload all the files from this zip (drag & drop into the repo works)

### Step 3 — Deploy to Vercel (free)
1. Go to https://vercel.com, sign in with GitHub
2. Click "Add New Project" → import your `portfolio-dashboard` repo
3. Before deploying, click **"Environment Variables"** and add:
   - **Key:** `FINNHUB_API_KEY`
   - **Value:** your Finnhub key from Step 1
4. Click **Deploy** — live in ~2 minutes at `https://portfolio-dashboard-xxx.vercel.app`

---

## 📊 What updates automatically vs manually

| Data                         | How it updates            | Frequency     |
|------------------------------|---------------------------|---------------|
| Stock & ETF prices           | Finnhub API (automatic)   | Every 5 min   |
| Daily % change               | Finnhub API (automatic)   | Every 5 min   |
| Price history charts         | Finnhub API (automatic)   | Every hour    |
| **Your share counts**        | **You edit lib/data.ts**  | After trades  |
| Revenue growth, analyst tgts | You edit lib/data.ts      | Quarterly     |

---

## 📁 Project structure

```
portfolio-app/
├── app/
│   ├── page.tsx              # Main dashboard
│   ├── layout.tsx            # HTML shell
│   ├── globals.css           # Styles
│   └── api/
│       ├── quotes/route.ts   # Live price API endpoint
│       └── history/route.ts  # Price history API endpoint
├── components/
│   ├── TabHoldings.tsx       # Holdings tab
│   ├── TabAllocation.tsx     # Allocation + donut chart
│   ├── TabTrends.tsx         # Price trend charts
│   ├── TabWatchlist.tsx      # Watchlist tab
│   ├── TabAnalysis.tsx       # Long-term analysis
│   ├── TabScout.tsx          # Scout candidates
│   └── TabPlanner.tsx        # Buy planner
└── lib/
    ├── data.ts               # ← YOUR FILE TO EDIT after trades
    └── scoring.ts            # Long-term scoring algorithm
```

---

## 🛠 Running locally (optional)

```bash
cd portfolio-app
npm install
cp .env.local.example .env.local
# Edit .env.local — add your Finnhub key
npm run dev
# Open http://localhost:3000
```
