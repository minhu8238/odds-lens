// 결론 방식 비교 검증: 경기마다 그 날짜 이전 데이터로 '일반+핸디 짝' 조합과 '단독'(일반·핸디 각각) 조합을 돌리고
// A 짝 메인(단독 보조, 한 단계 낮춤) / B 단독 메인(짝 보조) / C 같은 무게(표본·차이 센 쪽) 세 방식의 결론 적중을 비교
// 사용: node scripts/backtest_policy.js <종목> [시작 YYYYMMDD]
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const [sp, from = '20250101'] = process.argv.slice(2);
const DATA = path.join(__dirname, '..', 'data'), gz = f => zlib.gunzipSync(fs.readFileSync(f)).toString().split('\n').filter(Boolean);
const pairs = gz(path.join(DATA, 'history', 'pair_' + sp + '.csv.gz')).map(l => {
  const a = l.split(','); if (a.length < 28) return null; const n = i => a[i] === '' ? NaN : +a[i];
  return { dt: a[0], ni: [n(5), n(6), n(7)], nf: [n(8), n(9), n(10)], nch: n(11), nv: [n(12), n(13), n(14)], ln: n(15), hi: [n(16), n(17), n(18)], hf: [n(19), n(20), n(21)], hch: n(22), hv: [n(23), n(24), n(25)], r1: n(26), r2: n(27), ihc: a.length >= 29 && a[28] !== '' ? n(28) : n(15) }
}).filter(x => x && x.nf[0] > 1 && x.nf[2] > 1 && x.hf[0] > 1 && x.hf[2] > 1 && x.r1 >= 0 && x.r2 >= 0).sort((a, b) => a.dt < b.dt ? -1 : 1);
const RR = { W: 0, D: 1, L: 2 };
const atlas = key => { const f = path.join(DATA, 'atlas', key + '.csv.gz'); if (!fs.existsSync(f)) return []; return gz(f).map(l => { const a = l.split(','); if (a.length !== 18 || !(a[17] in RR)) return null; const n = i => +a[i]; return { dt: a[0], i: [n(5), n(6), n(7)], f: [n(8), n(9), n(10)], ch: n(11), il: n(12), ln: n(13), v: [n(14), n(15), n(16)], r: RR[a[17]] } }).filter(x => x && x.f[0] > 1 && x.f[2] > 1).sort((a, b) => a.dt < b.dt ? -1 : 1) };
const NK = sp === 'soccer' ? 'soccer_normal_3' : sp + '_normal_2';
const AN = atlas(NK), AH3 = atlas(sp + '_handicap_3'), AH2 = atlas(sp + '_handicap_2');
const MINN = 4, TOLS = [0.03, 0.06, 0.1], BK = sp === 'basketball', wl = [0, 2], js3 = [0, 1, 2];
const vok = v => v.every(x => x >= 0) && v.reduce((a, b) => a + b, 0) > 50;
const md = (a, b, idx) => idx.reduce((m, j) => Math.max(m, Math.abs(a[j] - b[j])), 0);
// 결과별 집계 → 페이지와 같은 요약(조합 수, 같은 쪽 수, 경기 수 가중 차이, 표본 가운데·최대)
function summarize(per) { const out = {}; for (const j in per) { const L = per[j]; if (!L.length) continue; const ns = L.map(x => x.n).sort((a, b) => a - b), w = L.reduce((a, x) => a + x.n, 0);
  out[j] = { j: +j, tot: L.length, pos: L.filter(x => x.res > 0).length, wres: L.reduce((a, x) => a + x.n * x.res, 0) / w, med: ns[ns.length >> 1], max: ns[ns.length - 1] } } return out }
