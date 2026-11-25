// 조합별 과거 검증: 시험 기간 경기마다 "그 경기 전" 데이터만으로 시트 조합을 돌려서
// 조합마다 '배당보다 가장 많이 더 나온 결과'(4경기 이상)를 고르고, 실제 결과와 맞았는지 집계
// 사용: node scripts/backtest.js <종목> <시작 YYYYMMDD> [ou]
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const [sp, from = '20260101', kind = ''] = process.argv.slice(2);
const file = path.join(__dirname, '..', 'data', 'history', (kind === 'ou' ? 'oupair_' : 'pair_') + sp + '.csv.gz');
const rows = zlib.gunzipSync(fs.readFileSync(file)).toString().split('\n').filter(Boolean).map(l => {
  const a = l.split(','); if (a.length < 28) return null; const n = i => a[i] === '' ? NaN : +a[i];
  return { dt: a[0], ni: [n(5), n(6), n(7)], nf: [n(8), n(9), n(10)], nch: n(11), nv: [n(12), n(13), n(14)], ln: n(15), hi: [n(16), n(17), n(18)], hf: [n(19), n(20), n(21)], hch: n(22), hv: [n(23), n(24), n(25)], r1: n(26), r2: n(27), ihc: a.length >= 29 && a[28] !== '' ? n(28) : n(15) }
}).filter(x => x && x.nf[0] > 1 && x.nf[2] > 1 && x.hf[0] > 1 && x.hf[2] > 1 && x.r1 >= 0 && x.r2 >= 0).sort((a, b) => a.dt < b.dt ? -1 : 1);
const MINN = 4, TOLS = [0.03, 0.06, 0.1];
const vok = v => v.every(x => x >= 0) && v.reduce((a, b) => a + b, 0) > 50;
// 조합 목록 (페이지와 같음)
function combos(n3, h3, hasV, moved) {
  const out = [];
  for (const ti of [0, 1, 2]) for (const fin of (n3 || h3) ? ['wl', 'all'] : ['wl']) for (const ini of moved ? ((n3 || h3) ? ['wl', 'all'] : ['wl']) : ((n3 || h3) ? ['none', 'wl', 'all'] : ['none', 'wl']))
    for (const chg of ['none', 'mv', 'cnt']) for (const vote of hasV ? ['none', 'n', 'nh'] : ['none']) for (const hli of (process.env.FORCEL ? [1] : [0, 1])) {
      if (fin === 'none' && ini === 'none') continue;
      out.push({ ti, fin, ini, chg, vote, hli, key: [TOLS[ti].toFixed(2), fin, ini, chg, vote, hli].join('|') })
    }
  return out
}
const stat = {}; // key -> {picks, hit, exp, ret} per side N/H
let tested = 0;
const t0 = Date.now();
let start = rows.findIndex(x => x.dt >= from); if (start < 0) process.exit(console.log('시험 경기 없음'));
for (let ti = start; ti < rows.length; ti++) {
  const G = rows[ti], n3 = G.nf[1] > 1, h3 = G.hf[1] > 1, hasV = vok(G.nv) && vok(G.hv);
  const e = 0.1 + 1e-9, nr = (a, b) => Math.abs(a[0] - b[0]) <= e && Math.abs(a[2] - b[2]) <= e;
  const Ni = G.ni[0] > 1 ? G.ni : G.nf, Hi = G.hi[0] > 1 ? G.hi : G.hf;
  // 그 경기 '이전 날짜'의 경기만
  const sub = [];
  for (let k = 0; k < ti; k++) { const x = rows[k]; if (x.dt.slice(0, 8) >= G.dt.slice(0, 8)) break; if (x.ln !== G.ln || (x.nf[1] > 1) !== n3 || (x.hf[1] > 1) !== h3) continue; if ((nr(x.nf, G.nf) && nr(x.hf, G.hf)) || (nr(x.ni, Ni) && nr(x.hi, Hi))) sub.push(x) }
  if (!sub.length) continue;
  tested++;
  // 행마다 조건별 최대 차이 미리 계산
  const js3 = [0, 1, 2], wl = [0, 2];
  const md = (a, b, idx) => idx.reduce((m, j) => Math.max(m, Math.abs(a[j] - b[j])), 0);
  const nvt = n3 ? 10 : 7, hvt = h3 ? 10 : 7;
  const F = sub.map(x => ({
    x, fwl: Math.max(md(x.nf, G.nf, wl), md(x.hf, G.hf, wl)), fall: Math.max(md(x.nf, G.nf, n3 ? js3 : wl), md(x.hf, G.hf, h3 ? js3 : wl)),
    iwl: Math.max(md(x.ni, Ni, wl), md(x.hi, Hi, wl)), iall: Math.max(md(x.ni, Ni, n3 ? js3 : wl), md(x.hi, Hi, h3 ? js3 : wl)),
    mv: (x.nch > 0) === (G.nch > 0) && (x.hch > 0) === (G.hch > 0), cnt: x.nch === G.nch && x.hch === G.hch,
    vn: hasV && vok(x.nv) && (n3 ? js3 : wl).every(j => Math.abs(x.nv[j] - G.nv[j]) <= nvt),
    vh: hasV && vok(x.hv) && (h3 ? js3 : wl).every(j => Math.abs(x.hv[j] - G.hv[j]) <= hvt),
    hl: x.ihc === G.ihc
  }));
  const agg = { N: {}, H: {} }; // 결론 판정 재현용: 결과별 조합 수·같은 쪽 수·경기수 가중 차이
  for (const c of combos(n3, h3, hasV, G.nch > 0 || G.hch > 0)) {
    const T = TOLS[c.ti] + 1e-9;
    const m = F.filter(f => (c.fin === 'none' || (c.fin === 'wl' ? f.fwl : f.fall) <= T) && (c.ini === 'none' || (c.ini === 'wl' ? f.iwl : f.iall) <= T)
      && (c.chg !== 'mv' || f.mv) && (c.chg !== 'cnt' || f.cnt) && (c.vote === 'none' || (f.vn && (c.vote === 'n' || f.vh))) && (!c.hli || f.hl));
    if (m.length < MINN) continue;
    for (const [side, fo, rk, three, act] of [['N', 'nf', 'r1', n3, G.nf], ['H', 'hf', 'r2', h3, G.hf]]) {
      const js = three ? js3 : wl; let best = null;
      for (const j of js) { let k = 0, ex = 0; for (const { x } of m) { const s = js.reduce((a, q) => a + 1 / x[fo][q], 0); ex += 1 / x[fo][j] / s; if (x[rk] === j) k++ } const res = (k - ex) / m.length; const A = agg[side][j] || (agg[side][j] = { tot: 0, pos: 0, wn: 0, wr: 0 }); A.tot++; if (res > 0) A.pos++; A.wn += m.length; A.wr += m.length * res * 100; if (res > 0 && (!best || res > best.res)) best = { j, res } }
      if (!best) continue;
      const key = side + '|' + c.key, st = stat[key] || (stat[key] = { picks: 0, hit: 0, exp: 0, ret: 0 });
      const s = js.reduce((a, q) => a + 1 / act[q], 0);
      st.picks++; st.exp += 1 / act[best.j] / s; if (G[rk] === best.j) { st.hit++; st.ret += act[best.j] }
    }
  }
  for (const [side, rk, three, act] of [['N', 'r1', n3, G.nf], ['H', 'r2', h3, G.hf]]) {
    const js = three ? js3 : wl; let best = null;
    for (const j of js) { const A = agg[side][j]; if (!A || !A.tot) continue; const sh = A.pos / A.tot, wres = A.wr / A.wn; if (wres <= 0 || sh < 0.7) continue; if (!best || wres > best.wres) best = { j, sh, wres } }
    if (!best) continue;
    const gr = best.sh >= 0.95 && best.wres >= 15 ? '강함' : best.sh >= 0.8 && best.wres >= 8 ? '보통' : '약함';
    const s = js.reduce((a, q) => a + 1 / act[q], 0), key = 'GRADE|' + gr, st = stat[key] || (stat[key] = { picks: 0, hit: 0, exp: 0, ret: 0 });
    st.picks++; st.exp += 1 / act[best.j] / s; if (G[rk] === best.j) { st.hit++; st.ret += act[best.j] }
  }
}
const out = Object.entries(stat).map(([k, v]) => ({ k, ...v }));
fs.writeFileSync(`/tmp/bt_${sp}${kind}_${from}.json`, JSON.stringify({ tested, out }));
console.log(sp + kind, '시험 경기', tested, '조합 수', out.length, ((Date.now() - t0) / 1000).toFixed(0) + 's');
