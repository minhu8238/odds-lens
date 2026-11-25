// 단독 시장 과거 검증 (예: 농구 언더오버만): 그 경기 이전 날짜 데이터만으로 단독 조합을 돌려 고른 결과의 적중 집계
// 사용: node scripts/backtest_single.js <시장키 예: basketball_ou_2> <시작 YYYYMMDD>
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const [key, from = '20250101'] = process.argv.slice(2);
const R = { W: 0, D: 1, L: 2 };
const rows = zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '..', 'data', 'atlas', key + '.csv.gz'))).toString().split('\n').filter(Boolean).map(l => {
  const a = l.split(','); if (a.length !== 18 || !(a[17] in R)) return null; const n = i => +a[i];
  return { dt: a[0], i: [n(5), n(6), n(7)], f: [n(8), n(9), n(10)], ch: n(11), il: n(12), ln: n(13), v: [n(14), n(15), n(16)], r: R[a[17]] }
}).filter(x => x && x.f[0] > 1 && x.f[2] > 1).sort((a, b) => a.dt < b.dt ? -1 : 1);
const MINN = 4, TOLS = [0.03, 0.06, 0.1], hasL = !/normal/.test(key);
const vok = v => v.every(x => x >= 0) && v.reduce((a, b) => a + b, 0) > 50;
const stat = {}; let tested = 0;
const add = (k, p, hit, odd) => { const s = stat[k] || (stat[k] = { picks: 0, hit: 0, exp: 0, ret: 0 }); s.picks++; s.exp += p; if (hit) { s.hit++; s.ret += odd } };
const start = rows.findIndex(x => x.dt >= from);
for (let ti = start; ti < rows.length; ti++) {
  const G = rows[ti], t3 = G.f[1] > 1, js = t3 ? [0, 1, 2] : [0, 2], wl = [0, 2], e = 0.1 + 1e-9;
  const Gi = G.i[0] > 1 ? G.i : G.f, V = vok(G.v) ? G.v : null, vt = t3 ? 10 : 7;
  const near = (a, b) => Math.abs(a[0] - b[0]) <= e && Math.abs(a[2] - b[2]) <= e;
  const sub = [];
  for (let k = 0; k < ti; k++) { const x = rows[k]; if (x.dt.slice(0, 8) >= G.dt.slice(0, 8)) break; if ((x.f[1] > 1) !== t3 || (hasL && x.ln !== G.ln)) continue; if (near(x.f, G.f) || near(x.i, Gi)) sub.push(x) }
  if (!sub.length) continue; tested++;
  const md = (a, b, idx) => idx.reduce((m, j) => Math.max(m, Math.abs(a[j] - b[j])), 0);
  const F = sub.map(x => ({ x, fwl: md(x.f, G.f, wl), fall: md(x.f, G.f, js), iwl: md(x.i, Gi, wl), iall: md(x.i, Gi, js), mv: (x.ch > 0) === (G.ch > 0), cnt: x.ch === G.ch, vo: !!V && vok(x.v) && js.every(j => Math.abs(x.v[j] - V[j]) <= vt), hl: x.il === G.il }));
  const agg = {}, s0 = js.reduce((a, q) => a + 1 / G.f[q], 0);
  for (const ti2 of [0, 1, 2]) for (const fin of t3 ? ['none', 'wl', 'all'] : ['none', 'wl']) for (const ini of t3 ? ['none', 'wl', 'all'] : ['none', 'wl']) for (const chg of ['none', 'mv', 'cnt']) for (const vote of V ? [0, 1] : [0]) for (const li of hasL ? [0, 1] : [0]) {
    if (fin === 'none' && ini === 'none') continue;
    const T = TOLS[ti2] + 1e-9;
    const m = F.filter(f => (fin === 'none' || (fin === 'wl' ? f.fwl : f.fall) <= T) && (ini === 'none' || (ini === 'wl' ? f.iwl : f.iall) <= T) && (chg !== 'mv' || f.mv) && (chg !== 'cnt' || f.cnt) && (!vote || f.vo) && (!li || f.hl));
    if (m.length < MINN) continue;
    let best = null;
    for (const j of js) { let k = 0, ex = 0; for (const { x } of m) { const s = js.reduce((a, q) => a + 1 / x.f[q], 0); ex += 1 / x.f[j] / s; if (x.r === j) k++ } const res = (k - ex) / m.length;
      const A = agg[j] || (agg[j] = { tot: 0, pos: 0, wn: 0, wr: 0 }); A.tot++; if (res > 0) A.pos++; A.wn += m.length; A.wr += m.length * res * 100; if (res > 0 && (!best || res > best.res)) best = { j, res } }
    if (best) add([TOLS[ti2].toFixed(2), fin, ini, chg, vote, li].join('|'), 1 / G.f[best.j] / s0, G.r === best.j, G.f[best.j]);
  }
  let best = null;
  for (const j of js) { const A = agg[j]; if (!A || !A.tot) continue; const sh = A.pos / A.tot, wres = A.wr / A.wn; if (wres <= 0 || sh < 0.7) continue; if (!best || wres > best.wres) best = { j, sh, wres } }
  if (best) add('GRADE|' + (best.sh >= 0.95 && best.wres >= 15 ? '강함' : best.sh >= 0.8 && best.wres >= 8 ? '보통' : '약함'), 1 / G.f[best.j] / s0, G.r === best.j, G.f[best.j]);
}
const fmt = s => `${String(s.picks).padStart(6)} 적중 ${(s.hit / s.picks * 100).toFixed(1)}% 배당상 ${(s.exp / s.picks * 100).toFixed(1)}% 차이 ${((s.hit - s.exp) / s.picks * 100).toFixed(2)}%p 수익 ${((s.ret / s.picks - 1) * 100).toFixed(1)}% (±${(196 * Math.sqrt(.25 / s.picks)).toFixed(1)}%p)`;
const tot = { picks: 0, hit: 0, exp: 0, ret: 0 }; for (const [k, s] of Object.entries(stat)) if (!k.startsWith('GRADE')) for (const q in tot) tot[q] += s[q];
console.log(key, '시험 경기', tested); console.log(' 모든 조합', fmt(tot));
for (const g of ['강함', '보통', '약함']) if (stat['GRADE|' + g]) console.log(' 판정 ' + g, fmt(stat['GRADE|' + g]));
const L = Object.entries(stat).filter(([k, s]) => !k.startsWith('GRADE') && s.picks >= 300).sort((a, b) => (b[1].hit - b[1].exp) / b[1].picks - (a[1].hit - a[1].exp) / a[1].picks);
console.log(' 상위 조합'); L.slice(0, 5).forEach(([k, s]) => console.log('  ' + k.padEnd(26), fmt(s)));
console.log(' 조합', L.length, '중 배당보다 높음', L.filter(([k, s]) => s.hit > s.exp).length);
