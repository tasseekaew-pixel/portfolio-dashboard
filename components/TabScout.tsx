'use client'
import '@/components/ChartSetup'
import { useState, useEffect, useRef } from 'react'
import { Line } from 'react-chartjs-2'
import type { QuoteMap } from '@/app/page'

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtB(n: number) {
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'T'
  if (n >= 1000)    return '$' + (n / 1000).toFixed(1) + 'B'
  return '$' + n.toFixed(0) + 'M'
}
function fp(n: number) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%' }
function pc(n: number) { return n >= 0 ? '#1d9e75' : '#d64045' }

interface ScoutStock {
  sym:           string
  name:          string
  sec:           string
  price:         number
  pct:           number
  prev:          number
  marketCap:     number
  pe:            number | null
  revGrowth:     number | null
  week52High:    number | null
  week52Low:     number | null
  analystTarget: number | null
  headlines:     string[]
  why:           string
  risk:          string
  verdict:       string
  ltScore:       number
  topPick:       boolean
  rank:          number
}

function Spark({ sym, color }: { sym: string; color: string }) {
  const ref  = useRef<HTMLCanvasElement>(null)
  const cref = useRef<any>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/history?sym=${sym}&days=30`)
      .then(r => r.json())
      .then(async data => {
        if (cancelled || !ref.current || !data.closes?.length) return
        if (cref.current) cref.current.destroy()
        cref.current = new (await import('chart.js')).Chart(ref.current, {
          type: 'line',
          data: {
            labels: data.dates,
            datasets: [{
              data: data.closes, borderColor: color,
              backgroundColor: color + '22', borderWidth: 2,
              pointRadius: 0, tension: 0.3, fill: true,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: {
              label: (c: any) => ` $${Number(c.raw).toFixed(2)}`
            }}},
            scales: { x: { display: false }, y: { display: false } },
          },
        } as any)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      cref.current?.destroy()
    }
  }, [sym])

  return <div style={{ height: 68, margin: '8px 0' }}><canvas ref={ref} /></div>
}

function ScoutCard({ s }: { s: ScoutStock }) {
  const bc       = s.ltScore >= 70 ? '#1d9e75' : s.ltScore >= 50 ? '#e06c00' : '#888'
  const badgeBg  = s.ltScore >= 70 ? '#e1f5ee' : s.ltScore >= 50 ? '#faeeda' : '#f4f4f4'
  const badgeTxt = s.ltScore >= 70 ? '#0f6e56' : s.ltScore >= 50 ? '#854f0b' : '#666'
  const upside   = s.analystTarget && s.price
    ? ((s.analystTarget - s.price) / s.price * 100) : null

  return (
    <div style={{
      background: 'var(--bg)', padding: 16,
      border: s.topPick ? '1.5px solid #1d9e75' : '1px solid var(--border)',
      borderRadius: 'var(--radius)', position: 'relative',
    }}>
      {s.topPick && (
        <div style={{ position: 'absolute', top: -1, right: 14,
          background: '#1d9e75', color: '#fff', fontSize: 10,
          fontWeight: 500, padding: '2px 8px', borderRadius: '0 0 6px 6px' }}>
          Top pick
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{s.sym}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{s.name}</div>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 500,
            marginTop: 5, display: 'inline-block', background: '#eeedfe', color: '#3c3489' }}>
            {s.sec}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{fmt(s.price)}</div>
          <div style={{ fontSize: 12, color: pc(s.pct) }}>{fp(s.pct)} today</div>
          {s.analystTarget && (
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
              Target: {fmt(s.analystTarget)}
            </div>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, marginBottom: 10 }}>
        {[
          ['Mkt cap',   s.marketCap ? fmtB(s.marketCap) : '—'],
          ['PE',        s.pe ? s.pe.toFixed(0) : '—'],
          ['Rev growth',s.revGrowth ? fp(s.revGrowth) : '—'],
          ['Upside',    upside !== null ? fp(upside) : '—'],
        ].map(([lbl, val]) => (
          <div key={lbl} style={{ background: 'var(--bg2)', borderRadius: 8,
            padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--text3)', marginBottom: 2,
              textTransform: 'uppercase' }}>{lbl}</div>
            <div style={{ fontSize: 12, fontWeight: 500,
              color: lbl === 'Upside' && upside !== null ? pc(upside) :
                     lbl === 'Rev growth' && s.revGrowth !== null ? pc(s.revGrowth) : 'var(--text)' }}>
              {val}
            </div>
          </div>
        ))}
      </div>

      {/* Sparkline */}
      <Spark sym={s.sym} color={bc} />

      {/* Score bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>Long-term score</span>
        <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 999,
          background: badgeBg, color: badgeTxt }}>
          {s.verdict} · {s.ltScore}/100
        </span>
      </div>
      <div style={{ height: 5, background: 'var(--bg2)', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ height: '100%', borderRadius: 3, background: bc,
          width: s.ltScore + '%', transition: 'width .4s ease' }} />
      </div>

      {/* Analysis */}
      {s.why && (
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6,
          borderTop: '1px solid var(--border)', paddingTop: 8, marginBottom: s.risk ? 8 : 0 }}>
          {s.why}
        </div>
      )}
      {s.risk && (
        <div style={{ fontSize: 11, color: '#e06c00', lineHeight: 1.5,
          background: '#faeeda', borderRadius: 6, padding: '6px 10px' }}>
          ⚠ {s.risk}
        </div>
      )}

      {/* Recent headlines */}
      {s.headlines?.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase',
            letterSpacing: '.05em', marginBottom: 6 }}>Recent news</div>
          {s.headlines.slice(0, 2).map((h, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.4,
              marginBottom: 4, paddingLeft: 8, borderLeft: '2px solid var(--border)' }}>
              {h}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TabScout({ quotes }: { quotes: QuoteMap }) {
  const [stocks,     setStocks    ] = useState<ScoutStock[]>([])
  const [loading,    setLoading   ] = useState(true)
  const [error,      setError     ] = useState('')
  const [generatedAt,setGeneratedAt] = useState('')
  const [evaluated,  setEvaluated ] = useState(0)
  const [filter,     setFilter    ] = useState('all')

  const fetchScout = async () => {
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/scout', { cache: 'no-store' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setStocks(data.stocks || [])
      setGeneratedAt(data.generatedAt
        ? new Date(data.generatedAt).toLocaleString()
        : '')
      setEvaluated(data.candidatesEvaluated || 0)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchScout() }, [])

  const sectors = ['all', ...Array.from(new Set(stocks.map(s => s.sec.split('/')[0].trim())))]
  const filtered = filter === 'all'
    ? stocks
    : stocks.filter(s => s.sec.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div>
      {/* Hero */}
      <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)',
        padding: '13px 16px', marginBottom: '1.25rem', fontSize: 13,
        color: 'var(--text2)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text)' }}>Live stock scout</strong> — Scans{' '}
        {evaluated > 0 ? <strong style={{ color: 'var(--text)' }}>{evaluated} candidates</strong> : 'the market'}
        {' '}using Finnhub market news, momentum, fundamentals, and{' '}
        <strong style={{ color: 'var(--text)' }}>Gemini AI analysis</strong> to surface
        the strongest long-term picks right now. Refreshes every 4 hours.
        {generatedAt && <span style={{ color: 'var(--text3)', fontSize: 11 }}> · Last run: {generatedAt}</span>}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 10, marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>Filter:</span>
          {sectors.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              style={{ fontSize: 12, padding: '4px 12px', border: '1px solid var(--border)',
                borderRadius: 999, cursor: 'pointer',
                background: s === filter ? '#111' : 'transparent',
                color:      s === filter ? '#fff'  : 'var(--text2)' }}>
              {s === 'all' ? `All (${stocks.length})` : s}
            </button>
          ))}
        </div>
        <button onClick={fetchScout} disabled={loading}
          style={{ fontSize: 12, padding: '6px 14px', border: '1px solid var(--border)',
            borderRadius: 8, background: 'transparent', color: 'var(--text2)',
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}>
          {loading ? '⟳ Scanning market…' : '⟳ Refresh now'}
        </button>
      </div>

      {/* States */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text3)' }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>⟳ Scanning market & running AI analysis…</div>
          <div style={{ fontSize: 12 }}>
            Fetching quotes, fundamentals & news for up to 30 candidates, then ranking with Gemini.
            This takes 10–20 seconds.
          </div>
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#d64045', fontSize: 13 }}>
          ⚠ {error}
          <button onClick={fetchScout}
            style={{ display: 'block', margin: '12px auto 0', fontSize: 12,
              padding: '6px 14px', border: '1px solid #d64045', borderRadius: 8,
              background: 'transparent', color: '#d64045', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          No stocks found for this filter.
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <div style={{ display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
            {filtered.map(s => <ScoutCard key={s.sym} s={s} />)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', borderTop: '1px solid var(--border)',
            paddingTop: 10, lineHeight: 1.5, marginTop: '1.5rem' }}>
            Candidates identified from Finnhub market news and a curated universe of quality large-caps.
            Fundamentals from Finnhub. AI ranking by Gemini 2.5 Flash. For informational purposes only — not financial advice.
            Refresh manually anytime or wait for the 4-hour automatic cache refresh.
          </div>
        </>
      )}
    </div>
  )
}
