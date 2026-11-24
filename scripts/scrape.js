// GitHub Actions에서 실행: 배트맨 데이터 → data/latest.json + data/hist/<회차>.json
const fs = require('fs');
const path = require('path');
const { buildSnapshot, shape } = require('./core.js');

const BASE = 'https://www.betman.co.kr';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let calls = 0;
async function post(p, body) {
  if (++calls > 60) throw new Error('요청 횟수 초과');
  await sleep(400);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(BASE + p, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': BASE,
          'Referer': BASE + '/main/mainPage/gamebuy/buyableGameList.do',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000)
      });
      const text = await res.text();
      try { return JSON.parse(text) } catch (e) { throw new Error(`JSON 아님 (HTTP ${res.status}): ${text.slice(0, 120)}`) }
    } catch (e) {
      if (attempt === 3) throw e;
      console.log('재시도:', e.message);
      await sleep(3000 * (attempt + 1));
    }
  }
}

(async () => {
  const dataDir = path.join(__dirname, '..', 'data');
  const histDir = path.join(dataDir, 'hist');
  fs.mkdirSync(histDir, { recursive: true });
  const snap = await buildSnapshot(post);
  if (!snap.rounds.length) throw new Error('배당이 올라온 회차 없음');
  fs.writeFileSync(path.join(dataDir, 'latest.json'), JSON.stringify(snap));
  // 시간대별 기록: 배당이 바뀌었거나 마지막 기록이 60분 넘었으면 [시각, 배당3, 구매건수3] 추가
  for (const r of snap.rounds) {
    const f = path.join(histDir, `${r.gmTs}.json`);
    let H = {};
    try { H = JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) {}
    let added = 0;
    for (const g of r.games) {
      if (g.t < snap.updated - 3 * 3600e3) continue;
      const arr = H[g.s] = H[g.s] || [];
      const last = arr[arr.length - 1];
      const row = [Math.round(snap.updated / 60000), ...g.o, ...(g.v || [0, 0, 0])];
      const oddsChanged = !last || last[1] !== row[1] || last[2] !== row[2] || last[3] !== row[3];
      if (oddsChanged || row[0] - last[0] >= 60) { arr.push(row); added++ }
    }
    if (added) fs.writeFileSync(f, JSON.stringify(H));
    console.log(`${r.gmTs} ${r.saleStatus} 경기 ${r.games.length}, 기록 추가 ${added}`);
  }
  // 끝난 경기를 과거 데이터(history_new)에 자동 추가: 날짜,최종배당k,초기배당k,구매율k,변경횟수,기준점,결과칸
  const { marketKey } = require('./model.js');
  const newDir = path.join(dataDir, 'history_new');
  fs.mkdirSync(newDir, { recursive: true });
  const seenF = path.join(newDir, 'seen.txt');
  const seen = new Set(fs.existsSync(seenF) ? fs.readFileSync(seenF, 'utf8').split('\n').filter(Boolean) : []);
  const RES = { '0': 0, '1': 1, '2': 2 };
  // 기존 과거 데이터(history/*.csv.gz)는 2026-11-14 23:00 KST 경기까지 들어 있음 → 그 이후 경기만 추가
  const HIST_END = Date.UTC(2026, 10, 14, 14, 0);
  let appended = 0;
  const addRound = r => {
    for (const g of r.games) {
      const id = `${r.gmTs}:${g.s}`;
      if (seen.has(id) || !(g.res in RES) || g.t > snap.updated) continue;
      seen.add(id);
      if (g.t <= HIST_END) continue;
      const three = g.o[1] > 0, pk = a => three ? a : [a[0], a[2]];
      const key = marketKey(g.sp, g.ty, three ? 3 : 2);
      let ri = RES[g.res]; if (!three) ri = ri === 2 ? 1 : ri === 0 ? 0 : -1;
      if (!key || ri < 0) continue;
      const kst = new Date(g.t + 9 * 3600e3), dt = kst.toISOString().slice(0, 10).replace(/-/g, '');
      const o = pk(g.o), i = g.i ? pk(g.i) : o, v = g.v ? pk(g.v) : null, vs = v ? v.reduce((a, b) => a + b, 0) : 0;
      const row = [dt, ...o.map(x => x.toFixed(2)), ...i.map(x => x > 1 ? x.toFixed(2) : ''), ...(vs > 50 ? v.map(x => (x / vs * 100).toFixed(1)) : o.map(() => '')), g.c || 0, g.ln || 0, ri];
      const rdDir = path.join(newDir, String(r.gmTs)); fs.mkdirSync(rdDir, { recursive: true });
      fs.appendFileSync(path.join(rdDir, key + '.csv'), row.join(',') + '\n');
      appended++;
    }
  };
  for (const r of snap.rounds) addRound(r);
  // 빠진 회차 메우기: 기존 데이터 마지막 회차(135)부터 현재 회차 직전까지, 결과가 다 나온 회차는 완료 표시
  const bfF = path.join(newDir, 'backfill.txt');
  let done = fs.existsSync(bfF) ? +fs.readFileSync(bfF, 'utf8').trim() : 260134;
  const cur = Math.min(...snap.rounds.map(r => r.gmTs));
  for (let ts = done + 1, steps = 0; ts < cur && steps < 6; ts++, steps++) {
    const yy = Math.floor(ts / 10000);
    const raw = await post('/buyPsblGame/gameInfoInq.do', { gmId: 'G101', gmTs: String(ts), gameYear: String(2000 + yy), _sbmInfo: { debugMode: 'false' } });
    if (!raw || !raw.compSchedules) { if (ts % 10000 > 0) done = ts; continue }
    const r = shape(raw, ts, raw.currentLottery && raw.currentLottery.saleStatus);
    addRound(r);
    const pending = r.games.filter(g => !(g.res in RES) && g.t > snap.updated - 3 * 86400e3).length;
    console.log(`메우기 ${ts}: 경기 ${r.games.length}, 결과 대기 ${pending}`);
    if (pending === 0 && done === ts - 1) done = ts;
  }
  fs.writeFileSync(bfF, String(done) + '\n');
  fs.writeFileSync(seenF, [...seen].join('\n') + '\n');
  console.log('끝난 경기 과거 데이터에 추가', appended, '/ 메우기 완료 회차', done);
  console.log('요청 수', calls);
})().catch(e => { console.error('실패:', e.message); process.exit(1) });
