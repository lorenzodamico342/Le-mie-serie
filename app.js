import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const ST = { watching: 'In visione', paused: 'In pausa', todo: 'Da iniziare', done: 'Finita' };
const ORDER = { watching: 0, paused: 1, todo: 2, done: 3 };
const IMG = (p, w = 185) => (p ? `https://image.tmdb.org/t/p/w${w}${p}` : '');
const CACHE_KEY = 'serie-cache';
const FIELDS = ['tmdb_id', 'title', 'status', 'platform', 'seasons', 'season', 'episode', 'year', 'genre', 'plot', 'poster', 'ongoing', 'note'];

let shows = [];
let filter = 'all', q = '', editing = null, found = null, undoFn = null, user = null;
const timers = new Map();

/* ---------- utilità ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const total = (x) => x.seasons.reduce((a, b) => a + b, 0);
const seen = (x) => x.seasons.slice(0, x.season - 1).reduce((a, b) => a + b, 0) + x.episode;
const isEnd = (x) => x.seasons.length > 0 && x.season >= x.seasons.length && x.episode >= x.seasons[x.seasons.length - 1];
const pick = (x) => Object.fromEntries(FIELDS.map((k) => [k, x[k] ?? null]));
function next(x) {
  const cap = x.seasons[x.season - 1];
  if (cap && x.episode >= cap && x.season < x.seasons.length) return { season: x.season + 1, episode: 1 };
  return { season: x.season, episode: x.episode + 1 };
}
function normalize(x) {
  x.seasons = (x.seasons || []).map(Number).filter((n) => n > 0);
  x.season = Math.max(1, x.season || 1);
  x.episode = Math.max(0, x.episode || 0);
  if (isEnd(x)) x.status = 'done';
  return x;
}
function toast(msg, undo) {
  undoFn = undo || null;
  $('tmsg').textContent = msg;
  $('undo').hidden = !undo;
  $('toast').classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $('toast').classList.remove('show'), 5000);
}
const status = (t) => ($('save').textContent = t);
const cacheWrite = () => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(shows)); } catch {} };
const cacheRead = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || []; } catch { return []; } };

/* ---------- accesso ---------- */
async function showView(session) {
  user = session?.user || null;
  $('login').hidden = !!user;
  $('app').hidden = !user;
  $('logout').hidden = !user;
  if (user) await load();
  else { $('stats').innerHTML = ''; }
}
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (SUPABASE_URL.includes('INCOLLA-QUI')) {
    $('loginMsg').className = 'fstat err';
    $('loginMsg').textContent = 'Manca la configurazione: inserisci URL e chiave di Supabase nel file config.js (vedi README).';
    return;
  }
  const email = $('email').value.trim();
  const password = $('pwd').value;
  $('loginMsg').className = 'fstat';
  if (password) {
    $('loginMsg').textContent = 'Accesso in corso…';
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { $('loginMsg').className = 'fstat err'; $('loginMsg').textContent = 'Email o password non corrette.'; }
    else { $('loginMsg').textContent = ''; $('pwd').value = ''; }
    return;
  }
  $('loginMsg').textContent = 'Invio in corso…';
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
  if (error) { $('loginMsg').className = 'fstat err'; $('loginMsg').textContent = 'Non sono riuscito a mandare il codice: ' + (/load failed|failed to fetch|networkerror/i.test(error.message) ? 'non riesco a raggiungere Supabase. Controlla l\'indirizzo in config.js.' : /rate limit/i.test(error.message) ? 'troppe email inviate di recente. Riprova più tardi o accedi con la password.' : error.message); }
  else {
    $('loginMsg').textContent = `Fatto! Ti ho mandato un'email a ${email}: copia il codice e scrivilo qui sotto.`;
    $('codeForm').hidden = false; $('code').focus();
  }
});
$('pwd').addEventListener('input', () => { $('loginBtn').textContent = $('pwd').value ? 'Accedi' : 'Mandami il codice'; });
$('codeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = $('code').value.replace(/\D/g, '');
  if (token.length < 6) { $('codeMsg').className = 'fstat err'; $('codeMsg').textContent = 'Il codice è di almeno 6 cifre.'; return; }
  $('codeMsg').className = 'fstat'; $('codeMsg').textContent = 'Controllo il codice…';
  const { error } = await sb.auth.verifyOtp({ email: $('email').value.trim(), token, type: 'email' });
  if (error) { $('codeMsg').className = 'fstat err'; $('codeMsg').textContent = 'Codice non valido o scaduto. Richiedine uno nuovo.'; }
  else { $('codeMsg').textContent = ''; $('code').value = ''; $('codeForm').hidden = true; $('loginMsg').textContent = ''; }
});
$('logout').addEventListener('click', async () => { await sb.auth.signOut(); shows = []; cacheWrite(); });
sb.auth.onAuthStateChange((_evt, session) => { if ((session?.user?.id || null) !== (user?.id || null)) showView(session); });

