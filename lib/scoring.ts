// lib/scoring.ts

export interface ScoreInput {
  price: number
  history: number[]   // recent closes, oldest first
  revG: number        // revenue growth %
  moPct: number       // 1-month return %
  yrPct: number       // 1-year return %
  tgt: number         // analyst price target
}

export interface ScoreResult {
  score: number
  sig: 'buy' | 'watch' | 'wait'
  color: string
  a7: number
  a30: number
  rsi: number
  upside: number
  momentum: number
}

export function ltScore(input: ScoreInput): ScoreResult {
  const { price, history, revG, moPct, yrPct, tgt } = input
  if (!history || history.length < 7) {
    return { score: 0, sig: 'wait', color: '#888', a7: price, a30: price, rsi: 50, upside: 0, momentum: 0 }
  }

  // Moving averages
  const s7 = history.slice(-7)
  const a7 = s7.reduce((s, v) => s + v, 0) / s7.length
  const a30 = history.reduce((s, v) => s + v, 0) / history.length

  // 7-day momentum slope (linear regression)
  const n = 7, sl = history.slice(-7)
  const sm = 21, smq = 91
  let sy = 0, sxy = 0
  sl.forEach((v, i) => { sy += v; sxy += i * v })
  const mom = (n * sxy - sm * sy) / (n * smq - sm * sm)
  const mp = a7 > 0 ? mom / a7 * 100 : 0

  // RSI-14
  const pts = history.slice(-15)
  let g = 0, l = 0
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i] - pts[i - 1]
    if (d > 0) g += d; else l -= d
  }
  const ag = g / 14, al = l / 14
  const rsi = al === 0 ? 100 : 100 - 100 / (1 + ag / al)

  // Analyst upside
  const upside = tgt ? (tgt - price) / price * 100 : 0

  // Long-term score (100 max)
  let score = 0
  if (price > a7) score += 10
  if (price > a30) score += 15
  if (mom > 0) score += 15
  if (rsi < 65 && rsi > 35) score += 10
  if (mp > 0.2) score += 10
  if (moPct > 15) score += 10
  if (yrPct > 20) score += 10
  if (yrPct > 40) score += 5
  if (revG > 15) score += 10
  if (revG > 40) score += 5
  if (upside > 15) score += 10
  if (upside > 25) score += 5
  if (rsi > 70) score -= 10

  score = Math.max(0, Math.min(100, Math.round(score)))
  const sig = score >= 70 ? 'buy' : score >= 50 ? 'watch' : 'wait'
  const color = sig === 'buy' ? '#1d9e75' : sig === 'watch' ? '#e06c00' : '#888'

  return { score, sig, color, a7, a30, rsi, upside, momentum: mp }
}
