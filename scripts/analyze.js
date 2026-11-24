// 자동 분석: 현재 회차 각 경기에 (1) 모델 판정 (2) 과거 비슷한 경기 통계를 붙여 data/analysis.json 생성
// 과거 비슷한 경기는 세 단계(규칙 고정, 표본이 적어도 그대로 표시). 분석 회차보다 앞선 회차의 끝난 경기만 사용:
//   fin    최종만: 같은 시장·같은 기준점, 최종 배당 확률이 모든 결과에서 ±1%p
//   atlas  ATLAS: 같은 시장·같은 기준점, 초기·최종 확률 모두 ±2%p(2way ±1.5%p), 결과별 움직임 방향 일치, 배당 변경 여부 일치
//   atlasV ATLAS + 구매율: 위 + 구매율이 모든 결과에서 ±10%p(2way ±7%p)
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { judge } = require('./model.js');
const DATA = path.join(__dirname, '..', 'data');

const cache = {};
const dirOf = (f, i) => f.map((x, j) => x - i[j] > 0.005 ? 1 : x - i[j] < -0.005 ? -1 : 0);
function history(key) {
  if (cache[key] !== undefined) return cache[key];
  // [회차, 줄] 목록. 기존 데이터(.csv.gz)는 회차 0으로 취급(모든 분석에 사용), 새로 쌓인 데이터는 회차별 폴더
  const lines = [];
  const gz = path.join(DATA, 'history', key + '.csv.gz');
  if (fs.existsSync(gz)) for (const l of zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8').split('\n')) lines.push([0, l]);
  const nd = path.join(DATA, 'history_new');
  if (fs.existsSync(nd)) for (const rd of fs.readdirSync(nd)) {
    const f = path.join(nd, rd, key + '.csv');
    if (/^\d+$/.test(rd) && fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split('\n')) lines.push([+rd, l]);
  }
  const k = +key.slice(-1), rows = [];
  for (const [rd, ln] of lines) {
    if (!ln) continue;
    const a = ln.split(',');
    if (a.length !== 1 + 3 * k + 3) continue;
    const o = a.slice(1, 1 + k).map(Number); if (o.some(x => !(x > 1))) continue;
    const io = a.slice(1 + k, 1 + 2 * k).map(Number);
    const vv = a.slice(1 + 2 * k, 1 + 3 * k);
    const nz = x => { const inv = x.map(v => 1 / v), s = inv.reduce((p, q) => p + q, 0); return inv.map(v => v / s) };
    const F = nz(o), I = io.every(x => x > 1) ? nz(io) : F;
    rows.push({ rd, y: +a[0].slice(0, 4), F, I, d: dirOf(F, I), m: +a[1 + 3 * k] > 0, ln: +a[2 + 3 * k], V: vv[0] === '' ? null : vv.map(x => +x / 100), r: +a[3 + 3 * k] });
  }
  return cache[key] = { k, rows };
}
// 이항 꼬리확률: 기대 확률 p로 n번 중 c번 이상(up) / 이하(dn) 나올 확률
function lgam(x) { const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + .5) * Math.log(t); let s = 1.000000000190015; for (const v of g) s += v / ++y; return -t + Math.log(2.5066282746310005 * s / x) }
function binTail(n, c, p, up) {
  p = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
  const lc = (n, k) => lgam(n + 1) - lgam(k + 1) - lgam(n - k + 1);
  let s = 0; const from = up ? c : 0, to = up ? n : c;
  for (let k = from; k <= to; k++) s += Math.exp(lc(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
  return Math.min(1, s);
}
function stat(sel, k) {
  const r = x => Math.round(x * 1000) / 10;
  const S = list => { const m = list.length; if (!m) return null; const act = Array(k).fill(0), exp = Array(k).fill(0); for (const x of list) { act[x.r]++; for (let j = 0; j < k; j++) exp[j] += x.F[j] } return { m, act: act.map(v => v / m), exp: exp.map(v => v / m) } };
  const all = S(sel); if (!all) return { n: 0 };
  const A = S(sel.filter(x => x.y <= 2022)), B = S(sel.filter(x => x.y >= 2023));
  const cnt = all.act.map(v => Math.round(v * all.m));
  const pu = cnt.map((c, j) => +binTail(all.m, c, all.exp[j], true).toPrecision(3));
  const pd = cnt.map((c, j) => +binTail(all.m, c, all.exp[j], false).toPrecision(3));
  return { n: all.m, cnt, pu, pd, act: all.act.map(r), exp: all.exp.map(r), nA: A ? A.m : 0, nB: B ? B.m : 0,
    dA: A ? A.act.map((x, j) => r(x - A.exp[j])) : null, dB: B ? B.act.map((x, j) => r(x - B.exp[j])) : null };
}
function similar(key, q, round) {
  const H = history(key); if (!H.rows.length) return null;
  const k = H.k, tol = k === 3 ? 0.02 : 0.015, vtol = k === 3 ? 0.10 : 0.07;
  const within = (a, b, t) => { for (let j = 0; j < k; j++) if (Math.abs(a[j] - b[j]) > t) return false; return true };
  const fin = [], atlas = [], atlasV = [];
  for (const x of H.rows) {
    if (x.rd >= round) continue; // 직전 회차까지만 사용
    if (x.ln !== q.ln) continue;
    if (within(x.F, q.F, 0.01)) fin.push(x);
    if (within(x.F, q.F, tol) && within(x.I, q.I, tol) && x.m === q.m && x.d.every((v, j) => v === q.d[j])) {
      atlas.push(x);
      if (q.V && x.V && within(x.V, q.V, vtol)) atlasV.push(x);
    }
  }
  return { fin: stat(fin, k), atlas: stat(atlas, k), atlasV: q.V ? stat(atlasV, k) : null };
}
const snap = JSON.parse(fs.readFileSync(path.join(DATA, 'latest.json'), 'utf8'));
const out = { updated: snap.updated, games: {} };
let cnt = 0;
for (const r of snap.rounds) for (const g of r.games) {
  const j = judge(g);
  const q = { F: j.F, I: j.I, d: dirOf(j.F, j.I), m: (g.c || 0) > 0, ln: g.ln || 0, V: j.V };
  const sim = j.key ? similar(j.key, q, r.gmTs) : null;
  const R = x => x && x.map(v => Math.round(v * 1000) / 10);
  out.games[`${r.gmTs}:${g.s}`] = { key: j.key, cls: j.cls, tags: j.tags, F: R(j.F), P: R(j.P), E: j.E && j.E.map(v => Math.round(v * 10) / 10), V: R(j.V), rtp: Math.round(j.rtp * 1000) / 10, sim };
  cnt++;
}
fs.writeFileSync(path.join(DATA, 'analysis.json'), JSON.stringify(out));
console.log('분석 완료', cnt, '경기, 히스토리', Object.entries(cache).map(([k, v]) => `${k}:${v.rows.length}`).join(' '));
