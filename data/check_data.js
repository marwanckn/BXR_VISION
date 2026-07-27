const fs = require('fs');
const path = require('path');

const raw = fs.readFileSync(path.join(__dirname, 'Stats_joueur.csv'), 'utf8').trim().split('\n').slice(1);
const rows = raw.map(l => l.trim());

console.log('Total match rows:', rows.length);

// check exact duplicate lines count
const counts = {};
rows.forEach(r => counts[r] = (counts[r] || 0) + 1);
const dupes = Object.entries(counts).filter(([k, v]) => v > 1);
console.log('Distinct dup line values (count>1):', dupes.length);
console.log('Sum of extra occurrences beyond 1:', dupes.reduce((a, [k, v]) => a + (v - 1), 0));

// check the specific first-40-lines-repeat issue
const first20 = rows.slice(0, 20).join('|');
const next20 = rows.slice(20, 40).join('|');
console.log('First 20 == next 20 ?', first20 === next20);

// Compute per player MJ from raw rows and compare to Stats_par_joueur.csv
const mj = {};
const gf = {};
const ga = {};
const wins = {};
const draws = {};
const losses = {};

rows.forEach(line => {
  const [home, hs, as_, away, winner] = line.split(',');
  const hsN = parseInt(hs, 10), asN = parseInt(as_, 10);
  mj[home] = (mj[home] || 0) + 1;
  mj[away] = (mj[away] || 0) + 1;
  gf[home] = (gf[home] || 0) + hsN;
  ga[home] = (ga[home] || 0) + asN;
  gf[away] = (gf[away] || 0) + asN;
  ga[away] = (ga[away] || 0) + hsN;
  if (winner === 'Draw') {
    draws[home] = (draws[home] || 0) + 1;
    draws[away] = (draws[away] || 0) + 1;
  } else if (winner === home) {
    wins[home] = (wins[home] || 0) + 1;
    losses[away] = (losses[away] || 0) + 1;
  } else if (winner === away) {
    wins[away] = (wins[away] || 0) + 1;
    losses[home] = (losses[home] || 0) + 1;
  }
});

const summaryRaw = fs.readFileSync(path.join(__dirname, 'Stats_par_joueur.csv'), 'utf8').trim().split('\n').slice(1);
console.log('\nPlayer,MJ(csv),MJ(computed),Wins(csv),Wins(computed),GF(csv),GF(computed)');
summaryRaw.forEach(line => {
  const [name, MJ, V, N, D, BP, BC] = line.split(',');
  const computedMJ = mj[name] || 0;
  const computedW = wins[name] || 0;
  const computedGF = gf[name] || 0;
  const match = (parseInt(MJ) === computedMJ) ? 'OK' : 'MISMATCH';
  console.log(`${name},${MJ},${computedMJ},${V},${computedW},${BP},${computedGF} -> ${match}`);
});
