'use client'
// components/TabAnalysis.tsx
import { useState, useEffect, useRef } from 'react'
import { HOLDINGS, WATCHLIST } from '@/lib/data'
import { ltScore } from '@/lib/scoring'
import type { QuoteMap } from '@/app/page'

function fmt(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }
function fp(n: number) { return (n>=0?'+':'') + n.toFixed(2) + '%' }

const ANALYSIS_ITEMS = [
  { sym:'AMZN', n:'Amazon',        t:'stock', revG:12, moPct:12.6, yrPct:17.1, tgt:310 },
  { sym:'NVDA', n:'NVIDIA',        t:'stock', revG:73, moPct:19.2, yrPct:21.1, tgt:250 },
  { sym:'TSM',  n:'TSMC',          t:'stock', revG:35, moPct:8.2,  yrPct:31.6, tgt:450 },
  { sym:'GOOGL',n:'Alphabet',      t:'stock', revG:12, moPct:25.2, yrPct:28.5, tgt:430 },
  { sym:'AMD',  n:'AMD',           t:'stock', revG:22, moPct:80.4, yrPct:107.9,tgt:500 },
  { sym:'LLY',  n:'Eli Lilly',     t:'stock', revG:43, moPct:8.1,  yrPct:-5.5, tgt:1225},
  { sym:'SPY',  n:'S&P 500 ETF',   t:'etf',  revG:0,  moPct:8.2,  yrPct:8.8,  tgt:780 },
  { sym:'VOO',  n:'Vanguard S&P',  t:'etf',  revG:0,  moPct:8.2,  yrPct:8.8,  tgt:720 },
  { sym:'VTI',  n:'Vanguard Total',t:'etf',  revG:0,  moPct:7.8,  yrPct:8.8,  tgt:385 },
]