/* ---------- dati ---------- */
async function load() {
  const cached = cacheRead();
  if (cached.length && !shows.length) { shows = cached; render(); }
  const { data, error } = await sb.from('shows').select('*').order('updated_at', { ascending: false });
  if (error) { status('Offline: mostro l\'ultima versione salvata sul dispositivo'); if (!shows.length) render(); return; }
  shows = data.map(normalize);
  cacheWrite(); render();
  status('Sincronizzato');
}
function saveLater(x) {
  status('Salvataggio…');
  clearTimeout(timers.get(x.id));
  timers.set(x.id, setTimeout(async () => {
    timers.delete(x.id);
    const { error } = await sb.from('shows').update({ ...pick(x), updated_at: new Date().toISOString() }).eq('id', x.id);
    status(error ? 'Salvataggio non riuscito: controlla la connessione' : 'Salvato');
  }, 700));
  cacheWrite();
}
async function insert(rows) {
  const { data, error } = await sb.from('shows').insert(rows.map(pick)).select();
  if (error) throw error;
  shows.unshift(...data.map(normalize)); cacheWrite(); render();
  return data;
}
async function remove(x) {
  const { error } = await sb.from('shows').delete().eq('id', x.id);
  if (error) { toast('Eliminazione non riuscita'); return; }
  shows = shows.filter((y) => y.id !== x.id); cacheWrite(); render();
  toast(`"${x.title}" eliminata`, async () => { await insert([x]); });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && user && !timers.size) load(); });

/* ---------- elenco ---------- */
function render() {
  const w = shows.filter((x) => x.status === 'watching').length;
  const d = shows.filter((x) => x.status === 'done').length;
  const eps = shows.reduce((a, x) => a + seen(x), 0);
  $('stats').innerHTML = `<span><b>${w}</b>in visione</span><span><b>${d}</b>finite</span><span><b>${eps}</b>episodi visti</span>`;
  const counts = { all: shows.length };
  for (const k in ST) counts[k] = shows.filter((x) => x.status === k).length;
  $('tabs').innerHTML = [['all', 'Tutte'], ...Object.entries(ST)]
    .map(([k, l]) => `<button class="tab" data-f="${k}" aria-pressed="${filter === k}">${l} · ${counts[k]}</button>`).join('');
  const vis = shows
    .filter((x) => (filter === 'all' || x.status === filter) && x.title.toLowerCase().includes(q))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  $('list').innerHTML = vis.length ? vis.map(row).join('') :
    `<li class="empty"><strong>${shows.length ? 'Nessuna serie qui' : 'Nessuna serie ancora'}</strong>${shows.length ? 'Prova un altro filtro o un\'altra ricerca.' : 'Aggiungi la prima con il pulsante qui sopra, oppure importa i tuoi dati.'}</li>`;
}
function row(x) {
  const tot = total(x), pct = tot ? Math.round((seen(x) / tot) * 100) : null;
  const n = next(x);
  const code = x.episode === 0 ? `S${x.season} <span style="opacity:.4">E–</span>` : `S${x.season} E${x.episode}`;
  const sub = x.status === 'done' ? 'Completata' : isEnd(x) ? 'Serie completata' : `Prossimo: S${n.season} E${n.episode}`;
  const ticks = x.seasons.length ? `<div class="ticks">${x.seasons.map((c, i) => {
    const f = i < x.season - 1 ? 100 : i === x.season - 1 ? Math.min(100, (x.episode / c) * 100) : 0;
    return `<span class="tk" title="Stagione ${i + 1}: ${c} episodi"><i style="width:${f}%"></i></span>`;
  }).join('')}</div>` : '';
  const tag = x.status === 'watching' ? 'on' : x.status === 'done' ? 'done' : '';
  const meta = [x.year, x.genre, x.platform, x.seasons.length ? `${x.seasons.length} stagioni` : '', pct !== null ? `${seen(x)}/${tot} episodi · ${pct}%` : '']
    .filter(Boolean).map(esc).join(' · ');
  return `<li class="row" data-id="${x.id}">
    ${x.poster ? `<img class="poster" src="${IMG(x.poster, 154)}" alt="" loading="lazy">` : '<span class="poster"></span>'}
    <div class="code">${code}<small>${esc(sub)}</small></div>
    <div class="info"><div class="t">${esc(x.title)}<span class="tag ${tag}">${ST[x.status]}</span></div>
      <div class="meta">${meta}</div>${ticks}${x.note ? `<div class="note">${esc(x.note)}</div>` : ''}</div>
    <div class="acts">
      <button class="ic" data-a="minus" aria-label="Episodio precedente" ${x.episode === 0 && x.season === 1 ? 'disabled' : ''}>−</button>
      <button class="ic plus" data-a="plus" ${isEnd(x) ? 'disabled' : ''}>+1 ep</button>
      <button class="ic" data-a="edit" aria-label="Modifica ${esc(x.title)}">✎</button>
    </div></li>`;
}

