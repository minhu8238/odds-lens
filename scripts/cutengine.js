// 절삭 보정 엔진 검증 (일반 시장)
// 1) 기준선 = 최종 배당 확률(수수료 제거)  2) 절삭 모양(어느 칸이 확률 기준으로 얼마나 깎였나 × 정배 강도 × 변경 × 구매 방향)으로
//    과거에 '실제 − 배당상'이 어땠는지 보정표를 쌓음(그 날 이전 경기만)  3) 모양을 넓은 것부터 좁은 것으로 단계적으로 반영(표본만큼만)
// 사용: node scripts/cutengine.js [종목키...]   예: soccer_normal_3 basketball_normal_2
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const D = path.join(__dirname, '..', 'data'), FROM = process.env.FROM || '20250101', K = +(process.env.K || 60);
const RR = { W: 0, D: 1, L: 2 };
const keys = process.argv.slice(2).length ? process.argv.slice(2) : ['soccer_normal_3', 'basketball_normal_2', 'baseball_normal_2', 'volleyball_normal_2'];
const idx = JSON.parse(fs.readFileSync(path.join(D, 'history_new', 'index.json')));
const pct = (o, t) => { const js = t ? [0, 1, 2] : [0, 2], s = js.reduce((a, j) => a + 1 / o[j], 0); return [0, 1, 2].map(j => js.includes(j) ? 1 / o[j] / s * 100 : 0) };
for (const key of keys) {
  const t3 = key.endsWith('_3');
  const P = l => { const a = l.split(','); if (a.length !== 18 || !(a[17] in RR)) return null; const n = i => +a[i]; return { dt: a[0], h: a[2], a: a[3], i: [n(5), n(6), n(7)], f: [n(8), n(9), n(10)], ch: n(11), v: [n(14), n(15), n(16)], r: RR[a[17]] } };
  let rows = zlib.gunzipSync(fs.readFileSync(path.join(D, 'atlas', key + '.csv.gz'))).toString().split('\n').filter(Boolean).map(P).filter(Boolean);
  for (const rd of idx['atlas_' + key] || []) { const f = path.join(D, 'history_new', String(rd), 'atlas_' + key + '.csv'); if (fs.existsSync(f)) rows = rows.concat(fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(P).filter(Boolean)) }
  const seen = new Set(); rows = rows.filter(x => { const k = x.dt + x.h + x.a; if (seen.has(k)) return false; seen.add(k); return x.f[0] > 1 && x.f[2] > 1 && (!t3 || x.f[1] > 1) }).sort((a, b) => a.dt < b.dt ? -1 : 1);
  // 경기 → 역할(정배/무/역배) 순서로 확률·결과 정리 + 모양 키
  const prep = x => {
    const ini = x.i[0] > 1 && x.i[2] > 1 ? x.i : x.f, fav = ini[0] <= ini[2] ? 0 : 2, dog = 2 - fav, ord = t3 ? [fav, 1, dog] : [fav, dog];
    const pf = pct(x.f, t3), pi = pct(ini, t3), p = ord.map(j => pf[j]), dp = ord.map(j => pf[j] - pi[j]);
    const res = ord.indexOf(x.r); let ci = 0; dp.forEach((v, q) => { if (v > dp[ci]) ci = q });
    const amt = dp[ci], ab = x.ch === 0 || amt < 0.3 ? '0' : amt < 1.5 ? '1' : amt < 3 ? '2' : amt < 5 ? '3' : amt < 8 ? '4' : '5';
    const role = ab === '0' ? '-' : (t3 ? ['정', '무', '역'] : ['정', '역'])[ci];
    const band = p[0] < 40 ? 'c' : p[0] < 55 ? 'b' : p[0] < 70 ? 'a' : 's';   // 정배 확률 기준 강도
    const cb = x.ch === 0 ? '0' : x.ch === 1 ? '1' : '2+';
    const vs = x.v.reduce((a, b) => a + b, 0); let vk = 'n';
    if (vs > 50 && role !== '-') { const vp = ord.map(j => x.v[j] / vs * 100), sk = vp[ci] - p[ci]; vk = sk >= 10 ? '추격' : sk <= -10 ? '역행' : '중립' }
    return { p, res, odds: ord.map(j => x.f[j]), keys: [band, band + role, band + role + ab, band + role + ab + cb, band + role + ab + cb + vk] }
  };
  const T = new Map(), nk = t3 ? 3 : 2;
  const get = k => { let s = T.get(k); if (!s) { s = { n: 0, r: Array(nk).fill(0) }; T.set(k, s) } return s };
  const predict = g => { const adj = Array(nk).fill(0); let used = 0; for (const k of g.keys) { const s = T.get(k); if (!s || !s.n) break; const w = s.n / (s.n + K); for (let q = 0; q < nk; q++) adj[q] += (s.r[q] / s.n - adj[q]) * w; used = s.n } return { adj, n: used } };
  const ST = {}; const rec = (k, g, q) => { const s = ST[k] || (ST[k] = { n: 0, hit: 0, exp: 0, ret: 0 }); s.n++; s.exp += g.p[q] / 100; if (g.res === q) { s.hit++; s.ret += g.odds[q] } };
  const RL = t3 ? ['정배', '무', '역배'] : ['정배', '역배'];
  let day = '', buf = [];
  const flush = () => { for (const g of buf) for (const k of g.keys) { const s = get(k); s.n++; for (let q = 0; q < nk; q++) s.r[q] += ((g.res === q ? 100 : 0) - g.p[q]) } buf = [] };
  for (const x of rows) {
    const d = x.dt.slice(0, 8); if (d !== day) { flush(); day = d }
    const g = prep(x); buf.push(g); if (g.res < 0) continue;
    if (x.dt < FROM) continue;
    const { adj, n } = predict(g); let q = 0; adj.forEach((v, j) => { if (v > adj[q]) q = j });
    const e = adj[q], eb = e < 1 ? 'a <1' : e < 2 ? 'b 1~2' : e < 3 ? 'c 2~3' : e < 5 ? 'd 3~5' : 'e 5+';
    rec('보정 ' + eb, g, q); if (e >= 2) rec('보정2+ · ' + RL[q], g, q); if (e >= 3) rec('보정3+ · 배당' + (g.odds[q] < 1.5 ? '<1.5' : g.odds[q] < 2.2 ? '1.5~2.2' : g.odds[q] < 3 ? '2.2~3' : '3+'), g, q)
  }
  const f = s => `${String(s.n).padStart(6)} 적중 ${(s.hit / s.n * 100).toFixed(1).padStart(5)}% 배당상 ${(s.exp / s.n * 100).toFixed(1).padStart(5)}% 차이 ${((s.hit - s.exp) / s.n * 100).toFixed(1).padStart(5)}%p 수익 ${((s.ret / s.n - 1) * 100).toFixed(1).padStart(6)}%`;
  console.log(`\n== ${key.split('_')[0]} (${rows.length}경기, 시험 ${FROM}~, K=${K})`);
  for (const k of Object.keys(ST).sort()) console.log(k.padEnd(22), f(ST[k]));
}
