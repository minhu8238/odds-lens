// ODDS ATLAS 방식 자동 분석 → data/analysis.json
// 경기(시장)마다 과거 같은 시장에서 비슷한 경기를 찾는다. 직전 회차까지의 끝난 경기만 사용.
//   final(최종): 최종 내재확률 결과별 ±1%p, 최종 기준점 같음
//   both(초기+최종): 초기·최종 내재확률 결과별 ±2%p(2way ±1.5%p), 결과별 움직임 방향 같음, 배당 변경 여부 같음, 초기·최종 기준점 같음
//   2차: 위 결과에서 구매율 결과별 ±10%p(2way ±7%p)
// 결과별 판정(ATLAS 규칙, 표본 수 기준 없음):
//   후보 = 두 기간 모두 기대보다 더 맞음 + 오즈 판단 신호(배당 내려감 + 구매율이 배당 확률보다 5%p 이상 낮음)
//   피하기 = 두 기간 모두 덜 맞음, 또는 대중 추격 신호(배당 올라감 + 구매 몰림)
//   좋음 = 두 기간 모두 더 맞음(신호 판단 불가/최종 방식) · 패스 = 그 외 · 없음 = 비슷한 경기 0개
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { marketKey } = require('./model.js');
const DATA = path.join(__dirname, '..', 'data');
const RESI = { W: 0, D: 1, L: 2 };

