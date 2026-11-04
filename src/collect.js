// Sentinelle BRVM : collecteur autonome.
// Récupère les cours (API de Sika Finance, bulletin officiel BRVM en secours), les actualités,
// calcule les signaux du robot et envoie les alertes Telegram. Aucune IA, aucun service payant.
//
// Usage : node src/collect.js            (collecte normale)
//         node src/collect.js --full     (re-télécharge 3 ans d'historique pour toutes les valeurs)
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as cheerio from 'cheerio';
import {ALL, SYMBOLS, NAMES, SECTOR_OF, DEC, isoDay, dayT, fmt, pct, fcfa, nf0, tick,
  analyseTicker, makePlan, DEFAULT_PARAMS} from '../docs/engine.js';
import {scoreNews} from './news-rules.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'docs', 'data');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const API = 'https://www.sikafinance.com/api/general/GetHistos';
const BRVM_URL = 'https://www.brvm.org/fr/cours-actions/0';
const NEWS_URL = 'https://www.sikafinance.com/marches/actualites_bourse_brvm';
const FULL = process.argv.includes('--full');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- Fichiers ---------- */
async function readJSON(file, def) {
  try { return JSON.parse(await fs.readFile(path.join(DATA, file), 'utf8')); } catch { return def; }
}
async function writeJSON(file, obj) {
  const p = path.join(DATA, file);
  await fs.mkdir(path.dirname(p), {recursive: true});
  await fs.writeFile(p, JSON.stringify(obj));
}

/* ---------- Réseau ---------- */
async function getText(url) {
  const r = await fetch(url, {headers: {'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9'}, signal: AbortSignal.timeout(30000)});
  if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
  return r.text();
}
const num = x => {
  if (x == null) return null;
  if (typeof x === 'number') return isFinite(x) ? x : null;
  let s = String(x).trim().replace(/[\s  ]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const v = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return isFinite(v) ? v : null;
};
function toIsoDate(s) {
  if (!s) return null;
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
// Historique journalier d'une valeur sur une fenêtre de 89 jours au plus (limite de l'API).
async function histos(sym, from, to) {
  const r = await fetch(API, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'User-Agent': UA, 'Origin': 'https://www.sikafinance.com',
      'Referer': `https://www.sikafinance.com/marches/historiques/${sym}`},
    body: JSON.stringify({ticker: sym, datedeb: from, datefin: to, xperiod: '0'}),
    signal: AbortSignal.timeout(30000)
  });
  if (!r.ok) throw new Error(`API Sika ${sym} : HTTP ${r.status}`);
  const j = await r.json();
  const lst = Array.isArray(j.lst) ? j.lst : [];
  return lst.map(x => [toIsoDate(x.Date), num(x.Open), num(x.High), num(x.Low), num(x.Close), num(x.Volume)])
    .filter(r => r[0] && r[4] > 0);
}
const addDays = (iso, d) => isoDay(dayT(iso) + d * 864e5);
function mergeRows(oldRows, newRows) {
  const m = new Map((oldRows || []).map(r => [r[0], r]));
  for (const r of newRows) m.set(r[0], r);   // la donnée la plus récente fait foi (barre du jour mise à jour)
  return [...m.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-800);
}

/* ---------- Bulletin officiel BRVM (secours) ---------- */
async function brvmBulletin() {
  const $ = cheerio.load(await getText(BRVM_URL));
  let out = null;
  $('table').each((_, tb) => {
    if (out) return;
    const heads = $(tb).find('th').map((i, th) => $(th).text().replace(/\s+/g, ' ').trim().toLowerCase()).get();
    const col = re => heads.findIndex(h => re.test(h));
    const iS = col(/symbole|symbol/), iC = col(/cl[oô]ture|closing/), iV = col(/variation/), iVol = col(/volume/), iP = col(/veille|previous/), iO = col(/ouverture|opening/);
    if (iS < 0 || iC < 0) return;
    out = {};
    $(tb).find('tbody tr').each((_, tr) => {
      const td = $(tr).find('td').map((i, x) => $(x).text().trim()).get();
      const t = (td[iS] || '').toUpperCase();
      if (!SYMBOLS[t]) return;
      out[t] = {c: num(td[iC]), var: iV >= 0 ? num(td[iV]) : null, v: iVol >= 0 ? num(td[iVol]) : null, pc: iP >= 0 ? num(td[iP]) : null, o: iO >= 0 ? num(td[iO]) : null};
    });
  });
  if (!out || !Object.keys(out).length) throw new Error('tableau des cours introuvable sur brvm.org');
  const txt = $('body').text();
  const dm = txt.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return {rows: out, date: dm ? toIsoDate(dm[0]) : null};
}

