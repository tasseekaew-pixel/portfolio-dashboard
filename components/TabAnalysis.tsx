'use client'
import '@/components/ChartSetup'
import { useState, useEffect } from 'react'
import { Line } from 'react-chartjs-2'
import { ltScore } from '@/lib/scoring'
import type { QuoteMap } from '@/app/page'

function fmt(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }
function fp(n: number) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%' }

const ANALYSIS_ITEMS = [
  { sym:'AMZN', n:'Amazon',         t:'stock', revG:12, moPct:12.6, yrPct:17.1, tgt:310 },
  { sym:'NVDA', n:'NVIDIA',         t:'stock', revG:73, moPct:19.2, yrPct:21.1, tgt:250 },
  { sym:'TSM',  n:'TSMC',           t:'stock', revG:35, moPct:8.2,  yrPct:31.6, tgt:450 },
  { sym:'GOOGL',n:'Alphabet',       t:'stock', revG:12, moPct:25.2, yrPct:28.5, tgt:430 },
  { sym:'AMD',  n:'AMD',            t:'stock', revG:22, moPct:80.4, yrPct:107.9,tgt:500 },
  { sym:'LLY',  n:'Eli Lilly',      t:'stock', revG:43, moPct:8.1,  yrPct:-5.5, tgt:1225 },
  { sym:'SPY',  n:'S&P 500 ETF',    t:'etf',   revG:0,  moPct:8.2,  yrPct:8.8,  tgt:780 },
  { sym:'VOO',  n:'Vanguard S&P',   t:'etf',   revG:0,  moPct:8.2,  yrPct:8.8,  tgt:720 },
  { sym:'VTI',  n:'Vanguard Total', t:'etf',   revG:0,  moPct:7.8,  yrPct:8.8,  tgt:385 },
]

function Sparkline({ sym, color }: { sym: string; color: string }) {
  const [chartData, setChartData] = useState<{ closes: number[]; dates: string[] } | null>(null)

  useEffect(() => {
    fetch(`/api/history?sym=${sym}&days=30`)
      .then(r => r.json())
      .then(d => { if (d.closes?.length) setChartData(d) })
      .catch(() => {})
  }, [sym])

  if (!chartData) return <div style={{ height:68, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'#999' }}>Loading…</div>

  const closes = chartData.closes
  const smaData = closes.map((_, i, a) => {
    if (i < 6) return null
    const sl = a.slice(i - 6, i + 1)
    return sl.reduce((s, v) => s + v, 0) / sl.length
  })

  return (
    <div style={{ height:68, margin:'8px 0' }}>
      <Line
        data={{
          labels: chartData.dates,
          datasets: [
            { data: closes, borderColor: color, borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false },
            { data: smaData, borderColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderDash: [3, 2], pointRadius: 0, fill: false },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false } },
        }}
      />
    </div>
  )
}

