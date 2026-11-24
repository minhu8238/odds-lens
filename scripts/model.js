// ODDS LENS 모델: 시장별 로지스틱 계수 (2013~2026 배트맨 데이터로 학습, 2024~ 실전 테스트로 판정 기준 확정)
const CFG = {"soccer_normal_3":{"t":0.03,"pick":true,"avoid":true,"ll":true,"c":[1.1597,0.0389,-0.12089,-0.00653,0.0583,-0.03735,0.04453,0.04503,0.1929,0.08212]},"soccer_handicap_3":{"t":0.02,"pick":false,"avoid":true,"ll":true,"c":[1.12475,-0.01116,-0.16265,-0.0131,0.00777,0.03304,0.03192,0.02224,0.18602,0.05048]},"soccer_handicap_2":{"t":0.03,"pick":false,"avoid":true,"ll":true,"c":[1.21374,0.34084,-0.04488,0.0736,-0.13677,0.00353,0.26534,0.11444,-0.11705]},"soccer_ou_2":{"t":0.01,"pick":false,"avoid":false,"ll":false,"c":[]},"baseball_normal_2":{"t":0.03,"pick":false,"avoid":false,"ll":false,"c":[]},"baseball_handicap_2":{"t":0.02,"pick":false,"avoid":false,"ll":false,"c":[]},"baseball_ou_2":{"t":0.06,"pick":false,"avoid":true,"ll":true,"c":[0.88123,0.13153,0.25597,-0.0016,0.15663,0.00048,0.11505,0.07858,-0.0785]},"baseball_w1l_3":{"t":0.02,"pick":false,"avoid":false,"ll":false,"c":[]},"basketball_normal_2":{"t":0.02,"pick":false,"avoid":true,"ll":true,"c":[1.1522,0.07321,-0.11648,0.00385,0.03576,0.00216,-0.48468,-0.00096,0.00062]},"basketball_handicap_2":{"t":0.01,"pick":false,"avoid":false,"ll":true,"c":[0.69344,0.19123,-0.11604,0.00253,0.18673,-0.0002,0.05176,-0.00692,0.00701]},"basketball_ou_2":{"t":0.02,"pick":false,"avoid":false,"ll":true,"c":[-0.01026,-0.0027,0.12443,-4e-05,-0.0008,-0.0,-0.00064,0.0553,-0.05531]},"volleyball_normal_2":{"t":0.04,"pick":false,"avoid":false,"ll":false,"c":[]},"volleyball_handicap_2":{"t":0.06,"pick":false,"avoid":true,"ll":true,"c":[1.29866,0.76942,0.15505,0.02355,-0.03351,0.04792,-0.09765,0.01418,-0.01337]},"volleyball_ou_2":{"t":0.05,"pick":false,"avoid":false,"ll":false,"c":[]}};
const SPK = { 축구: 'soccer', 야구: 'baseball', 농구: 'basketball', 배구: 'volleyball' };
// 배트맨 경기 → 시장 키 (과거 데이터 파일명과 같음). 승N패/승1패는 히스토리 키만 있고 모델 없음.
function marketKey(sp, ty, k, bn) {
  // 전반·후반 등 경기 일부 시장과 홀짝은 과거 데이터·모델이 없음
  const S = SPK[sp]; if (!S || /홀짝/.test(ty) || /전반|후반|이닝|쿼터|세트 /.test(bn || '')) return null;
  let m = null;
  if (/승1패/.test(ty)) m = 'w1l'; else if (/승5패|승N패/.test(ty)) m = 'w5l';
  else if (/승무패|승패/.test(ty) && !/핸디/.test(ty)) m = 'normal';
  else if (/핸디/.test(ty)) m = 'handicap'; else if (/언더오버/.test(ty)) m = 'ou';
  return m ? `${S}_${m}_${k}` : null;
}
const norm = a => { const s = a.reduce((x, y) => x + y, 0); return a.map(x => x / s) };
const sig = x => 1 / (1 + Math.exp(-x));
function predict(F, I, V, ch, rtp, w) {
  const k = F.length, rd = (rtp - .86) * 10, p = [];
  for (let j = 0; j < k; j++) {
    const lf = Math.log(F[j] / (1 - F[j])), mv = Math.log(F[j] / I[j]), ht = V[j] - F[j];
    const x = [lf, mv, ht, mv * ht, mv * ch, ht * lf, rd * lf]; for (let s = 0; s < k; s++) x.push(s === j ? 1 : 0);
    let z = 0; x.forEach((v, i) => z += v * w[i]); p.push(sig(z));
  }
  return norm(p);
}
// g: 수집 데이터의 경기 한 줄 → 판정
function judge(g) {
  const three = g.o[1] > 0, pick = a => three ? a : [a[0], a[2]];
  const fo = pick(g.o); let io = g.i ? pick(g.i) : fo.slice(); if (io.some(x => !(x > 1))) io = fo.slice();
  const vv = g.v ? pick(g.v) : null, vt = vv ? vv.reduce((a, b) => a + b, 0) : 0;
  const F = norm(fo.map(x => 1 / x)), I = norm(io.map(x => 1 / x)), V = vt >= 50 ? norm(vv) : null, rtp = 1 / fo.reduce((a, x) => a + 1 / x, 0);
  const key = marketKey(g.sp, g.ty, fo.length, g.bn), c = key && CFG[key];
  const out = { key, k: fo.length, fo, io, F, I, V, rtp, P: null, E: null, tags: fo.map(() => ''), cls: 'n' };
  if (c && c.ll) {
    out.P = predict(F, I, V || F, Math.min(g.c || 0, 3), rtp, c.c); out.E = out.P.map((p, j) => (p - F[j]) * 100); const t = c.t * 100;
    out.tags = out.E.map(e => e >= t && c.pick ? 'c' : e >= t - 1 && e >= 1 && c.pick ? 'w' : e <= -2 && c.avoid ? 'x' : '');
    out.cls = out.tags.includes('c') ? 'c' : out.tags.includes('w') ? 'w' : out.tags.includes('x') ? 'x' : '';
  }
  return out;
}
if (typeof module !== 'undefined') module.exports = { CFG, marketKey, judge, norm };