/* ---------- Actualités ---------- */
async function fetchNews() {
  const $ = cheerio.load(await getText(NEWS_URL));
  const found = new Map();
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(/\/marches\/([a-z0-9-]+)_(\d+)\/?$/i);
    if (!m) return;
    const title = $(a).text().replace(/\s+/g, ' ').trim();
    if (title.length < 25) return;
    const ctx = $(a).closest('li,article,tr,.row,div').first().text().replace(/\s+/g, ' ');
    const dm = ctx.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\D{1,4}(\d{2})[:hH](\d{2}))?/);
    const date = dm ? `${dm[3]}-${dm[2]}-${dm[1]}T${dm[4] || '00'}:${dm[5] || '00'}` : null;
    const id = m[2];
    const url = href.startsWith('http') ? href : 'https://www.sikafinance.com' + (href.startsWith('/') ? '' : '/') + href;
    const prev = found.get(id);
    if (!prev || title.length > prev.title.length) found.set(id, {id, title, url, date: date || prev?.date || null});
  });
  return [...found.values()];
}

/* ---------- Telegram ---------- */
async function telegram(text) {
  const token = process.env.TELEGRAM_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true})
  });
  if (!r.ok) throw new Error('Telegram : HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return true;
}
const h = s => String(s).replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]));

