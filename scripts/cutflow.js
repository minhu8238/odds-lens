// 절삭 흐름 패턴 분석: 초기→최종 배당이 어느 쪽으로 얼마나·몇 번 잘렸는지(+핸디 기준점 이동)로 경기를 묶고
// 패턴별로 결과가 최종 배당 확률보다 더 나왔는지 본다. 2025년 이전(학습)에서 고른 패턴을 2025년 이후(시험)에 검증.
// 사용: node scripts/cutflow.js <종목>
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const sp = process.argv[2] || 'soccer', SPLIT = process.argv[3] || '20250101';
const D = path.join(__dirname, '..', 'data');
const rows = zlib.gunzipSync(fs.readFileSync(path.join(D, 'history', 'pair_' + sp + '.csv.gz'))).toString().split('\n').filter(Boolean).map(l => {
  const a = l.split(','); if (a.length < 28) return null; const n = i => +a[i];
  return { dt: a[0], ni: [n(5), n(6), n(7)], nf: [n(8), n(9), n(10)], nch: n(11), ln: n(15), hi: [n(16), n(17), n(18)], hf: [n(19), n(20), n(21)], hch: n(22), r1: n(26), r2: n(27), ihc: a.length >= 29 && a[28] !== '' ? n(28) : n(15) }
}).filter(x => x && x.nf[0] > 1 && x.nf[2] > 1 && x.ni[0] > 1 && x.ni[2] > 1 && x.r1 >= 0);
const norm = o => { const js = o[1] > 1 ? [0, 1, 2] : [0, 2], s = js.reduce((a, j) => a + 1 / o[j], 0); return [0, 1, 2].map(j => js.includes(j) ? 1 / o[j] / s * 100 : 0) };
const LAB = ['승', '무', '패'];
function feat(x) {
  const pi = norm(x.ni), pf = norm(x.nf), js = x.nf[1] > 1 ? [0, 1, 2] : [0, 2], dp = js.map(j => [j, pf[j] - pi[j]]);
  dp.sort((a, b) => b[1] - a[1]); const [cut, mag] = dp[0];
  if (x.nch === 0 || mag < 0.5) return { key: '무변동', cut: null, pf };
  const mb = mag < 2 ? '①2%p미만' : mag < 4 ? '②2~4%p' : mag < 7 ? '③4~7%p' : '④7%p이상';
  const cb = x.nch === 1 ? '1번' : x.nch === 2 ? '2번' : '3번+';
  const band = pf[cut] < 35 ? '역배' : pf[cut] < 50 ? '접전' : pf[cut] < 65 ? '약정배' : '정배';
  // 핸디 기준점 이동: 홈 기준으로 홈에 유리하게(기준점이 내려감) / 불리하게 / 그대로
  const lm = x.ln === x.ihc ? '기준점그대로' : ((x.ln < x.ihc) === (cut === 0) ? '기준점같은쪽' : (cut === 1 ? '기준점이동' : '기준점반대쪽'));
  return { key: [LAB[cut] + '절삭', mb, cb, band].join(' · '), key2: [LAB[cut] + '절삭', mb, band, lm].join(' · '), cut, pf, mag, lm }
}
const S = {}, T = {};
const add = (M, k, x, f, j) => { const s = M[k] || (M[k] = { n: 0, hit: 0, exp: 0, ret: 0 }); s.n++; s.exp += f.pf[j] / 100; if (x.r1 === j) { s.hit++; s.ret += x.nf[j] } };
for (const x of rows) {
  const f = feat(x), tr = x.dt < SPLIT ? S : T;
  if (f.cut === null) { add(tr, '무변동|승', x, f, 0); continue }
  add(tr, 'ALL|절삭쪽', x, f, f.cut);
  add(tr, 'MAG|' + f.key.split(' · ')[1], x, f, f.cut);
  add(tr, 'CNT|' + f.key.split(' · ')[2], x, f, f.cut);
  add(tr, 'LM|' + f.lm, x, f, f.cut);
  add(tr, 'P1|' + f.key, x, f, f.cut);
  add(tr, 'P2|' + f.key2, x, f, f.cut);
}
const fmt = s => s ? `${String(s.n).padStart(6)} 적중 ${(s.hit / s.n * 100).toFixed(1).padStart(5)}% 배당상 ${(s.exp / s.n * 100).toFixed(1).padStart(5)}% 차이 ${((s.hit - s.exp) / s.n * 100).toFixed(1).padStart(5)}%p 수익 ${((s.ret / s.n - 1) * 100).toFixed(1).padStart(6)}%` : '-';
console.log(`== ${sp} (학습 ~${SPLIT} / 시험 ${SPLIT}~)`);
for (const pre of ['ALL', 'MAG', 'CNT', 'LM']) for (const k of Object.keys(S).filter(k => k.startsWith(pre + '|')).sort()) console.log(k.padEnd(22), '학습', fmt(S[k]), '| 시험', fmt(T[k]));
// 학습에서 좋았던 패턴(표본 50+, 차이 +3%p 이상) → 시험 성적
for (const P of ['P1', 'P2']) {
  const good = Object.keys(S).filter(k => k.startsWith(P + '|') && S[k].n >= 50 && (S[k].hit - S[k].exp) / S[k].n >= 0.03);
  const tot = { n: 0, hit: 0, exp: 0, ret: 0 }; for (const k of good) if (T[k]) for (const q in tot) tot[q] += T[k][q];
  console.log(`-- ${P} 학습에서 좋았던 패턴 ${good.length}개 → 시험 합계`, fmt(tot));
  for (const k of good.sort((a, b) => (S[b].hit - S[b].exp) / S[b].n - (S[a].hit - S[a].exp) / S[a].n).slice(0, 8)) console.log('   ', k.slice(3).padEnd(40), '학습', fmt(S[k]), '| 시험', fmt(T[k]));
}
fs.writeFileSync(`/tmp/cut_${sp}.json`, JSON.stringify({ S, T }));