/* ---------- ricerca TMDB ---------- */
async function tmdb(params) {
  const r = await fetch('/api/tmdb?' + new URLSearchParams(params));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'errore ' + r.status);
  return j;
}
async function search() {
  const name = $('fFind').value.trim();
  if (!name) return;
  $('fGo').disabled = true; $('fFound').innerHTML = ''; $('fStat').className = 'fstat';
  $('fStat').innerHTML = '<span class="spin"></span>Cerco…';
  try {
    const { results } = await tmdb({ op: 'search', q: name });
    $('fStat').textContent = results.length ? 'Quale di queste?' : 'Nessuna serie trovata con questo nome.';
    $('fResults').innerHTML = results.map((r) => `<li><button type="button" data-tmdb="${r.id}">
      ${r.poster ? `<img src="${IMG(r.poster, 92)}" alt="">` : '<span class="ph"></span>'}
      <span>${esc(r.title)}<small>${[r.year, r.original !== r.title ? r.original : ''].filter(Boolean).map(esc).join(' · ')}</small></span></button></li>`).join('');
  } catch (e) {
    $('fStat').className = 'fstat err'; $('fStat').textContent = 'Ricerca non riuscita (' + e.message + '). Puoi compilare a mano.';
  } finally { $('fGo').disabled = false; }
}
async function choose(id) {
  $('fResults').innerHTML = ''; $('fStat').className = 'fstat';
  $('fStat').innerHTML = '<span class="spin"></span>Prendo i dettagli…';
  try {
    const d = await tmdb({ op: 'details', id });
    found = { tmdb_id: d.id, year: d.year, genre: d.genre, plot: d.plot, poster: d.poster, ongoing: d.ongoing };
    $('fTitle').value = d.title;
    if (d.platform) $('fWhere').value = d.platform;
    if (d.seasons.length) { $('fSeasons').value = d.seasons.join(', '); fillPickers(+$('fS').value, +$('fE').value); }
    $('fStat').textContent = 'Ho compilato i campi qui sotto: scegli a che episodio sei e salva.';
    $('fFound').innerHTML = `<div class="found">${d.poster ? `<img src="${IMG(d.poster)}" alt="">` : '<span></span>'}<div>
      <b>${esc(d.title)}</b><br>${[d.year, d.genre, d.seasons.length ? `${d.seasons.length} stagioni · ${d.seasons.reduce((a, b) => a + b, 0)} episodi` : '', d.ongoing ? 'in corso' : 'conclusa'].filter(Boolean).map(esc).join(' · ')}
      ${d.plot ? `<p>${esc(d.plot.length > 220 ? d.plot.slice(0, 217) + '…' : d.plot)}</p>` : ''}</div></div>`;
  } catch (e) {
    $('fStat').className = 'fstat err'; $('fStat').textContent = 'Dettagli non disponibili (' + e.message + ').';
  }
}

