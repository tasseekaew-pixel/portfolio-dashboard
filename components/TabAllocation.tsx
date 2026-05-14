'use client'
import '@/components/ChartSetup'
import { Doughnut } from 'react-chartjs-2'
import { HOLDINGS } from '@/lib/data'
import { TARGET_ETF_PCT, TARGET_STOCK_PCT } from '@/lib/data'
import type { QuoteMap } from '@/app/page'

function fmt(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }

const COLORS = ['#d85a30','#378add','#7f77dd','#1d9e75','#ba7517','#d4537e','#639922','#888780']

export default function TabAllocation({ quotes, loading }: { quotes: QuoteMap; loading: boolean }) {
  let eV = 0, sV = 0
  for (const h of HOLDINGS) {
    const q = quotes[h.sym]
    if (!q) continue
    const v = q.price * h.shares
    if (h.type === 'etf') eV += v; else sV += v
  }
  const tot = eV + sV
  const etfPct = tot ? eV / tot * 100 : 50
  const stkPct = 100 - etfPct
  const diff = etfPct - TARGET_ETF_PCT

  let msg = '', mc = ''
  if (Math.abs(diff) < 2) {
    msg = `✓ Well balanced near ${TARGET_ETF_PCT}/${TARGET_STOCK_PCT} target.`
    mc = '#1d9e75'
  } else if (diff < 0) {
    const need = (TARGET_ETF_PCT / 100 * tot - eV).toFixed(0)
    msg = `ETF ${Math.abs(diff).toFixed(1)}% below target. Consider adding ~$${Number(need).toLocaleString()} in ETFs.`
    mc = '#d64045'
  } else {
    const need = (sV - TARGET_STOCK_PCT / 100 * tot).toFixed(0)
    msg = `Stocks below target. Consider adding ~$${Number(need).toLocaleString()} in stocks.`
    mc = '#e06c00'
  }

  const labels = HOLDINGS.map(h => h.sym)
  const vals = HOLDINGS.map(h => (quotes[h.sym]?.price ?? 0) * h.shares)

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
      {/* Split bar */}
      <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:16 }}>
        <div style={{ fontSize:13, fontWeight:500, color:'var(--text2)', marginBottom:12 }}>ETF vs stock split</div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text2)', marginBottom:6 }}>
          <span>ETF</span><span>Stocks</span>
        </div>
        <div style={{ height:10, background:'var(--bg2)', borderRadius:5, overflow:'hidden', marginBottom:8 }}>
          <div style={{ height:'100%', borderRadius:5, background:'#378add', width: etfPct.toFixed(1) + '%', transition:'width .4s ease' }} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
          <span style={{ fontSize:14, fontWeight:600, color:'#185fa5' }}>{etfPct.toFixed(1)}%</span>
          <span style={{ fontSize:14, fontWeight:600, color:'#0f6e56' }}>{stkPct.toFixed(1)}%</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text3)', marginBottom:16 }}>
          <span>Target: {TARGET_ETF_PCT}%</span><span>Target: {TARGET_STOCK_PCT}%</span>
        </div>

        <div style={{ borderTop:'1px solid var(--border)', paddingTop:12, marginBottom:12 }}>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>Rebalance guidance</div>
          <div style={{ fontSize:13, color: mc }}>{loading ? '—' : msg}</div>
        </div>

        <div style={{ borderTop:'1px solid var(--border)', paddingTop:12 }}>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:8 }}>Values</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {[['ETF', eV, '#185fa5'], ['Stocks', sV, '#0f6e56']].map(([lbl, val, col]) => (
              <div key={lbl as string} style={{ background:'var(--bg2)', borderRadius:8, padding:'10px 12px' }}>
                <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>{lbl}</div>
                <div style={{ fontSize:16, fontWeight:600, color: col as string }}>{loading ? '—' : fmt(val as number)}</div>
                <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                  {tot > 0 ? ((val as number) / tot * 100).toFixed(1) + '% of portfolio' : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Donut */}
      <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:16 }}>
        <div style={{ fontSize:13, fontWeight:500, color:'var(--text2)', marginBottom:12 }}>Holdings by value</div>
        {tot > 0 ? (
          <>
            <div style={{ position:'relative', height:220 }}>
              <Doughnut
                data={{
                  labels,
                  datasets: [{
                    data: vals,
                    backgroundColor: COLORS,
                    borderWidth: 2,
                    borderColor: 'transparent',
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: '65%',
                  plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (c: any) => ` ${c.label}: ${fmt(c.raw)}` } },
                  },
                }}
              />
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:12, fontSize:11, color:'var(--text2)' }}>
              {labels.map((l, i) => (
                <span key={l} style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:8, height:8, borderRadius:2, background: COLORS[i], display:'inline-block' }} />
                  {l}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div style={{ height:220, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text3)', fontSize:13 }}>
            Loading…
          </div>
        )}
      </div>
    </div>
  )
}
