(function () {
  'use strict';

  const E = window.BXR_ENGINE;

  const fmtPct = (x, d = 1) => (x * 100).toFixed(d) + '%';
  const fmtNum = (x, d = 2) => x.toFixed(d);
  const fmtCurrency = (x) => x.toFixed(2) + ' €';
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VERDICT_WORDS = { value: 'Bon pari', evite: 'À éviter', neutre: 'Neutre' };
  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  // ============================================================
  // Matchs importés (CSV) — persistance locale, superposée aux données de base
  // ============================================================

  const STORAGE_IMPORTED = 'bxr_imported_matches_v1';

  function loadImportedMatches() {
    try {
      const raw = localStorage.getItem(STORAGE_IMPORTED);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore corrupted storage */ }
    return [];
  }

  let importedMatches = loadImportedMatches();
  if (importedMatches.length) E.addMatches(importedMatches);
  const saveImported = () => localStorage.setItem(STORAGE_IMPORTED, JSON.stringify(importedMatches));

  // ============================================================
  // Onglets
  // ============================================================

  document.querySelectorAll('nav.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('nav.tabs button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('view-' + btn.dataset.view).classList.add('active');
    });
  });

  // ============================================================
  // Classement
  // ============================================================

  function getRankingRows() {
    return E.listPlayers().map(p => {
      const d = E.derived(p);
      return {
        name: p.name, mj: p.mj, w: p.w, d: p.d, l: p.l,
        gf: p.gf, ga: p.ga, diff: p.diff, pts: p.pts, winPct: p.winPct,
        avgGF: d.avgGF, avgGA: d.avgGA, avgTotal: d.avgTotal
      };
    });
  }

  let rankSort = { key: 'pts', dir: 'desc' };
  let rankFilter = '';

  function renderRanking() {
    const rankingRows = getRankingRows();
    let rows = rankingRows.filter(r => r.name.toLowerCase().includes(rankFilter.toLowerCase()));
    rows.sort((a, b) => {
      const va = a[rankSort.key], vb = b[rankSort.key];
      let cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return rankSort.dir === 'asc' ? cmp : -cmp;
    });

    const maxWinPct = Math.max(...rankingRows.map(r => r.winPct));
    const body = document.getElementById('ranking-body');
    body.innerHTML = rows.map((r, i) => `
      <tr>
        <td><span class="rank-cell"><span class="rank-num">${i + 1}</span>${esc(r.name)}</span></td>
        <td>${r.mj}</td>
        <td>${r.w}</td>
        <td>${r.d}</td>
        <td>${r.l}</td>
        <td>${r.winPct.toFixed(1)}%<span class="mini-bar"><span style="width:${(r.winPct / maxWinPct * 100).toFixed(0)}%"></span></span></td>
        <td>${r.gf}</td>
        <td>${r.ga}</td>
        <td>${r.diff > 0 ? '+' : ''}${r.diff}</td>
        <td>${r.pts}</td>
        <td>${fmtNum(r.avgGF)}</td>
        <td>${fmtNum(r.avgGA)}</td>
        <td>${fmtNum(r.avgTotal)}</td>
      </tr>
    `).join('');

    document.querySelectorAll('#ranking-table th').forEach(th => {
      th.classList.toggle('sorted', th.dataset.key === rankSort.key);
    });
  }

  document.querySelectorAll('#ranking-table th').forEach(th => {
    th.addEventListener('click', () => {
      if (rankSort.key === th.dataset.key) {
        rankSort.dir = rankSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        rankSort = { key: th.dataset.key, dir: 'desc' };
      }
      renderRanking();
    });
  });

  document.getElementById('player-search').addEventListener('input', (e) => {
    rankFilter = e.target.value;
    renderRanking();
  });

  // ============================================================
  // Vue d'ensemble — KPI + graphiques (Classement)
  // ============================================================

  function renderDashboard() {
    const rows = getRankingRows();
    const league = E.leagueAverages();
    const eligible = rows.filter(r => r.mj >= 10);
    const bestAttack = (eligible.length ? eligible : rows).reduce((a, b) => (b.avgGF > a.avgGF ? b : a), rows[0]);

    document.getElementById('kpi-grid').innerHTML = `
      <div class="kpi-tile">
        <div class="k">Joueurs actifs</div>
        <div class="v">${rows.length}</div>
      </div>
      <div class="kpi-tile">
        <div class="k">Matchs enregistrés</div>
        <div class="v">${E.getAllMatches().length}</div>
      </div>
      <div class="kpi-tile">
        <div class="k">Buts / match (ligue)</div>
        <div class="v">${fmtNum(league.avgGoalsPerSide * 2, 1)}</div>
      </div>
      <div class="kpi-tile">
        <div class="k">Meilleure attaque</div>
        <div class="v">${bestAttack ? fmtNum(bestAttack.avgGF) : '—'}</div>
        <div class="sub">${bestAttack ? esc(bestAttack.name) + ' — buts/match' : ''}</div>
      </div>
    `;

    const top10 = rows.slice().sort((a, b) => b.pts - a.pts).slice(0, 10);

    const maxPts = Math.max(...top10.map(r => r.pts), 1);
    document.getElementById('chart-points').innerHTML = top10.map(r => `
      <div class="hbar-row">
        <div class="hbar-label" title="${esc(r.name)}">${esc(r.name)}</div>
        <div class="hbar-track" title="${esc(r.name)} : ${r.pts} points">
          <div class="hbar-fill" style="width:${(r.pts / maxPts * 100).toFixed(1)}%"></div>
        </div>
        <div class="hbar-value">${r.pts}</div>
      </div>
    `).join('');

    document.getElementById('chart-ad-legend').innerHTML = `
      <span><span class="dot a"></span>Buts marqués / match</span>
      <span><span class="dot b"></span>Buts encaissés / match</span>
    `;
    const maxAD = Math.max(...top10.map(r => Math.max(r.avgGF, r.avgGA)), 1);
    document.getElementById('chart-attack-defense').innerHTML = top10.map(r => `
      <div class="hbar-row">
        <div class="hbar-label" title="${esc(r.name)}">${esc(r.name)}</div>
        <div class="hbar-dual-bars">
          <div class="hbar-dual-bar">
            <div class="hbar-track" title="${esc(r.name)} — buts marqués/match : ${fmtNum(r.avgGF)}">
              <div class="hbar-fill" style="width:${(r.avgGF / maxAD * 100).toFixed(1)}%"></div>
            </div>
            <div class="hbar-value">${fmtNum(r.avgGF)}</div>
          </div>
          <div class="hbar-dual-bar">
            <div class="hbar-track" title="${esc(r.name)} — buts encaissés/match : ${fmtNum(r.avgGA)}">
              <div class="hbar-fill b" style="width:${(r.avgGA / maxAD * 100).toFixed(1)}%"></div>
            </div>
            <div class="hbar-value">${fmtNum(r.avgGA)}</div>
          </div>
        </div>
      </div>
    `).join('');
  }

  renderRanking();
  renderDashboard();

  // ============================================================
  // Import de matchs (CSV) — fait évoluer la base au fil du temps
  // ============================================================

  function parseMatchesCsv(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let start = 0;
    if (lines.length && /^domicile[,;]/i.test(lines[0])) start = 1;

    const matches = [];
    const errors = [];
    for (let i = start; i < lines.length; i++) {
      const raw = lines[i];
      const parts = raw.split(',').map(s => s.trim());
      if (parts.length < 4) { errors.push(`Ligne ${i + 1} ignorée (colonnes manquantes) : "${raw}"`); continue; }

      const [p1, s1raw, s2raw, p2, winnerRaw] = parts;
      const s1 = parseInt(s1raw, 10), s2 = parseInt(s2raw, 10);
      if (!p1 || !p2) { errors.push(`Ligne ${i + 1} ignorée (nom de joueur manquant) : "${raw}"`); continue; }
      if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) { errors.push(`Ligne ${i + 1} ignorée (score invalide) : "${raw}"`); continue; }

      let winner = (winnerRaw || '').trim();
      if (!winner) winner = s1 === s2 ? 'Draw' : (s1 > s2 ? p1 : p2);
      if (winner !== 'Draw' && winner !== p1 && winner !== p2) {
        errors.push(`Ligne ${i + 1} ignorée (le vainqueur "${winner}" ne correspond ni à "${p1}" ni à "${p2}") : "${raw}"`);
        continue;
      }
      matches.push({ p1, s1, s2, p2, winner });
    }
    return { matches, errors };
  }

  function showImportStatus(msg, isError) {
    const el = document.getElementById('import-status');
    el.textContent = msg;
    el.className = 'import-status ' + (isError ? 'error' : 'success');
  }

  function renderImportErrors(errors) {
    document.getElementById('import-errors').innerHTML = errors.map(e => esc(e)).join('<br>');
  }

  function renderImportMeta() {
    const el = document.getElementById('import-meta');
    if (importedMatches.length === 0) { el.innerHTML = ''; return; }
    const baseCount = (window.BXR_DATA && window.BXR_DATA.matches) ? window.BXR_DATA.matches.length : 0;
    el.innerHTML = `
      <span>${baseCount} matchs de base + <b>${importedMatches.length}</b> importé${importedMatches.length > 1 ? 's' : ''} = <b>${baseCount + importedMatches.length}</b> au total</span>
      <button type="button" class="link-btn" id="export-imported-btn">Exporter mes matchs importés</button>
      <button type="button" class="link-btn" id="reset-imported-btn">Réinitialiser les imports</button>
    `;
    document.getElementById('export-imported-btn').addEventListener('click', exportImported);
    document.getElementById('reset-imported-btn').addEventListener('click', resetImported);
  }

  function exportImported() {
    const header = 'Domicile,Score_Domicile,Score_Exterieur,Exterieur,Vainqueur';
    const lines = importedMatches.map(m => `${m.p1},${m.s1},${m.s2},${m.p2},${m.winner}`);
    const blob = new Blob([[header].concat(lines).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bxr_vision_matchs_importes.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function resetImported() {
    if (!window.confirm('Retirer tous les matchs importés et revenir aux données de base ? Cette action ne peut pas être annulée.')) return;
    localStorage.removeItem(STORAGE_IMPORTED);
    location.reload();
  }

  function handleImportResult(matches, errors, fileName) {
    renderImportErrors(errors);

    if (matches.length === 0) {
      showImportStatus(`Aucun match valide trouvé dans "${fileName}".`, true);
      return;
    }

    importedMatches = importedMatches.concat(matches);
    saveImported();
    E.addMatches(matches);

    refreshPlayerSelects();
    renderRanking();
    renderDashboard();
    refreshCurrentPronostic();
    renderImportMeta();

    const skippedMsg = errors.length ? ` (${errors.length} ligne${errors.length > 1 ? 's' : ''} ignorée${errors.length > 1 ? 's' : ''}, voir détail ci-dessous)` : '';
    showImportStatus(`${matches.length} match${matches.length > 1 ? 's' : ''} importé${matches.length > 1 ? 's' : ''} depuis "${fileName}"${skippedMsg}.`, false);
  }

  document.getElementById('csv-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { matches, errors } = parseMatchesCsv(String(reader.result));
      handleImportResult(matches, errors, file.name);
    };
    reader.onerror = () => showImportStatus('Impossible de lire ce fichier.', true);
    reader.readAsText(file);
    e.target.value = '';
  });

  renderImportMeta();

  // ============================================================
  // Portefeuille — persistance locale (solde + paris)
  // ============================================================

  const STORAGE_WALLET = 'bxr_wallet_v1';
  const STORAGE_BETS = 'bxr_bets_v1';

  function loadWallet() {
    try {
      const raw = localStorage.getItem(STORAGE_WALLET);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.balance === 'number' && !isNaN(parsed.balance)) return parsed;
      }
    } catch (e) { /* ignore corrupted storage */ }
    return { balance: 100 };
  }

  function loadBets() {
    try {
      const raw = localStorage.getItem(STORAGE_BETS);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore corrupted storage */ }
    return [];
  }

  let wallet = loadWallet();
  let bets = loadBets();

  const saveWallet = () => localStorage.setItem(STORAGE_WALLET, JSON.stringify(wallet));
  const saveBets = () => localStorage.setItem(STORAGE_BETS, JSON.stringify(bets));

  function renderWalletBadge() {
    document.getElementById('wallet-amount').textContent = fmtCurrency(wallet.balance);
  }

  function openWalletModal() {
    document.getElementById('wallet-input').value = wallet.balance.toFixed(2);
    document.getElementById('wallet-modal').classList.add('active');
    document.getElementById('wallet-input').focus();
  }
  function closeWalletModal() {
    document.getElementById('wallet-modal').classList.remove('active');
  }

  document.getElementById('wallet-badge').addEventListener('click', openWalletModal);
  document.getElementById('edit-balance-btn').addEventListener('click', openWalletModal);
  document.getElementById('wallet-modal-close').addEventListener('click', closeWalletModal);
  document.getElementById('wallet-modal').addEventListener('click', (e) => {
    if (e.target.id === 'wallet-modal') closeWalletModal();
  });
  document.getElementById('wallet-save-btn').addEventListener('click', () => {
    const val = parseFloat(document.getElementById('wallet-input').value);
    if (!isNaN(val) && val >= 0) {
      wallet.balance = val;
      onWalletChanged();
      closeWalletModal();
    }
  });
  document.getElementById('wallet-reset-btn').addEventListener('click', () => {
    wallet.balance = 100;
    onWalletChanged();
    closeWalletModal();
  });

  function onWalletChanged() {
    saveWallet();
    renderWalletBadge();
    renderPortefeuille();
    updateSlipTotals();
  }

  // ============================================================
  // Portefeuille — rendu (paris en cours / historique)
  // ============================================================

  function renderPortefeuille() {
    const pending = bets.filter(b => b.status === 'pending');
    const settled = bets.filter(b => b.status !== 'pending');

    document.getElementById('pf-balance').textContent = fmtCurrency(wallet.balance);
    document.getElementById('pf-pending-count').textContent = pending.length;
    document.getElementById('pf-pending-stake').textContent = fmtCurrency(pending.reduce((s, b) => s + b.stake, 0));

    const profit = settled.reduce((s, b) => s + (b.status === 'won' ? (b.payout - b.stake) : -b.stake), 0);
    const profitEl = document.getElementById('pf-profit');
    profitEl.textContent = (profit >= 0 ? '+' : '') + fmtCurrency(profit);
    profitEl.className = 'v' + (profit > 0 ? ' good' : (profit < 0 ? ' critical' : ''));

    const pendingList = document.getElementById('pending-bets-list');
    if (pending.length === 0) {
      pendingList.innerHTML = '<div class="empty-state">Aucun pari en cours pour l\'instant.</div>';
    } else {
      const groups = new Map();
      pending.forEach(b => {
        const key = b.nameA + '|||' + b.nameB;
        if (!groups.has(key)) groups.set(key, { nameA: b.nameA, nameB: b.nameB, bets: [] });
        groups.get(key).bets.push(b);
      });

      pendingList.innerHTML = Array.from(groups.values()).map(g => {
        const hasFtBets = g.bets.some(b => b.scopeLabel === 'Match complet');
        return `
        <div class="match-group">
          <div class="match-group-head">${esc(g.nameA)} vs ${esc(g.nameB)}</div>
          <div class="match-group-bets">
            ${g.bets.map(b => `
              <div class="bet-card">
                <div class="bet-card-info">
                  <div class="bet-card-match">${esc(b.scopeLabel)}</div>
                  <div class="bet-card-sel">${esc(b.sideLabel)} ${esc(b.line)} buts</div>
                  <div class="bet-card-meta">Cote ${b.odds} · Mise ${fmtCurrency(b.stake)} · Gain potentiel ${fmtCurrency(b.payout)}</div>
                </div>
                <div class="bet-card-actions">
                  <button class="bet-btn won" data-id="${b.id}" data-action="won">Gagné</button>
                  <button class="bet-btn lost" data-id="${b.id}" data-action="lost">Perdu</button>
                  <button class="bet-btn cancel" data-id="${b.id}" data-action="cancel">Annuler</button>
                </div>
              </div>
            `).join('')}
          </div>
          ${hasFtBets ? `
          <div class="score-form" data-name-a="${esc(g.nameA)}" data-name-b="${esc(g.nameB)}">
            <label>${esc(g.nameA)}</label>
            <input type="number" min="0" class="score-input" data-side="a" placeholder="0">
            <span class="vs">—</span>
            <input type="number" min="0" class="score-input" data-side="b" placeholder="0">
            <label>${esc(g.nameB)}</label>
            <button type="button" class="resolve-score-btn">Valider le résultat</button>
            <span class="note">Règle automatiquement les paris "Match complet" ci-dessus d'après ce score, et ajoute ce match à l'historique (les stats en tiendront compte). Les paris "1ère mi-temps" se règlent avec les boutons Gagné/Perdu, le score mi-temps n'étant pas demandé ici.</span>
          </div>` : ''}
        </div>
      `;
      }).join('');
    }

    const settledList = document.getElementById('settled-bets-list');
    settledList.innerHTML = settled.length ? settled.slice().reverse().map(b => {
      const won = b.status === 'won';
      const profitVal = won ? (b.payout - b.stake) : -b.stake;
      return `
      <div class="bet-card">
        <div class="bet-card-info">
          <div class="bet-card-match">${esc(b.nameA)} vs ${esc(b.nameB)} — ${esc(b.scopeLabel)}</div>
          <div class="bet-card-sel">${esc(b.sideLabel)} ${esc(b.line)} buts</div>
          <div class="bet-card-meta">Cote ${b.odds} · Mise ${fmtCurrency(b.stake)}</div>
        </div>
        <div class="bet-card-actions">
          <span class="bet-status ${b.status}">${won ? 'Gagné' : 'Perdu'}</span>
          <span style="font-weight:700; color:${won ? 'var(--good)' : 'var(--critical)'}">${profitVal >= 0 ? '+' : ''}${fmtCurrency(profitVal)}</span>
        </div>
      </div>`;
    }).join('') : '<div class="empty-state">Aucun pari réglé pour l\'instant.</div>';
  }

  function resolveMatchByScore(nameA, nameB, sA, sB) {
    const total = sA + sB;
    const winner = sA === sB ? 'Draw' : (sA > sB ? nameA : nameB);

    bets.forEach(b => {
      if (b.status !== 'pending' || b.nameA !== nameA || b.nameB !== nameB) return;
      if (b.scopeLabel !== 'Match complet') return; // le score mi-temps n'est pas saisi ici
      const line = parseFloat(b.line);
      const over = total > line;
      const won = (b.sideLabel === 'Plus de' && over) || (b.sideLabel === 'Moins de' && !over);
      markBetResolved(b, won);
    });
    saveBets();

    // Ajoute ce match à l'historique, comme un import CSV : les stats en tiennent compte immédiatement.
    const newMatch = { p1: nameA, s1: sA, s2: sB, p2: nameB, winner };
    importedMatches = importedMatches.concat([newMatch]);
    saveImported();
    E.addMatches([newMatch]);
    refreshPlayerSelects();
    renderRanking();
    renderDashboard();
    refreshCurrentPronostic();
    renderImportMeta();

    onWalletChanged();
  }

  function markBetResolved(bet, won) {
    bet.status = won ? 'won' : 'lost';
    bet.resolvedAt = Date.now();
    if (won) wallet.balance += bet.payout;
  }

  document.getElementById('pending-bets-list').addEventListener('click', (e) => {
    const scoreBtn = e.target.closest('.resolve-score-btn');
    if (scoreBtn) {
      const form = scoreBtn.closest('.score-form');
      const inputs = form.querySelectorAll('.score-input');
      const sA = parseInt(inputs[0].value, 10), sB = parseInt(inputs[1].value, 10);
      if (isNaN(sA) || isNaN(sB) || sA < 0 || sB < 0) {
        window.alert('Entrez un score valide (0 ou plus) pour les deux joueurs.');
        return;
      }
      resolveMatchByScore(form.dataset.nameA, form.dataset.nameB, sA, sB);
      return;
    }

    const btn = e.target.closest('.bet-btn');
    if (!btn) return;
    const bet = bets.find(b => b.id === btn.dataset.id);
    if (!bet) return;
    if (btn.dataset.action === 'won') {
      markBetResolved(bet, true);
    } else if (btn.dataset.action === 'lost') {
      markBetResolved(bet, false);
    } else if (btn.dataset.action === 'cancel') {
      wallet.balance += bet.stake;
      bets = bets.filter(b => b.id !== bet.id);
    }
    saveBets();
    onWalletChanged();
  });

  renderWalletBadge();
  renderPortefeuille();

  // ============================================================
  // Pronostic — sélection des joueurs
  // ============================================================

  const players = E.listPlayers();
  const selP1 = document.getElementById('select-p1');
  const selP2 = document.getElementById('select-p2');
  const selLine1 = document.getElementById('select-line1');
  const selLine2 = document.getElementById('select-line2');
  const selLineHt1 = document.getElementById('select-line-ht1');
  const selLineHt2 = document.getElementById('select-line-ht2');
  const runAnalysisBtn = document.getElementById('run-analysis-btn');

  players.forEach(p => {
    selP1.add(new Option(p.name, p.name));
    selP2.add(new Option(p.name, p.name));
  });

  // Match d'exemple par défaut : les deux joueurs les mieux classés.
  const top2 = E.listPlayers().slice().sort((a, b) => b.pts - a.pts).slice(0, 2);
  selP1.value = top2[0] ? top2[0].name : players[0].name;
  selP2.value = top2[1] ? top2[1].name : players[1].name;

  document.getElementById('swap-players').addEventListener('click', () => {
    const a = selP1.value;
    selP1.value = selP2.value;
    selP2.value = a;
  });

  runAnalysisBtn.addEventListener('click', runAnalysis);

  function refreshPlayerSelects() {
    const names = E.listPlayers().map(p => p.name);
    [selP1, selP2].forEach(sel => {
      const current = sel.value;
      sel.innerHTML = '';
      names.forEach(n => sel.add(new Option(n, n)));
      if (names.includes(current)) sel.value = current;
    });
  }

  // ============================================================
  // Ticket de paris (slip) — état global, indépendant du match affiché
  // ============================================================

  let slip = []; // { id, nameA, nameB, scopeLabel, sideLabel, line, prob, odds, stake }
  let currentOptionMeta = {}; // id -> descriptor, pour les boutons actuellement affichés
  let currentModel = null; // modèle du match actuellement affiché, pour rafraîchir les "meilleurs pronostics"

  const slipId = (nameA, nameB, marketKey) => `${nameA}__${nameB}__${marketKey}`;

  function renderSlip() {
    document.getElementById('slip-count').textContent = `${slip.length} sélection${slip.length > 1 ? 's' : ''}`;
    document.getElementById('slip-count-badge').textContent = slip.length;

    const itemsEl = document.getElementById('slip-items');
    if (slip.length === 0) {
      itemsEl.innerHTML = `<div class="slip-empty">Cliquez sur "PLUS DE" ou "MOINS DE" dans un marché pour ajouter un pari ici.</div>`;
      document.getElementById('slip-footer').style.display = 'none';
      document.getElementById('slip-msg').textContent = '';
      return;
    }

    itemsEl.innerHTML = slip.map(item => `
      <div class="slip-item">
        <div class="slip-item-head">
          <div>
            <div class="slip-item-match">${esc(item.nameA)} vs ${esc(item.nameB)} — ${esc(item.scopeLabel)}</div>
            <div class="slip-item-sel">${esc(item.sideLabel)} ${esc(item.line)} buts</div>
          </div>
          <button type="button" class="slip-item-remove" data-id="${item.id}" title="Retirer du ticket">&times;</button>
        </div>
        <div class="slip-item-prob">Probabilité BXR VISION : ${fmtPct(item.prob)}</div>
        <div class="slip-item-row">
          <div class="fld">
            <label>Cote</label>
            <input type="number" step="0.01" min="1.01" class="slip-field" data-id="${item.id}" data-field="odds" value="${item.odds != null ? item.odds : ''}" placeholder="ex : 1.85">
          </div>
          <div class="fld">
            <label>Mise (€)</label>
            <input type="number" step="0.5" min="0" class="slip-field" data-id="${item.id}" data-field="stake" value="${item.stake != null ? item.stake : ''}" placeholder="ex : 5">
          </div>
        </div>
        <div class="slip-item-payout"><span>Gain potentiel</span><b id="payout-${item.id}">—</b></div>
        <div class="slip-item-verdict neutre" id="verdict-${item.id}" style="display:none;"></div>
      </div>
    `).join('');

    document.getElementById('slip-footer').style.display = 'block';
    slip.forEach(updateSlipItemComputed);
    updateSlipTotals();
  }

  function updateSlipItemComputed(item) {
    const payoutEl = document.getElementById('payout-' + item.id);
    const verdictEl = document.getElementById('verdict-' + item.id);
    if (!payoutEl || !verdictEl) return;

    payoutEl.textContent = (item.odds && item.stake) ? fmtCurrency(item.odds * item.stake) : '—';

    if (item.odds) {
      const val = E.evaluateValue(item.prob, item.odds);
      const edgePts = val.edge * 100;
      verdictEl.textContent = `${VERDICT_WORDS[val.verdict]} (${edgePts >= 0 ? '+' : ''}${edgePts.toFixed(1)}%)`;
      verdictEl.className = 'slip-item-verdict ' + val.verdict;
      verdictEl.style.display = 'block';
      verdictEl.title = `BXR VISION estime ce résultat à ${fmtPct(item.prob)}, la cote saisie sous-entend ${fmtPct(val.implied)}.`;
    } else {
      verdictEl.style.display = 'none';
    }
  }

  function updateSlipTotals() {
    const totalStake = slip.reduce((s, i) => s + (i.stake || 0), 0);
    const totalPayout = slip.reduce((s, i) => s + ((i.odds && i.stake) ? i.odds * i.stake : 0), 0);
    document.getElementById('slip-total-stake').textContent = fmtCurrency(totalStake);
    document.getElementById('slip-total-payout').textContent = fmtCurrency(totalPayout);

    const btn = document.getElementById('place-bet-btn');
    const msgEl = document.getElementById('slip-msg');
    const ready = slip.length > 0 && slip.every(i => i.odds && i.stake > 0);
    const funded = totalStake <= wallet.balance;
    btn.disabled = !ready || !funded;
    if (ready && !funded) {
      msgEl.textContent = `Solde insuffisant (il manque ${fmtCurrency(totalStake - wallet.balance)}).`;
      msgEl.className = 'slip-msg error';
    } else if (msgEl.classList.contains('error')) {
      msgEl.textContent = '';
      msgEl.className = 'slip-msg';
    }
  }

  function syncMarketSelectedClasses() {
    document.querySelectorAll('.market-opt').forEach(btn => {
      btn.classList.toggle('selected', slip.some(s => s.id === btn.dataset.id));
    });
  }

  function toggleSlipItem(id) {
    const idx = slip.findIndex(s => s.id === id);
    if (idx >= 0) {
      slip.splice(idx, 1);
    } else {
      const meta = currentOptionMeta[id];
      if (!meta) return;
      slip.push(Object.assign({ odds: null, stake: null }, meta));
    }
    syncMarketSelectedClasses();
    renderSlip();
    if (currentModel) renderFeaturedMarkets(currentModel);
    openSlipOnMobile();
  }

  function openSlipOnMobile() {
    if (window.innerWidth <= 980) document.getElementById('bet-slip').classList.add('open');
  }

  document.getElementById('slip-items').addEventListener('click', (e) => {
    const btn = e.target.closest('.slip-item-remove');
    if (!btn) return;
    slip = slip.filter(s => s.id !== btn.dataset.id);
    syncMarketSelectedClasses();
    renderSlip();
    if (currentModel) renderFeaturedMarkets(currentModel);
  });

  document.getElementById('slip-items').addEventListener('input', (e) => {
    const t = e.target;
    if (!t.classList.contains('slip-field')) return;
    const item = slip.find(s => s.id === t.dataset.id);
    if (!item) return;
    const val = parseFloat(t.value);
    item[t.dataset.field] = (t.value === '' || isNaN(val)) ? null : val;
    updateSlipItemComputed(item);
    updateSlipTotals();
    if (currentModel) renderFeaturedMarkets(currentModel);
  });

  document.getElementById('slip-handle').addEventListener('click', () => {
    document.getElementById('bet-slip').classList.toggle('open');
  });

  document.getElementById('place-bet-btn').addEventListener('click', () => {
    const msgEl = document.getElementById('slip-msg');
    const totalStake = slip.reduce((s, i) => s + (i.stake || 0), 0);

    if (!slip.every(i => i.odds && i.stake > 0)) {
      msgEl.textContent = 'Renseignez une cote et une mise pour chaque sélection.';
      msgEl.className = 'slip-msg error';
      return;
    }
    if (totalStake > wallet.balance) {
      msgEl.textContent = `Solde insuffisant (il manque ${fmtCurrency(totalStake - wallet.balance)}).`;
      msgEl.className = 'slip-msg error';
      return;
    }

    const now = Date.now();
    slip.forEach(item => {
      bets.push({
        id: item.id + '_' + now + '_' + Math.random().toString(36).slice(2, 7),
        nameA: item.nameA, nameB: item.nameB,
        scopeLabel: item.scopeLabel, sideLabel: item.sideLabel, line: item.line,
        prob: item.prob, odds: item.odds, stake: item.stake,
        payout: item.odds * item.stake,
        status: 'pending', placedAt: now
      });
    });
    wallet.balance -= totalStake;
    saveWallet();
    saveBets();

    slip = [];
    syncMarketSelectedClasses();
    renderSlip();
    renderWalletBadge();
    renderPortefeuille();

    msgEl.textContent = `Ticket validé, ${fmtCurrency(totalStake)} débités. Retrouvez vos paris dans "Portefeuille".`;
    msgEl.className = 'slip-msg success';
  });

  document.getElementById('copy-ticket-btn').addEventListener('click', (e) => {
    if (slip.length === 0) return;
    const lines = ['BXR VISION — Mon ticket', ''];
    slip.forEach(item => {
      lines.push(`${item.nameA} vs ${item.nameB}`);
      lines.push(`${item.scopeLabel} — ${item.sideLabel} ${item.line} buts (Prob. BXR : ${fmtPct(item.prob)})`);
      if (item.odds) lines.push(`Cote : ${item.odds}${item.stake ? ` · Mise : ${fmtCurrency(item.stake)} · Gain potentiel : ${fmtCurrency(item.odds * item.stake)}` : ''}`);
      lines.push('');
    });
    copyText(lines.join('\n').trim(), e.target);
  });

  function copyText(text, btn) {
    function done() {
      const original = btn.textContent;
      btn.textContent = 'Copié !';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, cb) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
    cb();
  }

  // ============================================================
  // Pronostic — rendu de l'analyse du match
  // ============================================================

  function playerCard(name, accentClass) {
    const p = E.getPlayer(name);
    const d = E.derived(p);
    const initials = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
    return `
      <div class="player-card">
        <div class="pname">
          <span class="avatar ${accentClass}">${initials}</span>
          ${esc(name)}
        </div>
        <div class="stat-row"><span class="k">Matchs joués</span><span class="v">${p.mj}</span></div>
        <div class="stat-row"><span class="k">Bilan V-N-D</span><span class="v">${p.w}-${p.d}-${p.l}</span></div>
        <div class="stat-row"><span class="k">% de victoires</span><span class="v">${p.winPct.toFixed(1)}%</span></div>
        <div class="stat-row"><span class="k">Buts marqués / match</span><span class="v">${fmtNum(d.avgGF)}</span></div>
        <div class="stat-row"><span class="k">Buts encaissés / match</span><span class="v">${fmtNum(d.avgGA)}</span></div>
        <div class="stat-row"><span class="k">Total buts / match</span><span class="v">${fmtNum(d.avgTotal)}</span></div>
        <div class="stat-row"><span class="k">Différence de buts</span><span class="v">${p.diff > 0 ? '+' : ''}${p.diff}</span></div>
        <div class="stat-row"><span class="k">Points (classement)</span><span class="v">${p.pts}</span></div>
      </div>
    `;
  }

  function renderH2H(model) {
    const h = model.h2h;
    const wrap = document.getElementById('h2h-summary');
    if (h.count === 0) {
      wrap.innerHTML = `<div class="h2h-pill">Aucune confrontation directe enregistrée entre ces deux joueurs — la prédiction repose uniquement sur leurs statistiques globales.</div>`;
    } else {
      wrap.innerHTML = `
        <div class="h2h-pill"><b>${h.count}</b> confrontation${h.count > 1 ? 's' : ''}</div>
        <div class="h2h-pill"><b>${h.winsA}</b> victoire${h.winsA > 1 ? 's' : ''} ${esc(model.nameA)} · <b>${h.draws}</b> nul${h.draws > 1 ? 's' : ''} · <b>${h.winsB}</b> victoire${h.winsB > 1 ? 's' : ''} ${esc(model.nameB)}</div>
        <div class="h2h-pill">Moyenne <b>${fmtNum(h.avgTotalGoals)}</b> buts/match en face-à-face</div>
        <div class="h2h-pill">Poids donné à l'historique dans le modèle : <b>${(model.h2hWeight * 100).toFixed(0)}%</b></div>
      `;
    }

    document.getElementById('h2h-th-a').textContent = model.nameA;
    document.getElementById('h2h-th-b').textContent = model.nameB;

    const body = document.getElementById('h2h-body');
    if (h.count === 0) {
      body.innerHTML = `<tr><td colspan="5" style="color:var(--text-muted); padding:16px;">—</td></tr>`;
    } else {
      body.innerHTML = h.meetings.map((m, i) => {
        let vClass = '', vName = 'Nul';
        if (m.winner === model.nameA) { vClass = 'winner-a'; vName = model.nameA; }
        else if (m.winner === model.nameB) { vClass = 'winner-b'; vName = model.nameB; }
        return `<tr>
          <td>${i + 1}</td>
          <td>${m.goalsA}</td>
          <td class="score">${m.goalsA} - ${m.goalsB}</td>
          <td>${m.goalsB}</td>
          <td class="${vClass}">${esc(vName)}</td>
        </tr>`;
      }).join('');
    }
  }

  function renderPrediction(model) {
    document.getElementById('expected-score').innerHTML = `
      Score le plus probable &nbsp;
      <span class="num" title="Nombre de buts que chaque joueur marquerait en moyenne dans ce match, selon le modèle">${fmtNum(model.lambdaA)} — ${fmtNum(model.lambdaB)}</span>
      &nbsp; <span style="color:var(--text-muted)">(soit ${fmtNum(model.expectedTotal)} buts au total en moyenne)</span>
    `;

    const wA = model.winA, wD = model.draw, wB = model.winB;
    const meter = document.getElementById('wdl-meter');
    meter.innerHTML = `
      <div class="seg a" style="width:${wA * 100}%">${wA > 0.1 ? fmtPct(wA, 0) : ''}</div>
      <div class="seg draw" style="width:${wD * 100}%">${wD > 0.1 ? fmtPct(wD, 0) : ''}</div>
      <div class="seg b" style="width:${wB * 100}%">${wB > 0.1 ? fmtPct(wB, 0) : ''}</div>
    `;
    document.getElementById('wdl-legend').innerHTML = `
      <span><span class="dot a"></span>${esc(model.nameA)} : <b>${fmtPct(wA)}</b></span>
      <span><span class="dot draw"></span>Nul : <b>${fmtPct(wD)}</b></span>
      <span><span class="dot b"></span>${esc(model.nameB)} : <b>${fmtPct(wB)}</b></span>
    `;
  }

  function marketOptHtml(id, label, prob) {
    const selected = slip.some(s => s.id === id);
    return `
      <button type="button" class="market-opt ${selected ? 'selected' : ''}" data-id="${id}">
        <div class="market-opt-head">
          <span>${label}</span>
          <span class="market-opt-check">${CHECK_SVG}</span>
        </div>
        <div class="market-opt-prob">${fmtPct(prob)}</div>
        <div class="prob-bar"><span style="width:${prob * 100}%"></span></div>
      </button>
    `;
  }

  function registerOption(model, marketKey, scopeLabel, sideLabel, line, prob) {
    const id = slipId(model.nameA, model.nameB, marketKey);
    currentOptionMeta[id] = { id, nameA: model.nameA, nameB: model.nameB, scopeLabel, sideLabel, line, prob };
    return id;
  }

  function renderMarkets(model) {
    currentOptionMeta = {};

    const ftLines = [2.5, 3.5, 4.5, 5.5, 6.5];
    document.getElementById('ft-markets').innerHTML = ftLines.map(line => {
      const over = model.ftMarkets[line].over;
      const idOver = registerOption(model, `ft-${line}-over`, 'Match complet', 'Plus de', line.toFixed(1), over);
      const idUnder = registerOption(model, `ft-${line}-under`, 'Match complet', 'Moins de', line.toFixed(1), 1 - over);
      return `
        <div class="market-row" data-market="ft-${line}">
          <div class="market-line">${line.toFixed(1)}</div>
          ${marketOptHtml(idOver, 'PLUS DE', over)}
          ${marketOptHtml(idUnder, 'MOINS DE', 1 - over)}
        </div>
      `;
    }).join('');

    const htLines = [0.5, 1.5, 2.5, 3.5];
    document.getElementById('ht-markets').innerHTML = htLines.map(line => {
      const over = model.htMarkets[line].over;
      const idOver = registerOption(model, `ht-${line}-over`, '1ère mi-temps', 'Plus de', line.toFixed(1), over);
      const idUnder = registerOption(model, `ht-${line}-under`, '1ère mi-temps', 'Moins de', line.toFixed(1), 1 - over);
      return `
        <div class="market-row" data-market="ht-${line}">
          <div class="market-line">${line.toFixed(1)}</div>
          ${marketOptHtml(idOver, 'PLUS DE', over)}
          ${marketOptHtml(idUnder, 'MOINS DE', 1 - over)}
        </div>
      `;
    }).join('');

    document.querySelectorAll('.market-opt').forEach(btn => {
      btn.addEventListener('click', () => toggleSlipItem(btn.dataset.id));
    });
  }

  // Affiche exactement les options que Napoleon Games propose pour ce match :
  // les 2 lignes "mi-temps" + les 2 lignes "match complet" choisies dans les sélecteurs.
  function renderFeaturedMarkets(model) {
    const lineHt1 = parseFloat(selLineHt1.value);
    const lineHt2 = parseFloat(selLineHt2.value);
    const htLines = lineHt1 === lineHt2 ? [lineHt1] : [lineHt1, lineHt2];
    const line1 = parseFloat(selLine1.value);
    const line2 = parseFloat(selLine2.value);
    const ftLines = line1 === line2 ? [line1] : [line1, line2];

    let html = '';

    htLines.forEach(lineHt => {
      const overHt = model.htMarkets[lineHt].over;
      const idHtOver = slipId(model.nameA, model.nameB, `ht-${lineHt}-over`);
      const idHtUnder = slipId(model.nameA, model.nameB, `ht-${lineHt}-under`);
      html += `
        <div class="market-row" data-market="ht-${lineHt}">
          <div class="market-line">MT ${lineHt.toFixed(1)}</div>
          ${marketOptHtml(idHtOver, 'PLUS DE', overHt)}
          ${marketOptHtml(idHtUnder, 'MOINS DE', 1 - overHt)}
        </div>
      `;
    });

    ftLines.forEach(line => {
      const over = model.ftMarkets[line].over;
      const idOver = slipId(model.nameA, model.nameB, `ft-${line}-over`);
      const idUnder = slipId(model.nameA, model.nameB, `ft-${line}-under`);
      html += `
        <div class="market-row" data-market="ft-${line}">
          <div class="market-line">${line.toFixed(1)}</div>
          ${marketOptHtml(idOver, 'PLUS DE', over)}
          ${marketOptHtml(idUnder, 'MOINS DE', 1 - over)}
        </div>
      `;
    });

    document.getElementById('top-picks').innerHTML = html;
    document.querySelectorAll('#top-picks .market-opt').forEach(btn => {
      btn.addEventListener('click', () => toggleSlipItem(btn.dataset.id));
    });
  }

  const ANALYSIS_DELAY_MS = 900;

  function computePronostic(nameA, nameB) {
    const model = E.buildMatchModel(nameA, nameB);
    currentModel = model;

    document.getElementById('compare-grid').innerHTML =
      playerCard(nameA, 'a') + playerCard(nameB, 'b');

    renderH2H(model);
    renderPrediction(model);
    renderMarkets(model);
    renderFeaturedMarkets(model);
    return model;
  }

  // Déclenchée par le bouton "Lancer l'analyse" : valide les paramètres, affiche
  // une animation de chargement, puis révèle tous les pronostics d'un coup.
  function runAnalysis() {
    const nameA = selP1.value, nameB = selP2.value;
    const hint = document.getElementById('run-analysis-hint');
    const empty = document.getElementById('pronostic-empty');
    const loading = document.getElementById('pronostic-loading');
    const results = document.getElementById('pronostic-results');

    if (!nameA || !nameB || nameA === nameB) {
      hint.textContent = nameA === nameB ? 'Choisissez deux joueurs différents.' : 'Choisissez deux joueurs.';
      hint.classList.add('error');
      return;
    }

    hint.textContent = '';
    hint.classList.remove('error');
    empty.style.display = 'none';
    results.classList.remove('active');
    loading.classList.add('active');
    runAnalysisBtn.disabled = true;

    window.setTimeout(() => {
      computePronostic(nameA, nameB);
      loading.classList.remove('active');
      results.classList.add('active');
      runAnalysisBtn.disabled = false;
    }, ANALYSIS_DELAY_MS);
  }

  // Après un import CSV ou un score saisi manuellement, rafraîchit l'analyse déjà
  // affichée avec les nouvelles stats, sans rejouer l'animation de chargement.
  function refreshCurrentPronostic() {
    if (!currentModel) return;
    const nameA = selP1.value, nameB = selP2.value;
    if (!nameA || !nameB || nameA === nameB) return;
    computePronostic(nameA, nameB);
  }

})();
