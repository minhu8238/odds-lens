// 배트맨 프로토 승부식 회차 데이터를 받아 정리한다. 브라우저와 Node 양쪽에서 동작.
// post(path, body) => Promise<json> 를 주입받는다.
async function buildSnapshot(post, now = Date.now()) {
  const kst = new Date(now + 9 * 3600e3);
  const yy = kst.getUTCFullYear() % 100;
  const get = n => post('/buyPsblGame/gameInfoInq.do', { gmId: 'G101', gmTs: String(yy * 10000 + n), gameYear: String(2000 + yy), _sbmInfo: { debugMode: 'false' } });
  const has = r => r && r.compSchedules && Array.isArray(r.compSchedules.datas);
  const priced = r => { const k = r.compSchedules.keys.indexOf('winAllot'); return r.compSchedules.datas.some(d => d[k] > 0) };
  // 1) 존재하는 마지막 회차를 이분 탐색
  if (!has(await get(1))) throw new Error('올해 회차 없음');
  let lo = 1, hi = 999;
  while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (has(await get(m))) lo = m; else hi = m - 1 }
  // 2) 마지막 회차부터 거꾸로 최대 3개 확인: 배당이 올라온 회차 중 판매 전·중인 것 + 직전 1개
  const rounds = [];
  for (let n = lo; n >= Math.max(1, lo - 3) && rounds.length < 2; n--) {
    const r = await get(n);
    if (!has(r) || !priced(r)) continue;
    const st = r.currentLottery && r.currentLottery.saleStatus;
    rounds.push(shape(r, yy * 10000 + n, st));
    if (st === 'SaleComplete' && rounds.length >= 1) break;
  }
  return { updated: now, rounds };
}
function shape(r, gmTs, saleStatus) {
  const K = r.compSchedules.keys, ix = k => K.indexOf(k);
  const vote = {}; (r.voteStatus || []).forEach(v => vote[v.GM_SEQ] = [v.W_BET_CNT || 0, v.D_BET_CNT || 0, v.L_BET_CNT || 0]);
  const hist = {}; (r.tooltipList || []).slice().sort((a, b) => a.CHG_DTM < b.CHG_DTM ? -1 : 1).forEach(t => (hist[t.GM_SEQ] = hist[t.GM_SEQ] || []).push(t));
  const cl = r.currentLottery || {};
  const games = r.compSchedules.datas.filter(d => d[ix('winAllot')] > 0).map(d => {
    const g = k => d[ix(k)], seq = g('matchSeq');
    const H = (hist[seq] || []).filter(t => t.BCHG_W_ODDS !== t.ACHG_W_ODDS || t.BCHG_D_ODDS !== t.ACHG_D_ODDS || t.BCHG_L_ODDS !== t.ACHG_L_ODDS);
    const first = (hist[seq] || [])[0];
    return {
      s: seq, t: g('gameDate'), sp: g('itemName'), lg: g('leagueShortName') || g('leagueName'),
      h: g('homeName'), a: g('awayName'), ty: g('betTypNm') || g('betNm') || '', ln: g('winHandi'),
      o: [g('winAllot'), g('drawAllot'), g('loseAllot')],
      i: first ? [first.BCHG_W_ODDS / 100, first.BCHG_D_ODDS / 100, first.BCHG_L_ODDS / 100] : null,
      c: H.length, lc: H.length ? H[H.length - 1].CHG_DTM.slice(0, 12) : null,
      ch: H.map(t => [t.CHG_DTM.slice(0, 12), t.ACHG_W_ODDS / 100, t.ACHG_D_ODDS / 100, t.ACHG_L_ODDS / 100]),
      v: vote[seq] || null, res: g('gameResult'), sc: g('mchScore')
    };
  });
  return { gmTs, saleStatus, saleStart: cl.saleStartDate || null, saleEnd: cl.saleEndDate || null, games };
}
if (typeof module !== 'undefined') module.exports = { buildSnapshot, shape };