/* ---------- modulo ---------- */
const parseSeasons = () => $('fSeasons').value.split(/[,;\s]+/).map((n) => parseInt(n, 10)).filter((n) => n > 0 && n < 1000);
// Riempie i menu "Stagione" ed "Episodio" in base agli episodi usciti.
function fillPickers(season, episode) {
  const seasons = parseSeasons();
  const known = seasons.length > 0;
  const nS = known ? seasons.length : 20;
  season = Math.min(Math.max(1, season || 1), nS);
  $('fS').innerHTML = Array.from({ length: nS }, (_, i) =>
    `<option value="${i + 1}">Stagione ${i + 1}</option>`).join('');
  $('fS').value = season;
  const nE = known ? seasons[season - 1] : 40;
  episode = Math.min(Math.max(0, episode || 0), nE);
  $('fE').innerHTML = `<option value="0">Nessuno ancora</option>` + Array.from({ length: nE }, (_, i) =>
    `<option value="${i + 1}">Episodio ${i + 1}${known && i + 1 === nE ? ' (ultimo)' : ''}</option>`).join('');
  $('fE').value = episode;
  syncPick();
}
// Con stato "Finita" stagione ed episodio non servono: è vista tutta.
function syncPick() {
  const done = $('fStatus').value === 'done';
  $('fPick').hidden = done;
  $('fPickHint').hidden = done || parseSeasons().length > 0;
}
$('fStatus').addEventListener('change', syncPick);
$('fS').addEventListener('change', () => fillPickers(+$('fS').value, 0));
$('fSeasons').addEventListener('input', () => fillPickers(+$('fS').value, +$('fE').value));

function openForm(x) {
  editing = x ? x.id : null; found = null;
  $('dt').textContent = x ? 'Modifica serie' : 'Nuova serie';
  $('fFind').value = x?.title || ''; $('fStat').textContent = ''; $('fResults').innerHTML = ''; $('fFound').innerHTML = '';
  $('fGo').textContent = x ? 'Aggiorna info' : 'Cerca';
  $('fTitle').value = x?.title || ''; $('fStatus').value = x?.status || 'watching'; $('fWhere').value = x?.platform || '';
  $('fSeasons').value = x ? x.seasons.join(', ') : ''; fillPickers(x?.season || 1, x?.episode ?? 0);
  $('fNote').value = x?.note || ''; $('fDel').style.display = x ? '' : 'none';
  $('ov').classList.add('open');
  setTimeout(() => $(x ? 'fTitle' : 'fFind').focus(), 30);
}
const closeAll = () => document.querySelectorAll('.ov.open').forEach((o) => o.classList.remove('open'));

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const seasons = parseSeasons();
  let season = Math.max(1, parseInt($('fS').value, 10) || 1), episode = Math.max(0, parseInt($('fE').value, 10) || 0);
  if (seasons.length) { season = Math.min(season, seasons.length); episode = Math.min(episode, seasons[season - 1]); }
  // Finita = tutti gli episodi di tutte le stagioni visti.
  if ($('fStatus').value === 'done' && seasons.length) { season = seasons.length; episode = seasons[seasons.length - 1]; }
  const v = { title: $('fTitle').value.trim(), status: $('fStatus').value, platform: $('fWhere').value.trim(), seasons, season, episode, note: $('fNote').value.trim(), ...(found || {}) };
  if (!v.title) return;
  normalize(v);
  if (editing) {
    const x = shows.find((y) => y.id === editing), before = { ...x };
    Object.assign(x, v); closeAll(); render(); saveLater(x);
    toast('Serie aggiornata', () => { Object.assign(x, before); render(); saveLater(x); });
  } else {
    try { await insert([v]); closeAll(); toast(`"${v.title}" aggiunta`); }
    catch (err) { $('fStat').className = 'fstat err'; $('fStat').textContent = 'Non riesco a salvare: ' + err.message; }
  }
});
$('fFind').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
$('q').addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); render(); });
document.querySelectorAll('.ov').forEach((o) => o.addEventListener('click', (e) => { if (e.target === o) closeAll(); }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });

/* ---------- importa / esporta ---------- */
$('impForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  let list;
  try { const j = JSON.parse($('impText').value); list = Array.isArray(j) ? j : j.shows; if (!Array.isArray(list)) throw 0; }
  catch { $('impMsg').className = 'fstat err'; $('impMsg').textContent = 'Il testo incollato non è un JSON valido.'; return; }
  // Accetta sia il formato del tracker su Claude (s, e, where) sia quello di questa app.
  const rows = list.filter((x) => x && x.title).map((x) => normalize({
    title: String(x.title).slice(0, 80), status: ST[x.status] ? x.status : 'watching',
    platform: x.platform ?? x.where ?? '', seasons: x.seasons || [], season: x.season ?? x.s ?? 1, episode: x.episode ?? x.e ?? 0,
    year: x.year || null, genre: x.genre || null, plot: x.plot || null, poster: x.poster || null, tmdb_id: x.tmdb_id || null, note: x.note || '',
  }));
  const have = new Set(shows.map((x) => x.title.toLowerCase()));
  const fresh = rows.filter((x) => !have.has(x.title.toLowerCase()));
  if (!fresh.length) { $('impMsg').className = 'fstat'; $('impMsg').textContent = 'Nessuna serie nuova da importare: le hai già tutte.'; return; }
  try {
    await insert(fresh);
    $('impMsg').className = 'fstat'; $('impMsg').textContent = `Importate ${fresh.length} serie${rows.length > fresh.length ? ` (${rows.length - fresh.length} già presenti, saltate)` : ''}.`;
    $('impText').value = '';
  } catch (err) { $('impMsg').className = 'fstat err'; $('impMsg').textContent = 'Importazione non riuscita: ' + err.message; }
});
$('exportBtn').addEventListener('click', async () => {
  const text = JSON.stringify({ shows: shows.map(pick) }, null, 1);
  try { await navigator.clipboard.writeText(text); $('impMsg').className = 'fstat'; $('impMsg').textContent = 'Dati copiati negli appunti.'; }
  catch { $('impText').value = text; $('impMsg').textContent = 'Copia il testo qui sopra.'; }
});

/* ---------- clic ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.f) { filter = t.dataset.f; render(); return; }
  if (t.dataset.tmdb) { choose(t.dataset.tmdb); return; }
  switch (t.id) {
    case 'add': openForm(null); return;
    case 'fGo': search(); return;
    case 'fCancel': case 'impCancel': closeAll(); return;
    case 'importBtn': $('impMsg').textContent = ''; $('impOv').classList.add('open'); return;
    case 'undo': if (undoFn) { const f = undoFn; undoFn = null; $('toast').classList.remove('show'); f(); } return;
    case 'fDel': { const x = shows.find((y) => y.id === editing); closeAll(); if (x) remove(x); return; }
  }
  const li = t.closest('.row'); if (!li) return;
  const x = shows.find((y) => y.id === li.dataset.id); if (!x) return;
  if (t.dataset.a === 'edit') { openForm(x); return; }
  const before = { season: x.season, episode: x.episode, status: x.status };
  if (t.dataset.a === 'plus') {
    Object.assign(x, next(x));
    if (x.status === 'todo' || x.status === 'paused') x.status = 'watching';
  }
  if (t.dataset.a === 'minus') {
    if (x.episode > 1 || (x.episode === 1 && x.season === 1)) x.episode--;
    else if (x.season > 1) { x.season--; x.episode = x.seasons[x.season - 1] || x.episode; }
    if (x.status === 'done') x.status = 'watching';
  }
  normalize(x);
  x.updated_at = new Date().toISOString();
  render(); saveLater(x);
  if (x.status === 'done' && before.status !== 'done') toast(`"${x.title}" finita!`, () => { Object.assign(x, before); render(); saveLater(x); });
  document.querySelector(`.row[data-id="${x.id}"]`)?.classList.add('bump');
});

/* ---------- avvio ---------- */
if (SUPABASE_URL.includes('INCOLLA-QUI')) {
  $('login').hidden = false;
  $('loginMsg').className = 'fstat err';
  $('loginMsg').textContent = 'Manca la configurazione: inserisci URL e chiave di Supabase nel file config.js (vedi README).';
} else {
  sb.auth.getSession().then(({ data }) => showView(data.session));
}