function Sparkline({ sym, color }: { sym: string; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const cref = useRef<any>(null)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/history?sym=${sym}&days=30`)
      .then(r => r.json())
      .then(async data => {
        if (cancelled || !ref.current || !data.closes?.length) return
        const d = data.closes
        const smaLine = d.map((_:any, i:number, a:number[]) => {
          if (i < 6) return null
          const sl = a.slice(i-6, i+1)
          return sl.reduce((s:number,v:number)=>s+v,0)/sl.length
        })
        const { Chart, LineElement, PointElement, LinearScale, CategoryScale, Tooltip } = await import('chart.js')
        Chart.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip)
        if (cref.current) cref.current.destroy()
        cref.current = new Chart(ref.current, {
          type: 'line',
          data: {
            labels: data.dates,
            datasets: [
              { data: d, borderColor: color, borderWidth:1.5, pointRadius:0, tension:0.3, fill:false },
              { data: smaLine, borderColor:'rgba(0,0,0,0.2)', borderWidth:1, borderDash:[3,2], pointRadius:0, fill:false }
            ]
          },
          options: {
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{display:false}, tooltip:{enabled:false} },
            scales:{x:{display:false},y:{display:false}},
            animation:{duration:0}
          }
        })
      })
    return () => { cancelled=true; if(cref.current) cref.current.destroy() }
  }, [sym])
  return <div style={{ position:'relative', height:68, margin:'8px 0' }}><canvas ref={ref} /></div>
}

export default function TabAnalysis({ quotes, loading }: { quotes: QuoteMap; loading: boolean }) {
  const [histories, setHistories] = useState<Record<string, number[]>>({})

  useEffect(() => {
    const syms = Array.from(new Set(ANALYSIS_ITEMS.map(x => x.sym)))
    syms.forEach(sym => {
      fetch(`/api/history?sym=${sym}&days=30`)
        .then(r => r.json())
        .then(data => {
          if (data.closes?.length) {
            setHistories(prev => ({ ...prev, [sym]: data.closes }))
          }
        })
    })
  }, [])

  const scored = ANALYSIS_ITEMS.map(x => {
    const q = quotes[x.sym]
    const h = histories[x.sym] || []
    const sc = ltScore({ price: q?.price||0, history: h, revG: x.revG, moPct: x.moPct, yrPct: x.yrPct, tgt: x.tgt })
    return { ...x, q, ...sc }
  }).sort((a,b) => b.score - a.score)

  const buy  = scored.filter(x => x.sig === 'buy')
  const watch = scored.filter(x => x.sig === 'watch')
  const wait = scored.filter(x => x.sig === 'wait')

  function Card({ x, hi }: { x: typeof scored[0]; hi: boolean }) {
    const bc = x.score>=70?'bhi':x.score>=50?'bmid':'blo'
    const bStyles: Record<string,string> = { bhi:'#e1f5ee//#0f6e56', bmid:'#faeeda//#854f0b', blo:'#f4f4f4//#666' }
    const [bbg,btxt] = (bStyles[bc]||'#f4f4f4//#666').split('//')
    const sl = x.sig==='buy'?'Strong long-term setup':x.sig==='watch'?'Accumulate gradually':'Wait for better entry'
    let reasons = ''
    if (x.sig==='buy') {
      if ((x.q?.price||0) > x.a7) reasons += `· Trading above its 7-day average — near-term confirms long-term direction\n`
      if (x.yrPct > 20) reasons += `· ${fp(x.yrPct)} over the past year — sustained multi-month trend\n`
      if (x.revG > 15) reasons += `· ${x.revG}% revenue growth — expanding earnings power\n`
      if (x.upside > 10) reasons += `· Analyst target implies ${x.upside.toFixed(1)}% upside\n`
    } else if (x.sig==='watch') {
      reasons += `· Trend building — consider DCA (monthly fixed amount) rather than lump sum\n`
      if (x.rsi < 55) reasons += `· RSI ${x.rsi.toFixed(0)} — cooling down, may form a better entry point\n`
    } else {
      reasons += `· Short-term trend unfavorable — wait for 30-day trend to turn upward\n`
      if (x.rsi > 65) reasons += `· RSI ${x.rsi.toFixed(0)} — overbought, wait for a pullback first\n`
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
            <div style={{ fontSize:11, color: (x.q?.pct??0)>=0?'#1d9e75':'#d64045' }}>{x.q ? fp(x.q.pct) : '—'} today</div>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:10 }}>
          {[['7d avg',fmt(x.a7)],['RSI-14',x.rsi.toFixed(0)],['1Y return',fp(x.yrPct)]].map(([lbl,val])=>(
            <div key={lbl} style={{ background:'var(--bg2)', borderRadius:'var(--radius-sm)', padding:'7px 9px', textAlign:'center' }}>
              <div style={{ fontSize:10, color:'var(--text3)', marginBottom:2 }}>{lbl}</div>
              <div style={{ fontSize:13, fontWeight:500, color: lbl==='1Y return' ? ((x.yrPct>=0)?'#1d9e75':'#d64045') : 'var(--text)' }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
          <span style={{ fontSize:11, color:'var(--text3)' }}>Long-term score</span>
          <span style={{ fontSize:11, fontWeight:500, padding:'3px 9px', borderRadius:999, background:bbg, color:btxt }}>{sl} · {x.score}/100</span>
        </div>
        <div style={{ height:5, background:'var(--bg2)', borderRadius:3, overflow:'hidden', marginBottom:8 }}>
          <div style={{ height:'100%', borderRadius:3, background:x.color, width:x.score+'%' }} />
        </div>
        <Sparkline sym={x.sym} color={x.color} />
        <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.55, borderTop:'1px solid var(--border)', paddingTop:8 }}>
          {reasons.split('\n').filter(Boolean).map((r,i) => <div key={i}>{r}</div>)}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ background:'var(--bg2)', borderRadius:'var(--radius)', padding:'13px 16px', marginBottom:'1.25rem', fontSize:13, color:'var(--text2)', lineHeight:1.6 }}>
        <strong style={{ color:'var(--text)' }}>Long-term investor analysis</strong> — All signals are weighted for <strong style={{ color:'var(--text)' }}>buy-and-hold</strong> investors. A "wait" rating means wait for a better entry point, not avoid permanently. Scores update live with each price refresh. Not financial advice.
      </div>
      {buy.length > 0 && <>
        <div style={{ fontSize:12, fontWeight:500, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Strong long-term setups — consider buying or adding</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:12, marginBottom:'1rem' }}>
          {buy.map((x,i) => <Card key={x.sym} x={x} hi={i===0} />)}
        </div>
      </>}
      {watch.length > 0 && <>
        <div style={{ fontSize:12, fontWeight:500, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Accumulate gradually — DCA recommended</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:12, marginBottom:'1rem' }}>
          {watch.map(x => <Card key={x.sym} x={x} hi={false} />)}
        </div>
      </>}
      {wait.length > 0 && <>
        <div style={{ fontSize:12, fontWeight:500, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Wait for better entry — don't chase</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:12, marginBottom:'1rem' }}>
          {wait.map(x => <Card key={x.sym} x={x} hi={false} />)}
        </div>
      </>}
      <div style={{ fontSize:11, color:'var(--text3)', borderTop:'1px solid var(--border)', paddingTop:10, lineHeight:1.5 }}>
        Scores weight: 30-day trend, momentum, RSI, 1-year return, revenue growth, analyst target. Calibrated for multi-year holding periods. Not financial advice.
      </div>
    </div>
  )
}