export default function TabAnalysis({ quotes, loading }: { quotes: QuoteMap; loading: boolean }) {
  const [histories, setHistories] = useState<Record<string, number[]>>({})

  useEffect(() => {
    const syms = Array.from(new Set(ANALYSIS_ITEMS.map(x => x.sym)))
    syms.forEach(sym => {
      fetch(`/api/history?sym=${sym}&days=30`)
        .then(r => r.json())
        .then(d => { if (d.closes?.length) setHistories(prev => ({ ...prev, [sym]: d.closes })) })
        .catch(() => {})
    })
  }, [])

  const scored = ANALYSIS_ITEMS.map(x => {
    const q = quotes[x.sym]
    const h = histories[x.sym] || []
    const sc = ltScore({ price: q?.price || 0, history: h, revG: x.revG, moPct: x.moPct, yrPct: x.yrPct, tgt: x.tgt })
    return { ...x, q, ...sc }
  }).sort((a, b) => b.score - a.score)

  const buy   = scored.filter(x => x.sig === 'buy')
  const watch = scored.filter(x => x.sig === 'watch')
  const wait  = scored.filter(x => x.sig === 'wait')

  function Card({ x, hi }: { x: typeof scored[0]; hi: boolean }) {
    const badgeStyle = x.score >= 70
      ? { background:'#e1f5ee', color:'#0f6e56' }
      : x.score >= 50
      ? { background:'#faeeda', color:'#854f0b' }
      : { background:'#f4f4f4', color:'#666' }

    const label = x.sig === 'buy' ? 'Strong long-term setup'
      : x.sig === 'watch' ? 'Accumulate gradually'
      : 'Wait for better entry'

    const reasons: string[] = []
    if (x.sig === 'buy') {
      if ((x.q?.price || 0) > x.a7) reasons.push(`Trading above 7-day average — near-term confirms long-term direction`)
      if (x.yrPct > 20) reasons.push(`${fp(x.yrPct)} over the past year — sustained multi-month trend`)
      if (x.revG > 15) reasons.push(`${x.revG}% revenue growth — expanding earnings power`)
      if (x.upside > 10) reasons.push(`Analyst target implies ${x.upside.toFixed(1)}% upside`)
    } else if (x.sig === 'watch') {
      reasons.push(`Trend building — consider DCA rather than lump sum`)
      if (x.rsi < 55) reasons.push(`RSI ${x.rsi.toFixed(0)} — cooling down, may form a better entry point`)
    } else {
      reasons.push(`Short-term trend unfavorable — wait for 30-day trend to turn upward`)
      if (x.rsi > 65) reasons.push(`RSI ${x.rsi.toFixed(0)} — overbought, wait for a pullback first`)
    }

    return (
      <div style={{ background:'var(--bg)', border: hi ? '1.5px solid #1d9e75' : '1px solid var(--border)', borderRadius:'var(--radius)', padding:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:500 }}>{x.sym}</div>
            <div style={{ fontSize:11, color:'var(--text3)' }}>{x.n} · {x.t.toUpperCase()}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:15, fontWeight:500 }}>{x.q ? fmt(x.q.price) : '—'}</div>
            <div style={{ fontSize:11, color: (x.q?.pct ?? 0) >= 0 ? '#1d9e75' : '#d64045' }}>
              {x.q ? fp(x.q.pct) + ' today' : '—'}
            </div>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:10 }}>
          {[['7d avg', fmt(x.a7)], ['RSI-14', x.rsi.toFixed(0)], ['1Y return', fp(x.yrPct)]].map(([lbl, val]) => (
            <div key={lbl} style={{ background:'var(--bg2)', borderRadius:8, padding:'7px 9px', textAlign:'center' }}>
              <div style={{ fontSize:10, color:'var(--text3)', marginBottom:2 }}>{lbl}</div>
              <div style={{ fontSize:13, fontWeight:500, color: lbl === '1Y return' ? (x.yrPct >= 0 ? '#1d9e75' : '#d64045') : 'var(--text)' }}>{val}</div>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
          <span style={{ fontSize:11, color:'var(--text3)' }}>Long-term score</span>
          <span style={{ fontSize:11, fontWeight:500, padding:'3px 9px', borderRadius:999, ...badgeStyle }}>{label} · {x.score}/100</span>
        </div>
        <div style={{ height:5, background:'var(--bg2)', borderRadius:3, overflow:'hidden', marginBottom:0 }}>
          <div style={{ height:'100%', borderRadius:3, background: x.color, width: x.score + '%', transition:'width .4s ease' }} />
        </div>

        <Sparkline sym={x.sym} color={x.color} />

        <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6, borderTop:'1px solid var(--border)', paddingTop:8 }}>
          {reasons.map((r, i) => <div key={i}>· {r}</div>)}
        </div>
      </div>
    )
  }

  const section = (title: string, items: typeof scored) => items.length > 0 && (
    <>
      <div style={{ fontSize:12, fontWeight:500, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>{title}</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:12, marginBottom:'1rem' }}>
        {items.map((x, i) => <Card key={x.sym} x={x} hi={i === 0 && title.startsWith('Strong')} />)}
      </div>
    </>
  )

  return (
    <div>
      <div style={{ background:'var(--bg2)', borderRadius:'var(--radius)', padding:'13px 16px', marginBottom:'1.25rem', fontSize:13, color:'var(--text2)', lineHeight:1.6 }}>
        <strong style={{ color:'var(--text)' }}>Long-term investor analysis</strong> — Signals weighted for <strong style={{ color:'var(--text)' }}>buy-and-hold</strong> investors. A "wait" means wait for a better entry, not avoid permanently. Scores update live. Not financial advice.
      </div>
      {section('Strong long-term setups — consider buying or adding', buy)}
      {section('Accumulate gradually — DCA recommended', watch)}
      {section("Wait for better entry — don't chase", wait)}
      <div style={{ fontSize:11, color:'var(--text3)', borderTop:'1px solid var(--border)', paddingTop:10, lineHeight:1.5 }}>
        Scores weight: 30-day trend, momentum, RSI, 1-year return, revenue growth, analyst target. Not financial advice.
      </div>
    </div>
  )
}