function addCombo(per, m, js, fo, rk) { if (m.length < MINN) return; for (const j of js) { let k = 0, ex = 0; for (const x of m) { const s = js.reduce((a, q) => a + 1 / x[fo][q], 0); ex += 1 / x[fo][j] / s; if (x[rk] === j) k++ } (per[j] = per[j] || []).push({ n: m.length, res: (k - ex) / m.length * 100 }) } }
// 짝 분석
function pairAnalysis(ti) {
  const G = pairs[ti], n3 = G.nf[1] > 1, h3 = G.hf[1] > 1, hasV = vok(G.nv) && vok(G.hv), moved = G.nch > 0 || G.hch > 0, e = 0.1 + 1e-9;
  const Ni = G.ni[0] > 1 ? G.ni : G.nf, Hi = G.hi[0] > 1 ? G.hi : G.hf, nr = (a, b) => Math.abs(a[0] - b[0]) <= e && Math.abs(a[2] - b[2]) <= e, day = G.dt.slice(0, 8);
  const F = [];
  for (let k = 0; k < ti; k++) { const x = pairs[k]; if (x.dt.slice(0, 8) >= day) break; if (x.ln !== G.ln || (x.nf[1] > 1) !== n3 || (x.hf[1] > 1) !== h3) continue; if (!((nr(x.nf, G.nf) && nr(x.hf, G.hf)) || (nr(x.ni, Ni) && nr(x.hi, Hi)))) continue;
    F.push({ x, fwl: Math.max(md(x.nf, G.nf, wl), md(x.hf, G.hf, wl)), fall: Math.max(md(x.nf, G.nf, n3 ? js3 : wl), md(x.hf, G.hf, h3 ? js3 : wl)), iwl: Math.max(md(x.ni, Ni, wl), md(x.hi, Hi, wl)), iall: Math.max(md(x.ni, Ni, n3 ? js3 : wl), md(x.hi, Hi, h3 ? js3 : wl)),
      mv: (x.nch > 0) === (G.nch > 0) && (x.hch > 0) === (G.hch > 0), cnt: x.nch === G.nch && x.hch === G.hch, vn: hasV && vok(x.nv) && (n3 ? js3 : wl).every(j => Math.abs(x.nv[j] - G.nv[j]) <= (n3 ? 10 : 7)), vh: hasV && vok(x.hv) && (h3 ? js3 : wl).every(j => Math.abs(x.hv[j] - G.hv[j]) <= (h3 ? 10 : 7)), hl: x.ihc === G.ihc }) }
  const pN = {}, pH = {};
  if (process.env.EXP) { // 확장 조합: 칸별 + 절삭 모양 (페이지와 같음)
    const pct = (o, t) => { const js = t ? js3 : wl, sm = js.reduce((a, j) => a + 1 / o[j], 0); return [0, 1, 2].map(j => js.includes(j) ? 1 / o[j] / sm * 100 : 0) };
    const gNf = pct(G.nf, n3), gNi = pct(Ni, n3), gHf = pct(G.hf, h3), gHi = pct(Hi, h3);
    const SL = (k, t) => k === 'all' ? (t ? js3 : wl) : k === 'wl' ? wl : k === 'w' ? [0] : k === 'l' ? [2] : k === 'd' ? (t ? [1] : []) : [];
    const three = n3 || h3, P = [['wl', 'wl']]; if (three) P.push(['wl', 'all'], ['all', 'wl'], ['all', 'all']); if (!moved) { P.push(['wl', 'none']); if (three) P.push(['all', 'none']) }
    for (const k of three ? ['w', 'l', 'd'] : ['w', 'l']) { P.push([k, k]); if (!moved) P.push([k, 'none']) }
    const E = [];
    for (let k = 0; k < ti; k++) { const x = pairs[k]; if (x.dt.slice(0, 8) >= day) break; if (x.ln !== G.ln || (x.nf[1] > 1) !== n3 || (x.hf[1] > 1) !== h3) continue;
      const xNf = pct(x.nf, n3), xNi = pct(x.ni, n3), xHf = pct(x.hf, h3), xHi = pct(x.hi, h3);
      const sn = [0, 1, 2].some(q => (q === 1 && !n3 ? false : Math.abs(x.nf[q] - G.nf[q]) <= e) && (q === 1 && !h3 ? true : Math.abs(x.hf[q] - G.hf[q]) <= e));
      if (!sn && !(moved && Math.abs(xNf[0] - gNf[0]) <= 4 && Math.abs(xHf[0] - gHf[0]) <= 4)) continue;
      const d = (a, b) => [0, 1, 2].map(q => Math.abs(a[q] - b[q]));
      E.push({ x, nf: d(x.nf, G.nf), ni: d(x.ni, Ni), hf: d(x.hf, G.hf), hi: d(x.hi, Hi), qn: d(xNf, gNf), qh: d(xHf, gHf), mn: [0, 1, 2].map(q => Math.abs((xNf[q] - xNi[q]) - (gNf[q] - gNi[q]))), mh: [0, 1, 2].map(q => Math.abs((xHf[q] - xHi[q]) - (gHf[q] - gHi[q]))),
        mv: (x.nch > 0) === (G.nch > 0) && (x.hch > 0) === (G.hch > 0), cnt: x.nch === G.nch && x.hch === G.hch, vn: hasV && vok(x.nv) && (n3 ? js3 : wl).every(j => Math.abs(x.nv[j] - G.nv[j]) <= (n3 ? 10 : 7)), vh: hasV && vok(x.hv) && (h3 ? js3 : wl).every(j => Math.abs(x.hv[j] - G.hv[j]) <= (h3 ? 10 : 7)), hl: x.ihc === G.ihc }) }
    const tails = base => { for (const chg of ['none', 'mv', 'cnt']) { const b1 = chg === 'none' ? base : base.filter(f => chg === 'mv' ? f.mv : f.cnt); for (const vote of hasV ? ['none', 'n', 'nh'] : ['none']) { const b2 = vote === 'none' ? b1 : b1.filter(f => f.vn && (vote === 'n' || f.vh)); for (const hli of BK ? [1] : [0, 1]) { const m = (hli ? b2.filter(f => f.hl) : b2).map(f => f.x); addCombo(pN, m, n3 ? js3 : wl, 'nf', 'r1'); addCombo(pH, m, h3 ? js3 : wl, 'hf', 'r2') } } } };
    for (const [fin, ini] of P) { const fN = SL(fin, n3), fH = SL(fin, h3), iN = SL(ini, n3), iH = SL(ini, h3); let base = E;
      for (const tol of [0.1, 0.06, 0.03]) { const T = tol + 1e-9; base = base.filter(f => fN.every(q => f.nf[q] <= T) && fH.every(q => f.hf[q] <= T) && iN.every(q => f.ni[q] <= T) && iH.every(q => f.hi[q] <= T)); tails(base) } }
    if (moved) for (const mt of [1.5, 3]) for (const k of three ? ['wl', 'all'] : ['wl']) { const sN = SL(k, n3), sH = SL(k, h3); tails(E.filter(f => sN.every(q => f.qn[q] <= 4 && f.mn[q] <= mt) && sH.every(q => f.qh[q] <= 4 && f.mh[q] <= mt))) }
    return { N: summarize(pN), H: summarize(pH) }
  }
  for (const ti2 of [0, 1, 2]) for (const fin of (n3 || h3) ? ['wl', 'all'] : ['wl']) for (const ini of moved ? ((n3 || h3) ? ['wl', 'all'] : ['wl']) : ((n3 || h3) ? ['none', 'wl', 'all'] : ['none', 'wl'])) for (const chg of ['none', 'mv', 'cnt']) for (const vote of hasV ? ['none', 'n', 'nh'] : ['none']) for (const hli of BK ? [1] : [0, 1]) {
    const T = TOLS[ti2] + 1e-9, m = F.filter(f => (fin === 'wl' ? f.fwl : f.fall) <= T && (ini === 'none' || (ini === 'wl' ? f.iwl : f.iall) <= T) && (chg !== 'mv' || f.mv) && (chg !== 'cnt' || f.cnt) && (vote === 'none' || (f.vn && (vote === 'n' || f.vh))) && (!hli || f.hl)).map(f => f.x);
    addCombo(pN, m, n3 ? js3 : wl, 'nf', 'r1'); addCombo(pH, m, h3 ? js3 : wl, 'hf', 'r2') }
  return { N: summarize(pN), H: summarize(pH) }
}
// 단독 분석 (시장 하나: 과거 단독 데이터에서)
function singleAnalysis(A, Gm, isLine) {
  const day = Gm.dt.slice(0, 8), t3 = Gm.f[1] > 1, js = t3 ? js3 : wl, e = 0.1 + 1e-9, Gi = Gm.i[0] > 1 ? Gm.i : Gm.f, mv = Gm.ch > 0, V = vok(Gm.v) ? Gm.v : null;
  const F = [];
  for (const x of A) { if (x.dt.slice(0, 8) >= day) break; if ((x.f[1] > 1) !== t3 || (isLine && x.ln !== Gm.ln)) continue; if (!((Math.abs(x.f[0] - Gm.f[0]) <= e && Math.abs(x.f[2] - Gm.f[2]) <= e) || (Math.abs(x.i[0] - Gi[0]) <= e && Math.abs(x.i[2] - Gi[2]) <= e))) continue;
    F.push({ x, fwl: md(x.f, Gm.f, wl), fall: md(x.f, Gm.f, js), iwl: md(x.i, Gi, wl), iall: md(x.i, Gi, js), mv: (x.ch > 0) === mv, cnt: x.ch === Gm.ch, vo: !!V && vok(x.v) && js.every(j => Math.abs(x.v[j] - V[j]) <= (t3 ? 10 : 7)), hl: x.il === Gm.il }) }
  const per = {};
  for (const ti2 of [0, 1, 2]) for (const fin of t3 ? ['wl', 'all'] : ['wl']) for (const ini of mv ? (t3 ? ['wl', 'all'] : ['wl']) : (t3 ? ['none', 'wl', 'all'] : ['none', 'wl'])) for (const chg of ['none', 'mv', 'cnt']) for (const vote of V ? [0, 1] : [0]) for (const li of isLine ? (BK ? [1] : [0, 1]) : [0]) {
    const T = TOLS[ti2] + 1e-9, m = F.filter(f => (fin === 'wl' ? f.fwl : f.fall) <= T && (ini === 'none' || (ini === 'wl' ? f.iwl : f.iall) <= T) && (chg !== 'mv' || f.mv) && (chg !== 'cnt' || f.cnt) && (!vote || f.vo) && (!li || f.hl)).map(f => f.x);
    addCombo(per, m, js, 'f', 'r') }
  return summarize(per)
}
// 판정 (페이지와 같은 규칙)
let TH = 0.95; const GRADE = b => { const sh = b.pos / b.tot; return sh >= TH && b.wres >= 15 ? 2 : sh >= 0.8 && b.wres >= 8 ? 1 : 0 };
function verdict(sums) { let best = null; for (const S of sums) for (const j in S) { const x = S[j]; if (x.wres <= 0 || x.pos / x.tot < 0.7) continue; const sc = x.wres * x.med / (x.med + 30); if (!best || sc > best.sc) best = { x, sc } } return best ? { j: best.x.j, g: GRADE(best.x) === 2 && best.x.max < 8 ? 1 : GRADE(best.x), wres: best.x.wres, max: best.x.max } : null }
function combine(m, b) { const rm = m ? m.g : -1, rb = b ? b.g - 1 : -2; if (!m && !b) return null; if (m && b && m.j === b.j) return { j: m.j, g: Math.max(rm, rb), wres: m.wres }; if (!b || rm >= rb) return m; if (rb < 0) return m; return { j: b.j, g: rb, wres: b.wres } }
const fin = v => v && !(v.g === 0 && v.wres < 3) ? v : null;
const ST = {}, OB = {};
const bucket = o => o < 1.5 ? 'a 1.5미만' : o < 2.2 ? 'b 1.5~2.2' : o < 3 ? 'c 2.2~3.0' : 'd 3.0이상';
const rec2 = (mk, v, odds, res) => { if (!v || v.g < 1) return; const js = odds[1] > 1 ? js3 : wl, s = js.reduce((a, q) => a + 1 / odds[q], 0), gn = ['약함', '보통', '강함'][v.g];
  for (const key of [gn + '|' + bucket(odds[v.j]), gn + '|' + (odds[1] > 1 && v.j === 1 ? '무(핸무)' : '승패쪽'), '보통이상|' + bucket(odds[v.j])].concat(odds[v.j] >= 3 ? ['고배당|표본' + (v.max >= 50 ? '50+' : v.max >= 20 ? '20~49' : v.max >= 8 ? '8~19' : '<8') , '고배당|차이' + (v.wres >= 20 ? '20+' : v.wres >= 12 ? '12~19' : '<12'), '고배당|표본20+차이12+|' + (v.max >= 20 && v.wres >= 12 ? 'Y' : 'N')] : [])) { const t = OB[key] || (OB[key] = { n: 0, hit: 0, exp: 0, ret: 0 }); t.n++; t.exp += 1 / odds[v.j] / s; if (res === v.j) { t.hit++; t.ret += odds[v.j] } } }; const rec = (pol, mk, v, odds, res) => { if (!v) return; const js = odds[1] > 1 ? js3 : wl, s = js.reduce((a, q) => a + 1 / odds[q], 0); for (const key of [pol + '|' + mk + '|' + ['약함', '보통', '강함'][v.g], pol + '|' + mk + '|보통이상'].filter(k => !k.endsWith('보통이상') || v.g >= 1)) { const t = ST[key] || (ST[key] = { n: 0, hit: 0, exp: 0, ret: 0 }); t.n++; t.exp += 1 / odds[v.j] / s; if (res === v.j) { t.hit++; t.ret += odds[v.j] } } };
