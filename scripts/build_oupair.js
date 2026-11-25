// 일반 + 언더오버를 한 경기로 묶은 과거 데이터 만들기 (ATLAS 시장별 데이터를 경기 시각·홈·원정으로 합침)
// 형식은 pair_<종목>.csv와 같음: 핸디 자리에 언더오버(승=언더, 패=오버), 기준점 = 언더오버 기준점
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const DATA = path.join(__dirname, '..', 'data');
const NK = { soccer: 'soccer_normal_3', basketball: 'basketball_normal_2', baseball: 'baseball_normal_2', volleyball: 'volleyball_normal_2' };
const R = { W: 0, D: 1, L: 2 };
const rd = f => !fs.existsSync(f) ? [] : (f.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(f)) : fs.readFileSync(f)).toString().split('\n').filter(Boolean).map(l => l.split(','));
function join(nRows, oRows) {
  const by = new Map(); for (const a of nRows) if (a.length === 18) by.set(a[0] + '|' + a[2] + '|' + a[3], a);
  const out = [];
  for (const o of oRows) { if (o.length !== 18) continue; const n = by.get(o[0] + '|' + o[2] + '|' + o[3]); if (!n || !(n[17] in R) || !(o[17] in R)) continue;
    out.push([n[0], n[1], n[2], n[3], n[4], n[5], n[6], n[7], n[8], n[9], n[10], n[11], n[14], n[15], n[16], o[13], o[5], 0, o[7], o[8], 0, o[10], o[11], o[14], 0, o[16], R[n[17]], R[o[17]], o[12]].join(',')) }
  return out }
function roundOU(dir) { for (const [sp, nk] of Object.entries(NK)) { const rows = join(rd(path.join(dir, `atlas_${nk}.csv`)), rd(path.join(dir, `atlas_${sp}_ou_2.csv`))); if (rows.length) fs.writeFileSync(path.join(dir, `oupair_${sp}.csv`), rows.join('\n') + '\n') } }
module.exports = { roundOU };
if (require.main === module) for (const [sp, nk] of Object.entries(NK)) {
  const base = join(rd(path.join(DATA, 'atlas', nk + '.csv.gz')), rd(path.join(DATA, 'atlas', sp + '_ou_2.csv.gz')));
  fs.writeFileSync(path.join(DATA, 'history', `oupair_${sp}.csv.gz`), zlib.gzipSync(base.join('\n') + '\n'));
  let nn = 0; const nd = path.join(DATA, 'history_new');
  for (const r of fs.readdirSync(nd).filter(x => /^\d+$/.test(x))) {
    const rows = join(rd(path.join(nd, r, `atlas_${nk}.csv`)), rd(path.join(nd, r, `atlas_${sp}_ou_2.csv`)));
    if (rows.length) { fs.writeFileSync(path.join(nd, r, `oupair_${sp}.csv`), rows.join('\n') + '\n'); nn += rows.length }
  }
  console.log(sp, '기존', base.length, '최근 회차', nn);
}