const cache = {};
function rowsOf(key) {
  if (cache[key]) return cache[key];
  const src = [];
  const gz = path.join(DATA, 'atlas', key + '.csv.gz');
  if (fs.existsSync(gz)) for (const l of zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8').split('\n')) src.push([0, l]);
  const nd = path.join(DATA, 'history_new');
  if (fs.existsSync(nd)) for (const rd of fs.readdirSync(nd).filter(x => /^\d+$/.test(x))) {
    const f = path.join(nd, rd, 'atlas_' + key + '.csv');
    if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split('\n')) src.push([+rd, l]);
  }
  const rows = [];
  for (const [rd, l] of src) {
    if (!l) continue; const x = l.split(','); if (x.length !== 18) continue;
    const n = i => x[i] === '' ? NaN : +x[i];
    const io = [n(5), n(6), n(7)], fo = [n(8), n(9), n(10)];
    const three = fo[1] > 1 && io[1] > 1, ri = RESI[x[17]];
    if (!(io[0] > 1 && io[2] > 1 && fo[0] > 1 && fo[2] > 1) || ri == null || (!three && ri === 1)) continue;
    const js = three ? [0, 1, 2] : [0, 2];
    const sI = js.reduce((z, j) => z + 1 / io[j], 0), sF = js.reduce((z, j) => z + 1 / fo[j], 0);
    const ni = [NaN, NaN, NaN], nf = [NaN, NaN, NaN], dir = [0, 0, 0];
    for (const j of js) { ni[j] = 1 / io[j] / sI; nf[j] = 1 / fo[j] / sF; const d = fo[j] - io[j]; dir[j] = d > 0.005 ? 1 : d < -0.005 ? -1 : 0 }
    rows.push({ rd, dt: x[0], yr: +x[0].slice(0, 4), lg: x[1], h: x[2], a: x[3], sc: x[4], three, io, fo, ni, nf, dir, ri, ch: n(11), ihc: n(12), hc: n(13), v: [n(14), n(15), n(16)] });
  }
  return cache[key] = rows;
}
const ok = v => v === v && v != null;
function search(rows, q, mode) {
  const T = (mode === 'final' ? 0.01 : (q.three ? 0.02 : 0.015)) + 1e-12, out = [];
  for (const r of rows) {
    if (r.rd && r.rd >= q.round) continue;
    if (r.three !== q.three) continue;
    let m = true;
    if (mode === 'final') { for (const j of q.js) if (Math.abs(r.nf[j] - q.nf[j]) > T) { m = false; break } }
    else { for (const j of q.js) if (Math.abs(r.ni[j] - q.ni[j]) > T || Math.abs(r.nf[j] - q.nf[j]) > T || r.dir[j] !== q.dir[j]) { m = false; break } }
    if (!m) continue;
    if (mode === 'both' && (!ok(r.ch) || (r.ch > 0) !== q.moved)) continue;
    if (q.hasLine) { if (mode === 'both' && Math.abs(r.ihc - q.li) > 1e-9) continue; if (Math.abs(r.hc - q.lf) > 1e-9) continue }
    out.push(r);
  }
  return out.sort((a, b) => a.dt < b.dt ? 1 : -1);
}
const votePass = (r, q) => q.js.every(j => !ok(q.v[j]) || (ok(r.v[j]) && Math.abs(r.v[j] - q.v[j]) <= (q.three ? 10 : 7) + 1e-9));
function stat(rows, j, f) {
  let n = 0, k = 0, e = 0, ret = 0;
  for (const r of rows) { if (f && !f(r.yr)) continue; n++; e += r.nf[j]; if (r.ri === j) { k++; ret += r.fo[j] } }
  const act = n ? k / n * 100 : NaN, p = act / 100;
  return { n, k, act, exp: n ? e / n * 100 : NaN, res: n ? k / n * 100 - e / n * 100 : NaN, roi: n ? (ret / n - 1) * 100 : NaN, moe: n ? 196 * Math.sqrt(p * (1 - p) / n) : NaN };
}
const A = y => y <= 2022, B = y => y >= 2023;
function sigClass(io, fo, ep, vote) {
  if (!(vote >= 0)) return 'na';
  const heat = vote - ep, pct = (fo - io) / io * 100;
  if (pct <= -0.3 && heat <= -5) return 'judge'; if (pct <= -0.3 && heat >= 5) return 'money'; if (pct >= 0.3 && heat >= 5) return 'chase'; return 'none';
}
// 표본 수 기준 없이 방향만으로 판정 (표본이 적으면 페이지에서 '적음'으로 표시)
// 좋은 방향 = 전체 차이 > 0 이고, 경기가 있는 기간(~2022, 2023~)은 모두 > 0. 나쁜 방향은 반대.
function verdict(s, sA, sB, sig) {
  if (!s.n) return 'none';
  const per = [sA, sB].filter(x => x.n > 0);
  const good = s.res > 0 && per.every(x => x.res > 0), bad = s.res < 0 && per.every(x => x.res < 0);
  if (sig === 'judge' && good) return 'go';
  if (sig === 'chase') return 'no';
  if (bad) return 'no';
  if (sig === 'na' || sig === 'fin') return good ? 'good' : 'pass';
  return 'pass';
}
const r1 = x => x === x ? Math.round(x * 10) / 10 : null;
function analyzeMarket(g, round) {
  const three = g.o[1] > 0;
  const key = marketKey(g.sp, g.ty, three ? 3 : 2, g.bn); if (!key) return null;
  const rows = rowsOf(key); if (!rows.length) return null;
  const fo = g.o.slice(), io = (g.i && g.i[0] > 1 && g.i[2] > 1 && (!three || g.i[1] > 1) ? g.i : g.o).slice();
  const js = three ? [0, 1, 2] : [0, 2];
  const sI = js.reduce((z, j) => z + 1 / io[j], 0), sF = js.reduce((z, j) => z + 1 / fo[j], 0);
  const ni = [NaN, NaN, NaN], nf = [NaN, NaN, NaN], dir = [0, 0, 0];
  for (const j of js) { ni[j] = 1 / io[j] / sI; nf[j] = 1 / fo[j] / sF; const d = fo[j] - io[j]; dir[j] = d > 0.005 ? 1 : d < -0.005 ? -1 : 0 }
  const vs = g.v ? g.v.reduce((a, b) => a + b, 0) : 0;
  const v = vs > 50 ? g.v.map((x, j) => js.includes(j) ? x / vs * 100 : NaN) : [NaN, NaN, NaN];
  const hasV = js.every(j => ok(v[j]));
  const hasLine = /핸디|언더오버/.test(g.ty);
  const q = { round, three, js, io, fo, ni, nf, dir, moved: js.some(j => dir[j] !== 0), hasLine, li: g.il != null ? g.il : (g.ln || 0), lf: g.ln || 0, v };
  const out = { key, hasV, modes: {} };
  for (const mode of ['both', 'final']) {
    const R1 = search(rows, q, mode), R2 = hasV ? R1.filter(r => votePass(r, q)) : null, R = R2 || R1;
    const slots = js.map(j => {
      const s = stat(R, j), sA = stat(R, j, A), sB = stat(R, j, B);
      const sig = !hasV ? 'na' : mode === 'final' ? 'fin' : sigClass(io[j], fo[j], nf[j] * 100, v[j]);
      return { j, n: s.n, act: r1(s.act), exp: r1(s.exp), res: r1(s.res), roi: r1(s.roi), moe: r1(s.moe), nA: sA.n, resA: r1(sA.res), nB: sB.n, resB: r1(sB.res), sig, vd: verdict(s, sA, sB, sig) };
    });
    out.modes[mode] = { n1: R1.length, n2: R2 ? R2.length : null, slots,
      list: R.slice(0, 20).map(r => [r.dt, r.lg, r.h, r.a, r.sc, r.io, r.fo, r.ch, r.ri, r.v.map(x => ok(x) ? Math.round(x) : null), r.hc]) };
  }
  return out;
}
// 페이지가 회차별 짝 파일을 찾을 수 있게 목록 작성
{
  const nd = path.join(DATA, 'history_new'), idx = {};
  if (fs.existsSync(nd)) for (const rd of fs.readdirSync(nd).filter(x => /^\d+$/.test(x)).sort())
    for (const f of fs.readdirSync(path.join(nd, rd))) { const m = f.match(/^(ou)?pair_(\w+)\.csv$/); if (m) { const k = (m[1] ? 'ou_' : '') + m[2]; (idx[k] = idx[k] || []).push(+rd) } }
  if (fs.existsSync(nd)) fs.writeFileSync(path.join(nd, 'index.json'), JSON.stringify(idx));
}
const snap = JSON.parse(fs.readFileSync(path.join(DATA, 'latest.json'), 'utf8'));
const out = { updated: snap.updated, method: 'atlas', games: {} };
let cnt = 0;
for (const r of snap.rounds) for (const g of r.games) {
  if (g.t < snap.updated - 6 * 3600e3) continue;
  const a = analyzeMarket(g, r.gmTs); if (!a) continue;
  out.games[`${r.gmTs}:${g.s}`] = a; cnt++;
}
fs.writeFileSync(path.join(DATA, 'analysis.json'), JSON.stringify(out));
console.log('ATLAS 분석 완료', cnt, '시장, 과거', Object.entries(cache).map(([k, v]) => `${k}:${v.length}`).join(' '));