const start = pairs.findIndex(x => x.dt >= from); let tested = 0; const t0 = Date.now();
for (let ti = start; ti < pairs.length; ti++) {
  const G = pairs[ti]; const P = pairAnalysis(ti);
  const SN = singleAnalysis(AN, { dt: G.dt, i: G.ni, f: G.nf, ch: G.nch, v: G.nv, ln: 0, il: 0 }, false);
  const SH = singleAnalysis(G.hf[1] > 1 ? AH3 : AH2, { dt: G.dt, i: G.hi, f: G.hf, ch: G.hch, v: G.hv, ln: G.ln, il: G.ihc }, true);
  tested++;
  const pn = verdict([P.N]), sn = verdict([SN]), ph = verdict([P.H]), sh = verdict([SH]);
  for (const th of [0.95, 0.9, 0.85]) { TH = th; const pn2 = verdict([P.N]), sn2 = verdict([SN]), ph2 = verdict([P.H]), sh2 = verdict([SH]);
    for (const [mk, pv, sv, odds, res] of [['일반', pn2, sn2, G.nf, G.r1], ['핸디', ph2, sh2, G.hf, G.r2]]) rec('TH' + th, mk, fin(combine(pv, sv)), odds, res) }
  TH = 0.95;
  for (const [mk, pv, sv, odds, res] of [['일반', pn, sn, G.nf, G.r1], ['핸디', ph, sh, G.hf, G.r2]]) {
    rec('A 짝 메인', mk, fin(combine(pv, sv)), odds, res); rec2(mk, fin(combine(pv, sv)), odds, res);
    rec('B 단독 메인', mk, fin(combine(sv, pv)), odds, res);
    rec('C 같은 무게', mk, fin(verdict(mk === '일반' ? [P.N, SN] : [P.H, SH])), odds, res);
  }
}
fs.writeFileSync(`/tmp/pol_${sp}${process.env.EXP ? '_exp' : ''}.json`, JSON.stringify({ tested, ST, OB }));
console.log(sp, '시험 경기', tested, ((Date.now() - t0) / 1000).toFixed(0) + 's');
for (const k of Object.keys(ST).sort()) { const s = ST[k]; console.log(k.padEnd(22), String(s.n).padStart(6), '적중', (s.hit / s.n * 100).toFixed(1) + '%', '배당상', (s.exp / s.n * 100).toFixed(1) + '%', '차이', ((s.hit - s.exp) / s.n * 100).toFixed(1) + '%p', '수익', ((s.ret / s.n - 1) * 100).toFixed(1) + '%', '±' + (196 * Math.sqrt(.25 / s.n)).toFixed(1)) }
