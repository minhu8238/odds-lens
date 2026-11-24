// 자동 분석: 현재 회차 각 경기에 (1) 모델 판정 (2) 과거 비슷한 경기 통계를 붙여 data/analysis.json 생성
// 비슷한 경기 규칙(고정): 같은 시장, 최종 배당 확률이 모든 결과에서 ±1%p 이내. 표본이 적어도 그대로 표시(페이지에서 경고).
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { judge } = require('./model.js');
const DATA = path.join(__dirname, '..', 'data');
const TOL = 0.01, MIN_N = 1;

const cache = {};
function history(key) {
  if (cache[key] !== undefined) return cache[key];
  const lines = [];
  const gz = path.join(DATA, 'history', key + '.csv.gz');
  if (fs.existsSync(gz)) lines.push(...zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8').split('\n'));
  const nw = path.join(DATA, 'history_new', key + '.csv');
  if (fs.existsSync(nw)) lines.push(...fs.readFileSync(nw, 'utf8').split('\n'));
  const k = +key.slice(-1);
  const F = [], Y = [], R = [];
  for (const ln of lines) {
    if (!ln) continue;
    const a = ln.split(',');
    const o = a.slice(1, 1 + k).map(Number); if (o.some(x => !(x > 1))) continue;
    const inv = o.map(x => 1 / x), s = inv.reduce((p, q) => p + q, 0);
    F.push(inv.map(x => x / s)); Y.push(+a[0].slice(0, 4)); R.push(+a[a.length - 1]);
  }
  return cache[key] = { k, F, Y, R, n: F.length };
}
function similar(key, Fq) {
  const H = history(key); if (!H.n) return null;
  const k = H.k, idx = [];
  for (let i = 0; i < H.n; i++) { const f = H.F[i]; let ok = true; for (let j = 0; j < k; j++) if (Math.abs(f[j] - Fq[j]) > TOL) { ok = false; break } if (ok) idx.push(i) }
  const n = idx.length; if (n < MIN_N) return { n };
  const stat = sel => { const m = sel.length; if (!m) return null; const act = Array(k).fill(0), exp = Array(k).fill(0); for (const i of sel) { act[H.R[i]]++; for (let j = 0; j < k; j++) exp[j] += H.F[i][j] } return { m, act: act.map(x => x / m), exp: exp.map(x => x / m) } };
  const all = stat(idx), A = stat(idx.filter(i => H.Y[i] <= 2022)), B = stat(idx.filter(i => H.Y[i] >= 2023));
  const r = x => Math.round(x * 1000) / 10;
  return {
    n, act: all.act.map(r), exp: all.exp.map(r),
    nA: A ? A.m : 0, nB: B ? B.m : 0,
    dA: A ? A.act.map((x, j) => r(x - A.exp[j])) : null, dB: B ? B.act.map((x, j) => r(x - B.exp[j])) : null
  };
}
const snap = JSON.parse(fs.readFileSync(path.join(DATA, 'latest.json'), 'utf8'));
const out = { updated: snap.updated, games: {} };
let cnt = 0;
for (const r of snap.rounds) for (const g of r.games) {
  const j = judge(g);
  const sim = j.key ? similar(j.key, j.F) : null;
  const R = x => x && x.map(v => Math.round(v * 1000) / 10);
  out.games[`${r.gmTs}:${g.s}`] = { key: j.key, cls: j.cls, tags: j.tags, F: R(j.F), P: R(j.P), E: j.E && j.E.map(v => Math.round(v * 10) / 10), V: R(j.V), rtp: Math.round(j.rtp * 1000) / 10, sim };
  cnt++;
}
fs.writeFileSync(path.join(DATA, 'analysis.json'), JSON.stringify(out));
console.log('분석 완료', cnt, '경기, 히스토리', Object.entries(cache).map(([k, v]) => `${k}:${v.n}`).join(' '));
