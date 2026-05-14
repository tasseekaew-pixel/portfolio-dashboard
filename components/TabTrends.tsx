'use client'
import '@/components/ChartSetup'
import { useState, useEffect } from 'react'
import { Line } from 'react-chartjs-2'
import { HOLDINGS } from '@/lib/data'
import type { QuoteMap } from '@/app/page'

const SYM_COLOR: Record<string, string> = {
  SPY:'#378add', VOO:'#7f77dd', VTI:'#1d9e75',
  AMZN:'#d85a30', NVDA:'#ba7517', LIFE:'#d4537e',
  TSM:'#639922', GOOGL:'#5b6abf', AMD:'#d07020', LLY:'#d85a30'
}

const lineOpts = (yFmt: (v: any) => string) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ` ${yFmt(c.raw)}` } } },
  scales: {
    x: { ticks: { maxTicksLimit: 8, font: { size: 11 } }, grid: { display: false } },
    y: { ticks: { font: { size: 11 }, callback: yFmt }, grid: { color: 'rgba(0,0,0,0.06)' } },
  },
} as const)

function useHistory(sym: string, days: number) {
  const [data, setData] = useState<{ closes: number[]; dates: string[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    setData(null)
    fetch(`/api/history?sym=${sym}&days=${days}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        if (!d.closes?.length) { setError('No data returned'); return }
        setData(d)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [sym, days])

  return { data, loading, error }
}

function ChartShell({ height = 220, loading, error, children }: {
  height?: number; loading: boolean; error: string; children: React.ReactNode
}) {
  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      {loading && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'#999' }}>
          Loading chart…
        </div>
      )}
      {!loading && error && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#d64045' }}>
          {error}
        </div>
      )}
      {!loading && !error && children}
    </div>
  )
}

function PriceChart({ sym, days }: { sym: string; days: number }) {
  const { data, loading, error } = useHistory(sym, days)
  const col = SYM_COLOR[sym] || '#378add'

  return (
    <ChartShell loading={loading} error={error}>
      {data && (
        <Line
          data={{
            labels: data.dates,
            datasets: [{
              data: data.closes,
              borderColor: col,
              backgroundColor: col + '22',
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.3,
              fill: true,
            }],
          }}
          options={lineOpts((v: any) => '$' + Number(v).toFixed(0))}
        />
      )}
    </ChartShell>
  )
}

function ETFChart({ days }: { days: number }) {
  const spy = useHistory('SPY', days)
  const voo = useHistory('VOO', days)
  const vti = useHistory('VTI', days)

  const loading = spy.loading || voo.loading || vti.loading
  const error = spy.error || voo.error || vti.error

  const normalize = (arr: number[]) =>
    arr.map(v => arr[0] ? (v - arr[0]) / arr[0] * 100 : 0)

  const n = Math.min(
    spy.data?.closes.length ?? 0,
    voo.data?.closes.length ?? 0,
    vti.data?.closes.length ?? 0,
  )

  return (
    <ChartShell loading={loading} error={error}>
      {n > 0 && spy.data && voo.data && vti.data && (
        <Line
          data={{
            labels: spy.data.dates.slice(-n),
            datasets: [
              { label: 'SPY', data: normalize(spy.data.closes.slice(-n)), borderColor: '#378add', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false },
              { label: 'VOO', data: normalize(voo.data.closes.slice(-n)), borderColor: '#7f77dd', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false },
              { label: 'VTI', data: normalize(vti.data.closes.slice(-n)), borderColor: '#1d9e75', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false },
            ],
          }}
          options={lineOpts((v: any) => (v >= 0 ? '+' : '') + Number(v).toFixed(1) + '%')}
        />
      )}
    </ChartShell>
  )
}

export default function TabTrends({ quotes }: { quotes: QuoteMap }) {
  const [sym, setSym] = useState('SPY')
  const [days, setDays] = useState(60)

  const card = (children: React.ReactNode) => (
    <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:16, marginBottom:12 }}>
      {children}
    </div>
  )

  return (
    <div>
      {card(<>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
          <div style={{ fontSize:14, fontWeight:500 }}>Price trend</div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <select
              value={sym}
              onChange={e => setSym(e.target.value)}
              style={{ fontSize:12, padding:'4px 8px', border:'1px solid var(--border)', borderRadius:8, background:'var(--bg)', color:'var(--text)' }}
            >
              {HOLDINGS.map(h => <option key={h.sym} value={h.sym}>{h.sym} — {h.name}</option>)}
            </select>
            <div style={{ display:'flex', gap:4 }}>
              {([30,60,90] as const).map(d => (
                <button key={d} onClick={() => setDays(d)}
                  style={{ fontSize:11, padding:'4px 9px', border:'1px solid var(--border)', borderRadius:8,
                    background: d===days ? '#111' : 'transparent',
                    color: d===days ? '#fff' : 'var(--text2)' }}>
                  {d===30?'1M':d===60?'2M':'3M'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <PriceChart key={sym + days} sym={sym} days={days} />
      </>)}

      {card(<>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:8 }}>ETF comparison — SPY, VOO & VTI (normalized %)</div>
        <div style={{ display:'flex', gap:12, marginBottom:10, fontSize:11, color:'var(--text2)' }}>
          {[['SPY','#378add'],['VOO','#7f77dd'],['VTI','#1d9e75']].map(([l,c])=>(
            <span key={l} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ width:8,height:8,borderRadius:2,background:c,display:'inline-block' }} />{l}
            </span>
          ))}
        </div>
        <ETFChart key={'etf' + days} days={days} />
      </>)}
    </div>
  )
}
