// BXR VISION — moteur statistique.
// Modele "attaque/defense" (Poisson) classique pour predire les buts d'un match,
// pondere ensuite avec l'historique direct (face-a-face) entre les deux joueurs.
(function (global) {
  'use strict';

  const DATA = global.BXR_DATA;
  const HT_GOAL_RATIO = 0.42; // hypothese: part des buts marques en 1ere mi-temps (aucune donnee HT dans le CSV)
  const MAX_GOALS = 14; // troncature de la loi de Poisson (au-dela, probabilite negligeable)

  // ---------- Donnees de base ----------
  // Les stats par joueur sont recalculees a partir de la liste des matchs (pas d'un fichier
  // d'agregats a part) : ca permet d'importer de nouveaux matchs (CSV) et de tout recalculer.

  let allMatches = (DATA && DATA.matches) ? DATA.matches.slice() : [];
  let _playersCache = null;
  let _league = null;

  function invalidateCaches() {
    _playersCache = null;
    _league = null;
  }

  function addMatches(newMatches) {
    if (!newMatches || !newMatches.length) return;
    allMatches = allMatches.concat(newMatches);
    invalidateCaches();
  }

  function getAllMatches() {
    return allMatches.slice();
  }

  function computePlayers() {
    if (_playersCache) return _playersCache;
    const map = new Map();
    function ensure(name) {
      let p = map.get(name);
      if (!p) { p = { name, mj: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }; map.set(name, p); }
      return p;
    }
    allMatches.forEach(m => {
      const home = ensure(m.p1), away = ensure(m.p2);
      home.mj++; away.mj++;
      home.gf += m.s1; home.ga += m.s2;
      away.gf += m.s2; away.ga += m.s1;
      if (m.winner === 'Draw') { home.d++; away.d++; }
      else if (m.winner === m.p1) { home.w++; away.l++; }
      else if (m.winner === m.p2) { away.w++; home.l++; }
    });
    _playersCache = Array.from(map.values()).map(p => ({
      name: p.name, mj: p.mj, w: p.w, d: p.d, l: p.l, gf: p.gf, ga: p.ga,
      diff: p.gf - p.ga,
      pts: p.w * 3 + p.d,
      winPct: p.mj ? (p.w / p.mj) * 100 : 0
    }));
    return _playersCache;
  }

  function listPlayers() {
    return computePlayers().slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  function getPlayer(name) {
    return computePlayers().find(p => p.name === name) || null;
  }

  function derived(p) {
    return {
      avgGF: p.gf / p.mj,
      avgGA: p.ga / p.mj,
      avgTotal: (p.gf + p.ga) / p.mj,
      drawPct: (p.d / p.mj) * 100,
      lossPct: (p.l / p.mj) * 100
    };
  }

  function leagueAverages() {
    if (_league) return _league;
    let sumGF = 0, sumGA = 0, sumMJ = 0;
    computePlayers().forEach(p => { sumGF += p.gf; sumGA += p.ga; sumMJ += p.mj; });
    // Moyenne de buts marques par "un cote" dans un match (chaque match contribue 2 lignes de MJ).
    _league = { avgGoalsPerSide: (sumGF + sumGA) / (2 * sumMJ) };
    return _league;
  }

  // ---------- Face-a-face ----------

  function headToHead(nameA, nameB) {
    const meetings = allMatches
      .filter(m => (m.p1 === nameA && m.p2 === nameB) || (m.p1 === nameB && m.p2 === nameA))
      .map(m => {
        const goalsA = m.p1 === nameA ? m.s1 : m.s2;
        const goalsB = m.p1 === nameA ? m.s2 : m.s1;
        return { goalsA, goalsB, total: goalsA + goalsB, winner: m.winner };
      });

    const count = meetings.length;
    let winsA = 0, winsB = 0, draws = 0, totalGoals = 0, goalsA = 0, goalsB = 0;
    meetings.forEach(m => {
      totalGoals += m.total;
      goalsA += m.goalsA;
      goalsB += m.goalsB;
      if (m.winner === nameA) winsA++;
      else if (m.winner === nameB) winsB++;
      else draws++;
    });

    return {
      count,
      meetings,
      winsA, winsB, draws,
      avgTotalGoals: count ? totalGoals / count : null,
      avgGoalsA: count ? goalsA / count : null,
      avgGoalsB: count ? goalsB / count : null
    };
  }

  // ---------- Poisson ----------

  function factorial(n) {
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }

  function poissonPmf(k, lambda) {
    return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
  }

  function poissonCdf(k, lambda) {
    let s = 0;
    for (let i = 0; i <= k; i++) s += poissonPmf(i, lambda);
    return s;
  }

  // ---------- Modele de match ----------

  function buildMatchModel(nameA, nameB) {
    const pA = getPlayer(nameA), pB = getPlayer(nameB);
    if (!pA || !pB) return null;

    const dA = derived(pA), dB = derived(pB);
    const { avgGoalsPerSide } = leagueAverages();

    const attackA = dA.avgGF / avgGoalsPerSide;
    const defenseA = dA.avgGA / avgGoalsPerSide;
    const attackB = dB.avgGF / avgGoalsPerSide;
    const defenseB = dB.avgGA / avgGoalsPerSide;

    let lambdaA = avgGoalsPerSide * attackA * defenseB;
    let lambdaB = avgGoalsPerSide * attackB * defenseA;

    const h2h = headToHead(nameA, nameB);
    let h2hWeight = 0;
    if (h2h.count > 0) {
      h2hWeight = Math.min(h2h.count / 10, 0.5); // jusqu'a 50% de poids a partir de 10 confrontations
      lambdaA = (1 - h2hWeight) * lambdaA + h2hWeight * h2h.avgGoalsA;
      lambdaB = (1 - h2hWeight) * lambdaB + h2hWeight * h2h.avgGoalsB;
    }

    lambdaA = Math.max(lambdaA, 0.15);
    lambdaB = Math.max(lambdaB, 0.15);

    // Matrice de Poisson independante pour les scores exacts.
    const pmfA = [], pmfB = [];
    for (let i = 0; i <= MAX_GOALS; i++) {
      pmfA.push(poissonPmf(i, lambdaA));
      pmfB.push(poissonPmf(i, lambdaB));
    }

    let winA = 0, draw = 0, winB = 0;
    const totalDist = new Array(2 * MAX_GOALS + 1).fill(0);
    for (let a = 0; a <= MAX_GOALS; a++) {
      for (let b = 0; b <= MAX_GOALS; b++) {
        const p = pmfA[a] * pmfB[b];
        if (a > b) winA += p;
        else if (a === b) draw += p;
        else winB += p;
        totalDist[a + b] += p;
      }
    }

    function overUnder(line) {
      const threshold = Math.floor(line) + 1; // ex: 2.5 -> total >= 3 est "plus de"
      let over = 0;
      for (let t = threshold; t < totalDist.length; t++) over += totalDist[t];
      return { over, under: 1 - over };
    }

    const ftMarkets = {};
    [2.5, 3.5, 4.5, 5.5, 6.5].forEach(line => { ftMarkets[line] = overUnder(line); });

    const muHT = (lambdaA + lambdaB) * HT_GOAL_RATIO;
    const htMarkets = {};
    [0.5, 1.5, 2.5, 3.5].forEach(line => {
      const threshold = Math.floor(line) + 1;
      const over = 1 - poissonCdf(threshold - 1, muHT);
      htMarkets[line] = { over, under: 1 - over };
    });

    return {
      nameA, nameB,
      lambdaA, lambdaB,
      expectedTotal: lambdaA + lambdaB,
      expectedHtTotal: muHT,
      h2h, h2hWeight,
      attackA, defenseA, attackB, defenseB,
      winA, draw, winB,
      ftMarkets, htMarkets
    };
  }

  // ---------- Value betting ----------

  function impliedProb(decimalOdds) {
    if (!decimalOdds || decimalOdds <= 1) return null;
    return 1 / decimalOdds;
  }

  function evaluateValue(modelProb, decimalOdds) {
    const implied = impliedProb(decimalOdds);
    if (implied === null) return null;
    const edge = modelProb - implied; // >0 => la cote paie plus que ce que le modele estime probable
    let verdict = 'neutre';
    if (edge >= 0.05) verdict = 'value';
    else if (edge <= -0.05) verdict = 'evite';
    return { implied, edge, verdict };
  }

  global.BXR_ENGINE = {
    listPlayers, getPlayer, derived, leagueAverages,
    headToHead, buildMatchModel,
    poissonPmf, poissonCdf,
    impliedProb, evaluateValue,
    addMatches, getAllMatches,
    HT_GOAL_RATIO
  };
})(window);
