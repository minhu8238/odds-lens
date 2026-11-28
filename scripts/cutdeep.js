// 절삭 심층 분석: ① 절삭 방식(한 칸만 내림 / 내리고 다른 칸 올림 / 여러 칸 내림) ② 돈과 절삭 방향 ③ 일반·핸디 일치
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const D = path.join(__dirname, '..', 'data'), RR = { W: 0, D: 1, L: 2 }, idx = JSON.parse(fs.readFileSync(path.join(D, 'history_new', 'index.json')));
const pct = (o, t) => { const js = t ? [0, 1, 2] : [0, 2], s = js.reduce((a, j) => a + 1 / o[j], 0); return [0, 1, 2].map(j => js.includes(j) ? 1 / o[j] / s * 100 : 0) };
const ST = {}; const add = (k, p, hit, odd) => { const s = ST[k] || (ST[k] = { n: 0, hit: 0, exp: 0, ret: 0 }); s.n++; s.exp += p / 100; if (hit) { s.hit++; s.ret += odd } };
const f = s => `${String(s.n).padStart(6)}  잘린 칸 ${(s.hit / s.n * 100).toFixed(1).padStart(5)}% (배당상 ${(s.exp / s.n * 100).toFixed(1)})  차이 ${((s.hit - s.exp) / s.n * 100 >= 0 ? '+' : '') + ((s.hit - s.exp) / s.n * 100).toFixed(1)}%p  수익 ${((s.ret / s.n - 1) * 100).toFixed(0)}%`;
for (const sp of ['soccer', 'basketball', 'baseball', 'volleyball']) {
  const key = sp === 'soccer' ? 'soccer_normal_3' : sp + '_normal_2', t3 = sp === 'soccer';
  const P = l => { const a = l.split(','); if (a.length !== 18 || !(a[17] in RR)) return null; const n = i => +a[i]; return { dt: a[0], h: a[2], a: a[3], i: [n(5), n(6), n(7)], f: [n(8), n(9), n(10)], ch: n(11), v: [n(14), n(15), n(16)], r: RR[a[17]] } };
  let rows = zlib.gunzipSync(fs.readFileSync(path.join(D, 'atlas', key + '.csv.gz'))).toString().split('\n').filter(Boolean).map(P).filter(Boolean);
  for (const rd of idx['atlas_' + key] || []) { const fp = path.join(D, 'history_new', String(rd), 'atlas_' + key + '.csv'); if (fs.existsSync(fp)) rows = rows.concat(fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean).map(P).filter(Boolean)) }
  const seen = new Set(); rows = rows.filter(x => { const k = x.dt + x.h + x.a; if (seen.has(k)) return false; seen.add(k); return x.f[0] > 1 && x.f[2] > 1 && x.i[0] > 1 && x.i[2] > 1 && (!t3 || (x.f[1] > 1 && x.i[1] > 1)) });
  const js = t3 ? [0, 1, 2] : [0, 2];
  for (const x of rows) {
    const d = js.map(j => x.f[j] - x.i[j]); let ci = -1, mv = 0; d.forEach((v, q) => { if (v < mv - 1e-9) { mv = v; ci = q } }); if (ci < 0) continue;
    const j = js[ci], pf = pct(x.f, t3), pi = pct(x.i, t3), amt = pf[j] - pi[j]; if (amt < 0.3) continue;
    const others = d.filter((_, q) => q !== ci), how = others.every(v => Math.abs(v) < 1e-9) ? '①한 칸만 내림' : others.some(v => v > 1e-9) && others.every(v => v >= -1e-9) ? '②내리고 다른 칸 올림' : '③여러 칸 내림';
    const fav = x.i[0] <= x.i[2] ? 0 : 2, role = j === 1 ? '무' : j === fav ? '정배' : '역배';
    const ab = amt < 2 ? '작게(<2%p)' : amt < 5 ? '중간(2~5)' : '크게(5+)';
    const hit = x.r === j;
    add(sp + '|A 방식|' + how, pf[j], hit, x.f[j]); add(sp + '|A 방식×크기|' + how + ' · ' + ab, pf[j], hit, x.f[j]); add(sp + '|A 방식×칸|' + how + ' · ' + role, pf[j], hit, x.f[j]);
    const vs = x.v.reduce((a, b) => a + b, 0);
    if (vs > 50 && x.dt >= '2015') { const sk = x.v[j] / vs * 100 - pf[j], m = sk >= 15 ? '①돈 몰린 칸을 자름(+15↑)' : sk >= 5 ? '②돈 조금 더(+5~15)' : sk > -5 ? '③비슷(±5)' : sk > -15 ? '④돈 조금 덜(−5~15)' : '⑤돈 없는 칸을 자름(−15↓)';
      add(sp + '|B 돈|' + m, pf[j], hit, x.f[j]); add(sp + '|B 돈×칸|' + m + ' · ' + role, pf[j], hit, x.f[j]) }
  }
  // ③ 일반·핸디 일치 (짝 데이터)
  const pr = zlib.gunzipSync(fs.readFileSync(path.join(D, 'history', 'pair_' + sp + '.csv.gz'))).toString().split('\n').filter(Boolean);
  for (const l of pr) { const a = l.split(','); if (a.length < 28) continue; const n = i => +a[i];
    const ni = [n(5), n(6), n(7)], nf = [n(8), n(9), n(10)], ln = n(15), hi = [n(16), n(17), n(18)], hf = [n(19), n(20), n(21)], r1 = n(26), ihc = a.length >= 29 && a[28] !== '' ? n(28) : ln;
    if (!(nf[0] > 1 && nf[2] > 1 && ni[0] > 1 && ni[2] > 1 && hi[0] > 1 && hf[0] > 1) || !(r1 >= 0)) continue;
    const n3 = nf[1] > 1, pf = pct(nf, n3), pi = pct(ni, n3), hm = pf[0] - pi[0]; if (Math.abs(hm) < 1) continue;           // 일반 홈 쪽 확률 변화
    const toHome = hm > 0, h3 = hf[1] > 1, hpf = pct(hf, h3), hpi = pct(hi, h3), hhm = hpf[0] - hpi[0], lmv = ln - ihc;   // 핸디: 기준점이 내려가면(−) 홈 쪽
    const hdir = lmv !== 0 ? (lmv < 0 ? 1 : -1) : (Math.abs(hhm) >= 1 ? Math.sign(hhm) : 0);
    const agree = hdir === 0 ? '②핸디 그대로' : (hdir > 0) === toHome ? '①핸디도 같은 쪽' : '③핸디는 반대쪽';
    const j = toHome ? 0 : 2; add(sp + '|C 일반·핸디|' + agree + (lmv !== 0 ? ' (기준점 이동)' : ''), pf[j], r1 === j, nf[j]) }
}
let last = ''; for (const k of Object.keys(ST).sort()) { const [sp, g, lab] = k.split('|'); if (ST[k].n < 60) continue; if (sp + g !== last) { console.log(`\n[${sp}] ${g}`); last = sp + g } console.log('  ' + lab.padEnd(34) + f(ST[k])) }