/* ---------- Programme principal ---------- */
async function main() {
  const now = new Date();
  const today = isoDay(now.getTime());
  const hm = now.getUTCHours() * 60 + now.getUTCMinutes();     // Abidjan = UTC
  const weekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
  const sessionOpen = weekday && hm >= 9 * 60 && hm < 15 * 60 + 35;
  const closingRun = weekday && hm >= 16 * 60;

  const config = await readJSON('config.json', {watchlist: ['SIBC', 'SHEC', 'BOAC', 'BOAS', 'SNTS', 'ORAC', 'SGBC', 'NSBC'], alertMovePct: 4, backfillYears: 3});
  const quotes = await readJSON('quotes.json', {});
  const prevSignals = await readJSON('signals.json', {});
  let news = await readJSON('news.json', []);
  const status = await readJSON('status.json', {});
  const errors = [];
  const stat = {api: 0, rows: 0, backfilled: 0};

  // 1. Cours et historique depuis l'API de Sika Finance
  const years = config.backfillYears || 3;
  for (const t of ALL) {
    const sym = SYMBOLS[t];
    const file = `history/${t}.json`;
    const doc = await readJSON(file, {t, rows: []});
    let rows = doc.rows || [];
    try {
      let fresh = [];
      if (FULL || rows.length < 200) {
        // Rattrapage : fenêtres de 89 jours en remontant le temps
        let to = today, empty = 0;
        for (let k = 0; k < Math.ceil(years * 365 / 89); k++) {
          const from = addDays(to, -88);
          const part = await histos(sym, from, to);
          fresh.push(...part);
          empty = part.length ? 0 : empty + 1;
          if (empty >= 2) break;                    // avant l'introduction en bourse
          to = addDays(from, -1);
          await sleep(250);
        }
        if (fresh.length) stat.backfilled++;
      } else {
        fresh = await histos(sym, addDays(today, -20), today);
      }
      stat.api++;
      const before = rows.length;
      rows = mergeRows(rows, fresh);
      stat.rows += Math.max(0, rows.length - before);
      await writeJSON(file, {t, rows, updated: now.toISOString(), src: 'sikafinance-api'});
      const last = rows[rows.length - 1], prev = rows[rows.length - 2];
      if (last) {
        const isToday = last[0] === today;
        quotes[t] = {...(quotes[t] || {}), t, n: NAMES[t], c: last[4], o: last[1], h: last[2], l: last[3], v: last[5],
          pc: prev ? prev[4] : null, var: prev ? +((last[4] / prev[4] - 1) * 100).toFixed(2) : 0,
          val: last[5] != null ? Math.round(last[4] * last[5]) : null,
          asOf: isToday && sessionOpen ? now.toISOString() : last[0], intraday: isToday && sessionOpen, src: 'sikafinance-api'};
      }
    } catch (e) {
      errors.push(`${t} : ${e.message}`);
    }
    await sleep(150);
  }

  // 2. Secours : bulletin officiel si l'API a échoué pour une partie des valeurs
  if (errors.length > ALL.length / 3) {
    try {
      const b = await brvmBulletin();
      for (const [t, r] of Object.entries(b.rows)) {
        if (!(r.c > 0)) continue;
        quotes[t] = {...(quotes[t] || {}), t, n: NAMES[t], c: r.c, var: r.var, pc: r.pc, o: r.o, v: r.v,
          val: r.v != null ? Math.round(r.c * r.v) : null, asOf: b.date || today, intraday: false, src: 'brvm.org'};
        if (b.date) {
          const doc = await readJSON(`history/${t}.json`, {t, rows: []});
          if (!doc.rows.some(x => x[0] === b.date)) {
            doc.rows = mergeRows(doc.rows, [[b.date, r.o, null, null, r.c, r.v]]);
            await writeJSON(`history/${t}.json`, {...doc, updated: now.toISOString()});
          }
        }
      }
      errors.push(`Secours : bulletin BRVM utilisé (${Object.keys(b.rows).length} valeurs)`);
    } catch (e) { errors.push('Bulletin BRVM : ' + e.message); }
  }
  await writeJSON('quotes.json', quotes);

  // 3. Actualités
  const fresh = [];
  try {
    const known = new Set(news.map(n => n.id));
    for (const n of await fetchNews()) {
      if (known.has(n.id)) continue;
      const s = scoreNews(n.title);
      const item = {id: n.id, date: n.date || now.toISOString().slice(0, 16), title: n.title, url: n.url, ...s, src: 'sikafinance'};
      news.push(item); fresh.push(item);
    }
    news = news.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 300);
    await writeJSON('news.json', news);
  } catch (e) { errors.push('Actualités : ' + e.message); }

  // 4. Signaux du robot (paramètres par défaut, profil investisseur)
  const signals = {};
  for (const t of ALL) {
    const doc = await readJSON(`history/${t}.json`, {rows: []});
    const a = analyseTicker(t, doc.rows, quotes[t], news, 'invest');
    if (a.short) { signals[t] = {n: a.n, short: true}; continue; }
    const pl = makePlan(a.I, a.ev, DEFAULT_PARAMS);
    signals[t] = {n: a.n, comp: a.ev.comp, key: a.ev.key, rsi: +a.ev.r.toFixed(1), news: +a.newsImp.toFixed(1),
      illiquid: !!a.ev.flags.illiquid, limitUp: !!a.ev.flags.limitUp, limitDown: !!a.ev.flags.limitDown,
      entry: pl.entry, stop: pl.stop, t1: pl.t1, t2: pl.t2, top: a.ev.models.slice().sort((x, y) => y.score * y.w - x.score * x.w)[0].text};
  }
  await writeJSON('signals.json', {at: now.toISOString(), params: 'investisseur', s: signals});

  // 5. Note de clôture automatique
  const qs = ALL.map(t => quotes[t]).filter(q => q && isFinite(q.var));
  if (closingRun || !(await readJSON('brief.json', null))) {
    const up = qs.filter(q => q.var > 0).length, dn = qs.filter(q => q.var < 0).length;
    const sorted = [...qs].sort((a, b) => b.var - a.var);
    const wl = config.watchlist || [];
    const lines = [
      `${up} valeurs en hausse, ${dn} en baisse, ${qs.length - up - dn} inchangées.`,
      `- Plus fortes hausses : ${sorted.slice(0, 3).map(q => `${q.t} ${pct(q.var / 100, 2)}`).join(', ')}.`,
      `- Plus fortes baisses : ${sorted.slice(-3).reverse().map(q => `${q.t} ${pct(q.var / 100, 2)}`).join(', ')}.`,
      ...wl.filter(t => signals[t] && !signals[t].short).map(t => `- ${t} : ${DEC[signals[t].key].w} (score ${signals[t].comp > 0 ? '+' : ''}${signals[t].comp}), cours ${fcfa(quotes[t]?.c)}, stop robot ${fcfa(signals[t].stop)}.`),
      ...fresh.filter(n => Math.abs(n.impact) >= 1).slice(0, 3).map(n => `- Actualité : ${n.title} (impact ${n.impact > 0 ? '+' : ''}${n.impact} sur ${n.tickers.join(', ')}).`)
    ];
    await writeJSON('brief.json', {at: now.toISOString(), title: `Note ${closingRun ? 'de clôture' : 'de séance'} du ${today.split('-').reverse().join('/')}`, text: lines.join('\n')});
  }

  // 6. Alertes
  const alerted = status.alerted && status.alerted.date === today ? status.alerted : {date: today, keys: []};
  const alerts = [];
  const once = (key, msg) => { if (!alerted.keys.includes(key)) { alerted.keys.push(key); alerts.push(msg); } };
  const watch = new Set(config.watchlist || []);
  for (const t of watch) {
    const q = quotes[t]; if (!q || q.asOf?.slice(0, 10) !== today) continue;
    if (Math.abs(q.var) >= (config.alertMovePct || 4)) once(`move:${t}`, `${q.var > 0 ? '📈' : '📉'} <b>${t}</b> ${pct(q.var / 100, 2)} à ${fcfa(q.c)} (${h(NAMES[t])})`);
  }
  for (const t of ALL) {
    const s = signals[t], p = prevSignals.s?.[t];
    if (!s || s.short || !p || p.short || p.key === s.key) continue;
    if (watch.has(t) || Math.abs(s.key) === 2)
      once(`sig:${t}:${s.key}`, `🤖 <b>${t}</b> passe de ${DEC[p.key].w} à <b>${DEC[s.key].w}</b> (score ${s.comp}). ${s.key >= 1 ? `Achat limite ${fcfa(s.entry)}, stop ${fcfa(s.stop)}, objectif ${fcfa(s.t1)}.` : ''}`);
  }
  for (const n of fresh) if (Math.abs(n.impact) >= 2 || n.tickers.some(t => watch.has(t)))
    once(`news:${n.id}`, `📰 ${h(n.title)} ${n.tickers.length ? `→ ${n.tickers.join(', ')} (impact ${n.impact > 0 ? '+' : ''}${n.impact})` : ''}\n${n.url}`);
  let sent = false;
  if (closingRun && !alerted.keys.includes('brief')) {
    const b = await readJSON('brief.json', null);
    if (b) { alerted.keys.push('brief'); alerts.push(`🔔 <b>${h(b.title)}</b>\n${h(b.text)}`); }
  }
  if (alerts.length) {
    try { sent = await telegram(alerts.join('\n\n').slice(0, 3900)); } catch (e) { errors.push(e.message); }
  }

  // 7. État
  await writeJSON('status.json', {lastRun: now.toISOString(), runType: closingRun ? 'clôture' : sessionOpen ? 'séance' : 'hors séance',
    sessionDate: today, note: `${stat.api} valeurs mises à jour par l'API, ${stat.rows} nouvelles séances en historique, ${stat.backfilled} historiques complétés, ${fresh.length} nouvelles actualités${alerts.length ? `, ${alerts.length} alerte(s)${sent ? ' envoyée(s) sur Telegram' : ''}` : ''}.`,
    errors: errors.slice(0, 30), alerted});
  console.log(`Terminé : ${stat.api}/${ALL.length} valeurs, ${stat.rows} séances ajoutées, ${fresh.length} actualités, ${alerts.length} alertes.`);
  if (errors.length) console.log('Points à vérifier :\n- ' + errors.join('\n- '));
  if (stat.api === 0 && errors.length) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exit(1); });
