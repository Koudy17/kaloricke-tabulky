'use strict';

/* ---------- Úložiště ---------- */
const LS = {
  foods: 'kt_foods',
  log: 'kt_log',
  settings: 'kt_settings',
  profile: 'kt_profile',
  favorites: 'kt_favorites',
  weights: 'kt_weights',
  water: 'kt_water',
  activity: 'kt_activity',
  strava: 'kt_strava',
};
const load = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let foods = load(LS.foods, []);            // vlastní jídla
let log = load(LS.log, []);                // deníkové záznamy
let settings = load(LS.settings, { kcal: 2000, prot: 100, carb: 250, fat: 65, waterGoal: 2000 });
if (settings.waterGoal == null) settings.waterGoal = 2000;
let profile = load(LS.profile, {});        // vstupy do kalkulačky cílů

// Migrace: dřívější jednu „Svačina" (snack) přesuneme do Odpolední svačiny.
(() => {
  let changed = false;
  log.forEach(e => { if (e.meal === 'snack') { e.meal = 'snack_pm'; changed = true; } });
  if (changed) save(LS.log, log);
})();
let favorites = load(LS.favorites, []);    // oblíbená jídla (snapshoty)
let weights = load(LS.weights, []);        // záznamy váhy [{date, kg}]
let water = load(LS.water, {});            // pitný režim { 'YYYY-MM-DD': ml }
let activity = load(LS.activity, {});      // spálené kalorie { 'YYYY-MM-DD': kcal }
let strava = load(LS.strava, null);        // { refresh, athlete } po propojení

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- Datum ---------- */
let currentDate = todayKey();
function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shiftDate(days) {
  const d = new Date(currentDate + 'T12:00:00');
  d.setDate(d.getDate() + days);
  currentDate = todayKey(d);
  renderDay();
}
function dateHuman(key) {
  const d = new Date(key + 'T12:00:00');
  const t = todayKey();
  const y = todayKey(new Date(Date.now() - 86400000));
  const tm = todayKey(new Date(Date.now() + 86400000));
  if (key === t) return 'Dnes';
  if (key === y) return 'Včera';
  if (key === tm) return 'Zítra';
  const dny = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  return `${dny[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`;
}

/* ---------- Pomocné výpočty ---------- */
const MEALS = [
  { id: 'breakfast', label: 'Snídaně' },
  { id: 'snack_am', label: 'Dopolední svačina' },
  { id: 'lunch', label: 'Oběd' },
  { id: 'snack_pm', label: 'Odpolední svačina' },
  { id: 'dinner', label: 'Večeře' },
];
const r0 = n => Math.round(n || 0);
const r1 = n => Math.round((n || 0) * 10) / 10;

function entryNutri(e) {
  const g = e.grams / 100;
  return {
    kcal: (e.kcal100 || 0) * g,
    prot: (e.prot100 || 0) * g,
    carb: (e.carb100 || 0) * g,
    fat: (e.fat100 || 0) * g,
  };
}
function dayEntries(key = currentDate) { return log.filter(e => e.date === key); }
function sumNutri(entries) {
  return entries.reduce((a, e) => {
    const n = entryNutri(e);
    a.kcal += n.kcal; a.prot += n.prot; a.carb += n.carb; a.fat += n.fat;
    return a;
  }, { kcal: 0, prot: 0, carb: 0, fat: 0 });
}

/* ---------- Render denního přehledu ---------- */
const $ = id => document.getElementById(id);

function renderDay() {
  $('dayLabelText').textContent = dateHuman(currentDate);
  const entries = dayEntries();
  const tot = sumNutri(entries);

  // Prstenec — spálené kalorie z aktivity zvyšují denní rozpočet.
  const burned = activity[currentDate] || 0;
  const effGoal = settings.kcal + burned;
  $('kcalNow').textContent = r0(tot.kcal);
  $('kcalGoal').textContent = burned > 0 ? `${r0(settings.kcal)}+${r0(burned)}` : r0(settings.kcal);
  const circ = 2 * Math.PI * 52; // 326.7
  const frac = effGoal > 0 ? Math.min(tot.kcal / effGoal, 1) : 0;
  const ring = $('ringProgress');
  ring.style.strokeDashoffset = String(circ * (1 - frac));
  ring.style.stroke = tot.kcal > effGoal ? 'var(--danger)' : 'var(--brand)';

  // Makra
  setMacro('p', tot.prot, settings.prot);
  setMacro('c', tot.carb, settings.carb);
  setMacro('f', tot.fat, settings.fat);

  // Jídla
  const wrap = $('meals');
  wrap.innerHTML = '';
  for (const m of MEALS) {
    const mEntries = entries.filter(e => e.meal === m.id);
    const mTot = sumNutri(mEntries);
    const el = document.createElement('section');
    el.className = 'meal';
    el.innerHTML = `
      <div class="meal-head">
        <span class="meal-title">${m.label}</span>
        <span class="meal-kcal">${r0(mTot.kcal)} kcal</span>
        <button class="meal-add" data-meal="${m.id}">+ Přidat</button>
      </div>`;
    if (mEntries.length === 0) {
      const em = document.createElement('div');
      em.className = 'empty';
      em.textContent = 'Zatím nic';
      el.appendChild(em);
    } else {
      for (const e of mEntries) {
        const n = entryNutri(e);
        const row = document.createElement('div');
        row.className = 'entry';
        row.innerHTML = `
          <button class="entry-main" data-edit="${e.id}">
            <div class="entry-name">${esc(e.name)}</div>
            <div class="entry-sub">${r0(e.grams)} g · B ${r1(n.prot)} · S ${r1(n.carb)} · T ${r1(n.fat)}</div>
          </button>
          <span class="entry-kcal">${r0(n.kcal)}</span>
          <button class="entry-del" data-del="${e.id}" aria-label="Smazat">×</button>`;
        el.appendChild(row);
      }
    }
    wrap.appendChild(el);
  }
  renderWater();
  renderActivity();
}
function setMacro(key, val, goal) {
  $(key + 'Val').textContent = `${r0(val)} / ${r0(goal)} g`;
  $(key + 'Bar').style.width = (goal > 0 ? Math.min(val / goal, 1) * 100 : 0) + '%';
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ---------- Toast ---------- */
let toastT;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.add('hidden'), 2200);
}

/* ---------- Sheety ---------- */
function openSheet(id) { $(id).classList.remove('hidden'); }
function closeSheet(id) { $(id).classList.add('hidden'); }

/* ---------- Přidání jídla (výběr → gramáž) ---------- */
let pendingMeal = 'snack_pm';
let pendingFood = null; // {name, kcal100, prot100, carb100, fat100, source}

function openAdd(meal) {
  pendingMeal = meal || 'snack_pm';
  switchTab('search');
  $('searchResults').innerHTML = '';
  $('searchStatus').textContent = '';
  $('searchInput').value = '';
  $('portionMeal').value = pendingMeal;
  $('qMeal').value = pendingMeal;
  renderQuickPick();
  renderCustomList();
  openSheet('addSheet');
}

/* ---------- Nedávná a oblíbená jídla ---------- */
function foodKey(f) { return f.name + '|' + f.kcal100; }
function foodSnapshot(f) {
  return { name: f.name, kcal100: f.kcal100 || 0, prot100: f.prot100 || 0, carb100: f.carb100 || 0, fat100: f.fat100 || 0, source: f.source || 'off' };
}
function recentFoods(limit = 12) {
  const seen = new Set(); const out = [];
  for (let i = log.length - 1; i >= 0 && out.length < limit; i--) {
    const e = log[i];
    if (e.source === 'quick') continue;      // rychlé kalorie nejsou opakovatelné jídlo
    const k = foodKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(foodSnapshot(e));
  }
  return out;
}
function isFav(f) { return favorites.some(x => foodKey(x) === foodKey(f)); }
function toggleFav(f) {
  if (isFav(f)) favorites = favorites.filter(x => foodKey(x) !== foodKey(f));
  else favorites.unshift(foodSnapshot(f));
  save(LS.favorites, favorites);
}
function starButton(f, onToggle) {
  const b = document.createElement('button');
  b.className = 'result-star' + (isFav(f) ? ' on' : '');
  b.textContent = isFav(f) ? '★' : '☆';
  b.title = 'Oblíbené';
  b.addEventListener('click', ev => {
    ev.stopPropagation();
    toggleFav(f);
    b.textContent = isFav(f) ? '★' : '☆';
    b.classList.toggle('on', isFav(f));
    if (onToggle) onToggle();
  });
  return b;
}
function quickRow(f) {
  const row = document.createElement('div'); row.className = 'result';
  const pick = document.createElement('button'); pick.className = 'result-pick';
  pick.innerHTML =
    `<div class="result-main"><div class="result-name">${esc(f.name)}</div>` +
    `<div class="result-sub">B ${r1(f.prot100)} · S ${r1(f.carb100)} · T ${r1(f.fat100)} / 100 g</div></div>` +
    `<span class="result-kcal">${r0(f.kcal100)} kcal</span>`;
  pick.addEventListener('click', () => pickFood(f));
  row.appendChild(pick);
  row.appendChild(starButton(f, renderQuickPick));
  return row;
}
function renderQuickPick() {
  const c = $('quickPick');
  c.innerHTML = '';
  const favs = favorites.slice(0, 20);
  const favSet = new Set(favs.map(foodKey));
  const recent = recentFoods(12).filter(f => !favSet.has(foodKey(f)));
  if (!favs.length && !recent.length) return;
  const title = t => { const d = document.createElement('div'); d.className = 'qp-title'; d.textContent = t; return d; };
  if (favs.length) { c.appendChild(title('★ Oblíbená')); favs.forEach(f => c.appendChild(quickRow(f))); }
  if (recent.length) { c.appendChild(title('Naposledy')); recent.forEach(f => c.appendChild(quickRow(f))); }
}

/* ---------- Rychlé přidání kalorií ---------- */
function saveQuickKcal() {
  const kcal = parseFloat($('qKcal').value);
  if (!kcal || kcal <= 0) { toast('Zadej kalorie'); return; }
  const name = $('qName').value.trim() || 'Rychlé kalorie';
  log.push({
    id: uid(), date: currentDate, meal: $('qMeal').value, name, grams: 100,
    kcal100: r1(kcal),
    prot100: r1(parseFloat($('qProt').value) || 0),
    carb100: r1(parseFloat($('qCarb').value) || 0),
    fat100: r1(parseFloat($('qFat').value) || 0),
    source: 'quick',
  });
  save(LS.log, log);
  ['qName', 'qKcal', 'qProt', 'qCarb', 'qFat'].forEach(id => { $(id).value = ''; });
  closeSheet('addSheet');
  renderDay();
  toast('Přidáno do deníku');
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== name));
  if (name !== 'scan') stopScan();
}

let editingEntryId = null;
function pickFood(food) {
  editingEntryId = null;
  pendingFood = foodSnapshot(food);
  $('portionName').textContent = food.name;
  $('portionPer100').textContent =
    `Na 100 g: ${r0(food.kcal100)} kcal · B ${r1(food.prot100)} · S ${r1(food.carb100)} · T ${r1(food.fat100)}`;
  $('portionGrams').value = 100;
  $('portionMeal').value = pendingMeal;
  $('portionSave').textContent = 'Přidat do deníku';
  $('portionFav').classList.remove('hidden');
  $('portionFav').textContent = isFav(food) ? '★ Oblíbené' : '☆ Přidat k oblíbeným';
  updatePortionPreview();
  openSheet('portionSheet');
}
// Úprava už zapsaného záznamu (klik na položku v deníku).
function editEntry(id) {
  const e = log.find(x => x.id === id);
  if (!e) return;
  editingEntryId = id;
  pendingMeal = e.meal;
  pendingFood = foodSnapshot(e);
  $('portionName').textContent = e.name;
  $('portionPer100').textContent =
    `Na 100 g: ${r0(e.kcal100)} kcal · B ${r1(e.prot100)} · S ${r1(e.carb100)} · T ${r1(e.fat100)}`;
  $('portionGrams').value = e.grams;
  $('portionMeal').value = e.meal;
  $('portionSave').textContent = 'Uložit změnu';
  $('portionFav').classList.add('hidden');
  updatePortionPreview();
  openSheet('portionSheet');
}
function updatePortionPreview() {
  if (!pendingFood) return;
  const g = parseFloat($('portionGrams').value) || 0;
  const f = g / 100;
  $('portionPreview').innerHTML =
    `<b>${r0(pendingFood.kcal100 * f)}</b> kcal &nbsp;·&nbsp; ` +
    `B <b>${r1(pendingFood.prot100 * f)}</b> g &nbsp; ` +
    `S <b>${r1(pendingFood.carb100 * f)}</b> g &nbsp; ` +
    `T <b>${r1(pendingFood.fat100 * f)}</b> g`;
  syncPortionChips();
}
// Zvýrazní rychlou porci, když gramáž odpovídá jejímu odhadu.
function syncPortionChips() {
  const g = parseFloat($('portionGrams').value) || 0;
  document.querySelectorAll('#quickPortions .chip').forEach(c =>
    c.classList.toggle('active', parseFloat(c.dataset.g) === g));
}
function savePortion() {
  const g = parseFloat($('portionGrams').value);
  if (!g || g <= 0) { toast('Zadej množství v gramech'); return; }
  // Přidávání suroviny do rozpracovaného receptu.
  if (recipeMode) {
    recipeItems.push({ ...foodSnapshot(pendingFood), grams: g });
    recipeMode = false;
    closeSheet('portionSheet');
    closeSheet('addSheet');
    renderRecipe();
    openSheet('recipeSheet');
    toast('Surovina přidána');
    return;
  }
  const meal = $('portionMeal').value;
  const editing = !!editingEntryId;
  if (editing) {
    const e = log.find(x => x.id === editingEntryId);
    if (e) { e.grams = g; e.meal = meal; }
  } else {
    log.push({
      id: uid(), date: currentDate, meal,
      name: pendingFood.name, grams: g,
      kcal100: pendingFood.kcal100 || 0, prot100: pendingFood.prot100 || 0,
      carb100: pendingFood.carb100 || 0, fat100: pendingFood.fat100 || 0,
      source: pendingFood.source || 'off',
    });
  }
  save(LS.log, log);
  editingEntryId = null;
  closeSheet('portionSheet');
  closeSheet('addSheet');
  renderDay();
  toast(editing ? 'Uloženo' : 'Přidáno do deníku');
}

/* ---------- OpenFoodFacts ---------- */
// Vyhledávací server OFF občas vrátí odpověď bez CORS hlaviček (náhodně ~1/3).
// Proto každý dotaz zkusíme víckrát po sobě s krátkou pauzou + timeout.
async function fetchJson(url, { tries = 4, timeoutMs = 8000 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(to);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      clearTimeout(to);
      lastErr = e;
      if (i < tries - 1) await new Promise(r => setTimeout(r, 350 * (i + 1)));
    }
  }
  throw lastErr;
}

function kcalFrom(n) {
  if (!n) return null;
  if (n['energy-kcal_100g'] != null) return +n['energy-kcal_100g'];
  if (n['energy-kcal'] != null) return +n['energy-kcal'];
  if (n['energy_100g'] != null) return +n['energy_100g'] / 4.184; // kJ → kcal
  return null;
}
// Název může být řetězec i (u Search-a-licious) objekt s jazyky; brands zase pole i řetězec.
function pickName(p) {
  const c = p.product_name || p.product_name_cs || p.generic_name || '';
  if (typeof c === 'string') return c.trim();
  if (c && typeof c === 'object') return String(c.cs || c.en || Object.values(c)[0] || '').trim();
  return '';
}
function firstBrand(p) {
  const b = p.brands;
  if (!b) return '';
  if (Array.isArray(b)) return String(b[0] || '').trim();
  return String(b).split(',')[0].trim();
}
function offToFood(p) {
  const n = p.nutriments || {};
  const kcal = kcalFrom(n);
  if (kcal == null) return null;
  let name = pickName(p);
  if (!name) return null;
  const brand = firstBrand(p);
  if (brand) name += ` (${brand})`;
  const countries = [].concat(p.countries_tags || []).join(',');
  return {
    name,
    kcal100: r1(kcal),
    prot100: r1(+n.proteins_100g || 0),
    carb100: r1(+n.carbohydrates_100g || 0),
    fat100: r1(+n.fat_100g || 0),
    source: 'off',
    cz: /czech|czechia|slovak/i.test(countries),
  };
}
// České a slovenské produkty nahoru (stabilní řazení).
function sortCzFirst(items) {
  return items.map((f, i) => [f, i]).sort((a, b) => (b[0].cz - a[0].cz) || (a[1] - b[1])).map(x => x[0]);
}
// Fulltextové hledání dělá Search-a-licious (search.openfoodfacts.org) — jediná
// služba OFF, co skutečně hledá podle textu. Nemá ale CORS, tak ji voláme přes
// několik veřejných proxy NAJEDNOU a vezmeme tu, co odpoví první (spolehlivější
// než spoléhat na jednu). Pozn.: v2/search zde nejde použít — text ignoruje.
const PROXIES = [
  u => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
  u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  u => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u),
];
async function fetchViaProxies(targetUrl, timeoutMs = 7000) {
  const attempts = PROXIES.map(async wrap => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(wrap(targetUrl), { signal: ctrl.signal });
      clearTimeout(to);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) { clearTimeout(to); throw e; }
  });
  return Promise.any(attempts); // první úspěšná vyhrává
}

// Vyhledávač OFF shoduje podle začátku slova a je citlivý na diakritiku i tvar
// slova → čeština kvůli skloňování sráží počet výsledků (např. „chleba" najde 5).
// Rozšíříme dotaz o „kmen" bez diakritiky s hvězdičkou: „chleba" → „chleba chleb*"
// (mezera funguje jako NEBO), což najde mnohem víc tvarů. Nikdy to neuškodí.
function stripDiacritics(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function expandQuery(term) {
  const t = term.trim();
  const forms = [t];
  const stem = stripDiacritics(t.toLowerCase());
  if (stem.length >= 5) {
    const wild = stem.slice(0, -1) + '*';       // ubereme koncovku + hvězdička
    if (!forms.includes(wild)) forms.push(wild);
  } else if (stem !== t.toLowerCase()) {
    forms.push(stem);                            // krátká slova aspoň bez diakritiky
  }
  return forms.join(' ');
}

async function offSearch(term) {
  const q = expandQuery(term);

  // 1) Vlastní proxy na Vercelu – rychlá a spolehlivá (když appka běží na Vercelu).
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch('/api/search?q=' + encodeURIComponent(q), { signal: ctrl.signal });
    clearTimeout(to);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.hits)) return sortCzFirst(data.hits.map(offToFood).filter(Boolean));
    }
  } catch { /* vlastní proxy není k dispozici → zkusíme veřejné níže */ }

  // 2) Záloha: veřejné CORS proxy na Search-a-licious (funguje i na GitHub Pages).
  const url = 'https://search.openfoodfacts.org/search?' + new URLSearchParams({
    q, page_size: '25',
    fields: 'code,product_name,product_name_cs,generic_name,brands,nutriments,countries_tags',
  });
  const data = await fetchViaProxies(url, 9000);
  return sortCzFirst((data.hits || []).map(offToFood).filter(Boolean));
}
async function offByBarcode(code) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?` +
    'fields=product_name,product_name_cs,generic_name,brands,nutriments';
  const data = await fetchJson(url, { tries: 3 });
  if (data.status !== 1 || !data.product) return null;
  return offToFood(data.product);
}

let searchSeq = 0;
async function doSearch() {
  const term = $('searchInput').value.trim();
  if (!term) return;
  const seq = ++searchSeq;
  $('searchStatus').textContent = 'Hledám…';
  $('searchResults').innerHTML = '';
  $('quickPick').innerHTML = '';
  try {
    const items = await offSearch(term);
    if (seq !== searchSeq) return;
    if (items.length === 0) {
      $('searchStatus').textContent = 'Nic nenalezeno. Zkus jiný název, nebo přidej vlastní jídlo.';
      return;
    }
    $('searchStatus').textContent = `${items.length} výsledků`;
    renderResults($('searchResults'), items);
  } catch (err) {
    if (seq !== searchSeq) return;
    $('searchStatus').innerHTML = 'Databáze právě neodpovídá (občas zlobí). ' +
      '<button id="retrySearch" class="linkbtn" style="min-width:0">Zkusit znovu</button>';
    const rb = $('retrySearch');
    if (rb) rb.addEventListener('click', doSearch);
  }
}
function renderResults(container, items) {
  container.innerHTML = '';
  for (const f of items) {
    const row = document.createElement('div');
    row.className = 'result';
    const pick = document.createElement('button');
    pick.className = 'result-pick';
    pick.innerHTML =
      `<div class="result-main"><div class="result-name">${f.cz ? '🇨🇿 ' : ''}${esc(f.name)}</div>` +
      `<div class="result-sub">B ${r1(f.prot100)} · S ${r1(f.carb100)} · T ${r1(f.fat100)} / 100 g</div></div>` +
      `<span class="result-kcal">${r0(f.kcal100)} kcal</span>`;
    pick.addEventListener('click', () => pickFood(f));
    row.appendChild(pick);
    row.appendChild(starButton(f));
    container.appendChild(row);
  }
}

/* ---------- Skener čárových kódů ---------- */
let scanStream = null, scanRAF = null, detector = null;
async function startScan() {
  $('scanStatus').textContent = '';
  if (!('BarcodeDetector' in window)) {
    $('scanStatus').textContent = 'Tenhle prohlížeč skenování nepodporuje (funguje hlavně na Androidu v Chrome). Použij vyhledávání.';
    return;
  }
  try {
    detector = detector || new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const v = $('scanVideo');
    v.srcObject = scanStream;
    await v.play();
    $('scanStart').textContent = 'Skenuji… (klepni pro zastavení)';
    $('scanStatus').textContent = 'Namiř foťák na čárový kód.';
    scanLoop();
  } catch (err) {
    $('scanStatus').textContent = 'Nepovedlo se zapnout foťák. Povol přístup ke kameře.';
    stopScan();
  }
}
async function scanLoop() {
  const v = $('scanVideo');
  if (!scanStream) return;
  try {
    const codes = await detector.detect(v);
    if (codes && codes.length) {
      const code = codes[0].rawValue;
      stopScan();
      $('scanStatus').textContent = `Načteno: ${code} — hledám…`;
      const f = await offByBarcode(code);
      if (f) { switchTab('search'); pickFood(f); }
      else { switchTab('search'); toast('Produkt není v databázi — přidej ho jako vlastní'); }
      return;
    }
  } catch { /* ignore frame errors */ }
  scanRAF = requestAnimationFrame(scanLoop);
}
function stopScan() {
  if (scanRAF) cancelAnimationFrame(scanRAF), scanRAF = null;
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  const s = $('scanStart'); if (s) s.textContent = 'Spustit skener';
}

/* ---------- Vlastní jídla ---------- */
function renderCustomList() {
  const c = $('customList');
  c.innerHTML = '';
  if (foods.length === 0) {
    c.innerHTML = '<div class="status">Zatím nemáš žádná vlastní jídla. Vytvoř si třeba svůj oblíbený recept nebo produkt, který není v databázi.</div>';
    return;
  }
  for (const f of foods) {
    const row = document.createElement('div');
    row.className = 'result';
    const pick = document.createElement('button');
    pick.className = 'result-pick';
    pick.innerHTML = `
      <div class="result-main">
        <div class="result-name">${esc(f.name)}</div>
        <div class="result-sub">B ${r1(f.prot100)} · S ${r1(f.carb100)} · T ${r1(f.fat100)} / 100 g</div>
      </div>
      <span class="result-kcal">${r0(f.kcal100)} kcal</span>`;
    pick.addEventListener('click', () => pickFood({ ...f, source: 'custom' }));
    const edit = document.createElement('button');
    edit.className = 'result-edit';
    edit.textContent = '✎';
    edit.title = 'Upravit';
    edit.addEventListener('click', () => openFoodEditor(f.id));
    row.appendChild(pick);
    row.appendChild(edit);
    c.appendChild(row);
  }
}
let editingFoodId = null;
function openFoodEditor(id) {
  editingFoodId = id || null;
  const f = id ? foods.find(x => x.id === id) : null;
  $('foodEditTitle').textContent = f ? 'Upravit jídlo' : 'Nové vlastní jídlo';
  $('fName').value = f ? f.name : '';
  $('fKcal').value = f ? f.kcal100 : '';
  $('fProt').value = f ? f.prot100 : '';
  $('fCarb').value = f ? f.carb100 : '';
  $('fFat').value = f ? f.fat100 : '';
  $('foodDelete').classList.toggle('hidden', !f);
  openSheet('foodSheet');
}
function saveFood() {
  const name = $('fName').value.trim();
  const kcal100 = parseFloat($('fKcal').value);
  if (!name) { toast('Zadej název'); return; }
  if (isNaN(kcal100)) { toast('Zadej energii (kcal na 100 g)'); return; }
  const data = {
    name, kcal100: r1(kcal100),
    prot100: r1(parseFloat($('fProt').value) || 0),
    carb100: r1(parseFloat($('fCarb').value) || 0),
    fat100: r1(parseFloat($('fFat').value) || 0),
  };
  if (editingFoodId) {
    const f = foods.find(x => x.id === editingFoodId);
    Object.assign(f, data);
  } else {
    foods.unshift({ id: uid(), ...data });
  }
  save(LS.foods, foods);
  closeSheet('foodSheet');
  renderCustomList();
  toast('Uloženo');
}
function deleteFood() {
  if (!editingFoodId) return;
  foods = foods.filter(x => x.id !== editingFoodId);
  save(LS.foods, foods);
  closeSheet('foodSheet');
  renderCustomList();
  toast('Smazáno');
}

/* ---------- Recept z více surovin ---------- */
let recipeMode = false;
let recipeItems = [];
function newRecipe() {
  recipeItems = [];
  $('recipeName').value = '';
  $('recipePortions').value = 1;
  renderRecipe();
  openSheet('recipeSheet');
}
function recipeTotals() {
  return recipeItems.reduce((a, it) => {
    const f = it.grams / 100;
    a.g += it.grams; a.kcal += it.kcal100 * f; a.prot += it.prot100 * f; a.carb += it.carb100 * f; a.fat += it.fat100 * f;
    return a;
  }, { g: 0, kcal: 0, prot: 0, carb: 0, fat: 0 });
}
function renderRecipe() {
  const list = $('recipeList');
  list.innerHTML = '';
  recipeItems.forEach((it, idx) => {
    const row = document.createElement('div');
    row.className = 'wl-row';
    row.innerHTML = `<span>${esc(it.name)} · ${r0(it.grams)} g</span><span class="wl-kg">${r0(it.kcal100 * it.grams / 100)} kcal</span><button class="entry-del" data-ridel="${idx}" aria-label="Odebrat">×</button>`;
    list.appendChild(row);
  });
  const t = recipeTotals();
  const portions = Math.max(parseFloat($('recipePortions').value) || 1, 1);
  $('recipeTotals').innerHTML = recipeItems.length
    ? `Celkem: <b>${r0(t.g)} g</b> · <b>${r0(t.kcal)}</b> kcal · B ${r1(t.prot)} · S ${r1(t.carb)} · T ${r1(t.fat)}<br>` +
      `Na porci (~${r0(t.g / portions)} g): <b>${r0(t.kcal / portions)}</b> kcal`
    : 'Zatím žádná surovina — klepni na „+ Přidat surovinu".';
}
function saveRecipe() {
  if (!recipeItems.length) { toast('Přidej aspoň jednu surovinu'); return; }
  const name = $('recipeName').value.trim();
  if (!name) { toast('Zadej název jídla'); return; }
  const t = recipeTotals();
  if (t.g <= 0) { toast('Suroviny nemají hmotnost'); return; }
  const per = 100 / t.g; // hodnoty na 100 g celého jídla
  foods.unshift({
    id: uid(), name,
    kcal100: r1(t.kcal * per), prot100: r1(t.prot * per),
    carb100: r1(t.carb * per), fat100: r1(t.fat * per),
  });
  save(LS.foods, foods);
  closeSheet('recipeSheet');
  renderCustomList();
  toast('Recept uložen mezi vlastní jídla');
}

/* ---------- Nastavení + záloha ---------- */
function openSettings() {
  $('sKcal').value = settings.kcal;
  $('sProt').value = settings.prot;
  $('sCarb').value = settings.carb;
  $('sFat').value = settings.fat;
  $('sWater').value = settings.waterGoal;
  updateStravaUI();
  openSheet('settingsSheet');
}
function saveSettings() {
  settings = {
    kcal: parseFloat($('sKcal').value) || 0,
    prot: parseFloat($('sProt').value) || 0,
    carb: parseFloat($('sCarb').value) || 0,
    fat: parseFloat($('sFat').value) || 0,
    waterGoal: parseFloat($('sWater').value) || 2000,
  };
  save(LS.settings, settings);
  closeSheet('settingsSheet');
  renderDay();
  toast('Nastavení uloženo');
}
function exportData() {
  const blob = new Blob([JSON.stringify({ foods, log, settings, profile, favorites, weights, water, activity, v: 1 }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kaloricke-tabulky-zaloha-${todayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!d || !Array.isArray(d.log)) throw new Error('bad');
      foods = Array.isArray(d.foods) ? d.foods : [];
      log = d.log;
      settings = d.settings || settings;
      profile = d.profile || profile;
      favorites = Array.isArray(d.favorites) ? d.favorites : favorites;
      weights = Array.isArray(d.weights) ? d.weights : weights;
      water = (d.water && typeof d.water === 'object') ? d.water : water;
      activity = (d.activity && typeof d.activity === 'object') ? d.activity : activity;
      save(LS.foods, foods); save(LS.log, log); save(LS.settings, settings); save(LS.profile, profile);
      save(LS.favorites, favorites); save(LS.weights, weights); save(LS.water, water); save(LS.activity, activity);
      closeSheet('settingsSheet');
      renderDay();
      toast('Data obnovena ze zálohy');
    } catch {
      toast('Soubor se nepodařilo načíst');
    }
  };
  reader.readAsText(file);
}

/* ---------- Kalkulačka cílů ---------- */
let calcSex = 'male';
let calcGoalType = 'lose';
let calcGoals = null;

function setCalcGoalUI() {
  const lbl = { lose: 'Tempo hubnutí', gain: 'Tempo nabírání', maintain: '' }[calcGoalType];
  $('cRateWrap').classList.toggle('hidden', calcGoalType === 'maintain');
  if (lbl) $('cRateLabel').textContent = lbl;
}
function openCalc() {
  calcSex = profile.sex || 'male';
  calcGoalType = profile.goalType || 'lose';
  document.querySelectorAll('#cSex .seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.sex === calcSex));
  document.querySelectorAll('#cGoal .seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.goal === calcGoalType));
  setCalcGoalUI();
  $('cAge').value = profile.age || '';
  $('cHeight').value = profile.height || '';
  $('cWeight').value = profile.weight || '';
  $('cTarget').value = profile.target || '';
  if (profile.activity) $('cActivity').value = profile.activity;
  if (profile.rate) $('cRate').value = profile.rate;
  $('calcResult').classList.add('hidden');
  $('calcApply').classList.add('hidden');
  calcGoals = null;
  openSheet('calcSheet');
}

// Mifflin–St Jeor → BMR, × aktivita → TDEE, ± deficit/přebytek → cíl. Makra: B/T dle váhy, S zbytek.
function computeGoals(p) {
  const bmr = p.sex === 'female'
    ? 10 * p.weight + 6.25 * p.height - 5 * p.age - 161
    : 10 * p.weight + 6.25 * p.height - 5 * p.age + 5;
  const tdee = bmr * p.activity;

  const change = p.rate * 7700 / 7; // kcal/den pro dané tempo (1 kg ≈ 7700 kcal)
  let kcal = tdee;
  let deficit = 0, surplus = 0;
  if (p.goalType === 'lose') { deficit = change; kcal = tdee - deficit; }
  else if (p.goalType === 'gain') { surplus = change; kcal = tdee + surplus; }

  // Bezpečnostní podlaha: nikdy pod BMR ani pod bezpečné minimum.
  const floor = p.sex === 'female' ? 1200 : 1500;
  const minKcal = Math.max(floor, Math.round(bmr));
  let capped = false;
  if (kcal < minKcal) { kcal = minKcal; capped = true; }
  kcal = Math.round(kcal / 10) * 10;

  // Makra: bílkoviny 1,6 g/kg, tuky 0,8 g/kg, sacharidy dopočet.
  let prot = Math.round(1.6 * p.weight);
  let fat = Math.round(0.8 * p.weight);
  let carbKcal = kcal - prot * 4 - fat * 9;
  if (carbKcal < 200) { fat = Math.round(0.6 * p.weight); carbKcal = kcal - prot * 4 - fat * 9; }
  if (carbKcal < 0) { prot = Math.max(Math.round(kcal * 0.35 / 4), 0); carbKcal = kcal - prot * 4 - fat * 9; }
  const carb = Math.max(Math.round(carbKcal / 4), 0);

  const target = p.target || p.weight;
  const weeks = (p.goalType !== 'maintain' && p.rate) ? Math.round(Math.abs(p.weight - target) / p.rate) : 0;
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), deficit: Math.round(deficit), surplus: Math.round(surplus), kcal, prot, carb, fat, capped, minKcal, goalType: p.goalType, weeks };
}

function runCalc() {
  const p = {
    sex: calcSex,
    goalType: calcGoalType,
    age: parseFloat($('cAge').value),
    height: parseFloat($('cHeight').value),
    weight: parseFloat($('cWeight').value),
    target: parseFloat($('cTarget').value),
    activity: parseFloat($('cActivity').value),
    rate: parseFloat($('cRate').value),
  };
  if (!(p.age >= 14 && p.age <= 100)) { toast('Zadej věk (14–100)'); return; }
  if (!(p.height >= 120 && p.height <= 230)) { toast('Zadej výšku v cm (120–230)'); return; }
  if (!(p.weight >= 35 && p.weight <= 300)) { toast('Zadej aktuální váhu (35–300 kg)'); return; }
  if (p.goalType !== 'maintain' && !(p.target >= 35 && p.target <= 300)) { toast('Zadej cílovou váhu (35–300 kg)'); return; }

  profile = p;
  save(LS.profile, profile);

  const g = computeGoals(p);
  calcGoals = g;

  let note = `Udržovací příjem ~${g.tdee} kcal`;
  if (g.goalType === 'lose') note += ` · deficit ~${g.deficit} kcal/den` + (g.weeks ? ` · cíl za ~${g.weeks} týd.` : '');
  else if (g.goalType === 'gain') note += ` · přebytek ~${g.surplus} kcal/den` + (g.weeks ? ` · cíl za ~${g.weeks} týd.` : '');
  else note += ' · udržovací režim';

  $('calcResult').innerHTML =
    `<div class="big-kcal">${g.kcal} kcal<small>doporučený denní cíl energie</small></div>
     <div class="calc-macros">
       <div class="calc-macro p"><div class="cm-val">${g.prot} g</div><div class="cm-lab">Bílkoviny</div></div>
       <div class="calc-macro c"><div class="cm-val">${g.carb} g</div><div class="cm-lab">Sacharidy</div></div>
       <div class="calc-macro f"><div class="cm-val">${g.fat} g</div><div class="cm-lab">Tuky</div></div>
     </div>
     <div class="calc-note">${note}</div>` +
     (g.capped ? `<div class="calc-warn">Pro bezpečí jsme cíl nesnížili pod ${g.minKcal} kcal — nižší příjem už se nedoporučuje. Zpomal tempo, nebo přidej pohyb.</div>` : '');
  $('calcResult').classList.remove('hidden');
  $('calcApply').classList.remove('hidden');
}

function applyCalc() {
  if (!calcGoals) return;
  settings = { kcal: calcGoals.kcal, prot: calcGoals.prot, carb: calcGoals.carb, fat: calcGoals.fat };
  save(LS.settings, settings);
  // promítnout i do políček v Nastavení
  $('sKcal').value = settings.kcal; $('sProt').value = settings.prot;
  $('sCarb').value = settings.carb; $('sFat').value = settings.fat;
  closeSheet('calcSheet');
  renderDay();
  toast('Cíle nastaveny podle výpočtu');
}

/* ---------- Pitný režim ---------- */
function renderWater() {
  const ml = water[currentDate] || 0;
  const goal = settings.waterGoal || 2000;
  $('waterVal').textContent = `${ml} / ${goal} ml`;
  $('waterBar').style.width = (goal > 0 ? Math.min(ml / goal, 1) * 100 : 0) + '%';
}
function addWater(delta) {
  const ml = Math.max((water[currentDate] || 0) + delta, 0);
  if (ml === 0) delete water[currentDate]; else water[currentDate] = ml;
  save(LS.water, water);
  renderWater();
}

/* ---------- Aktivita (spálené kalorie) ---------- */
function renderActivity() {
  const kcal = activity[currentDate] || 0;
  $('activityVal').textContent = `${r0(kcal)} kcal spáleno`;
  const inp = $('activityInput');
  if (inp && document.activeElement !== inp) inp.value = kcal > 0 ? r0(kcal) : '';
  const btn = $('activitySync');
  if (btn) btn.textContent = strava ? '⟳ Strava' : '＋ Strava';
}
function addActivity(delta) {
  setActivityKcal(Math.max((activity[currentDate] || 0) + delta, 0));
}
function setActivityKcal(kcal) {
  kcal = Math.max(Math.round(kcal) || 0, 0);
  if (kcal === 0) delete activity[currentDate]; else activity[currentDate] = kcal;
  save(LS.activity, activity);
  renderDay();
}

/* ---------- Strava (automatické načtení aktivity) ---------- */
async function stravaConfig() {
  try { const r = await fetch('/api/strava/config'); if (r.ok) return (await r.json()).clientId; } catch {}
  return null;
}
async function connectStrava() {
  const clientId = await stravaConfig();
  if (!clientId) {
    toast('Strava zatím není nastavená — dokonči nastavení podle návodu.');
    return;
  }
  const redirect = location.origin + '/';
  const url = 'https://www.strava.com/oauth/authorize?' + new URLSearchParams({
    client_id: clientId, response_type: 'code', redirect_uri: redirect,
    approval_prompt: 'auto', scope: 'activity:read_all',
  });
  location.href = url;
}
// Po návratu z autorizace přijde ?code=... — vyměníme za token.
async function handleStravaRedirect() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!code || !params.get('scope')) return;
  history.replaceState(null, '', location.pathname); // uklidit URL
  try {
    const r = await fetch('/api/strava/exchange?code=' + encodeURIComponent(code));
    const d = await r.json();
    if (d.refresh_token) {
      strava = { refresh: d.refresh_token, athlete: d.athlete || '' };
      save(LS.strava, strava);
      toast('Strava propojena' + (d.athlete ? ` (${d.athlete})` : ''));
      updateStravaUI();
      syncStrava(true);
    } else {
      toast('Propojení se Stravou se nepovedlo.');
    }
  } catch { toast('Propojení se Stravou se nepovedlo.'); }
}
async function syncStrava(silent) {
  if (!strava || !strava.refresh) { connectStrava(); return; }
  if (!silent) toast('Načítám aktivitu ze Stravy…');
  const after = Math.floor((Date.now() - 8 * 86400000) / 1000); // posledních ~8 dní
  try {
    const r = await fetch(`/api/strava/sync?refresh=${encodeURIComponent(strava.refresh)}&after=${after}`);
    const d = await r.json();
    if (d.error) { toast('Strava: ' + d.error); return; }
    if (d.refresh_token && d.refresh_token !== strava.refresh) {
      strava.refresh = d.refresh_token; save(LS.strava, strava);
    }
    let added = 0;
    Object.entries(d.byDay || {}).forEach(([day, kcal]) => {
      if (kcal > 0) { activity[day] = kcal; added += kcal; }
    });
    save(LS.activity, activity);
    renderDay();
    toast(added > 0 ? `Načteno ${r0(added)} kcal z aktivit` : 'Žádné nové tréninky ve Stravě');
  } catch { toast('Nepodařilo se načíst data ze Stravy.'); }
}
function disconnectStrava() {
  strava = null;
  localStorage.removeItem(LS.strava);
  updateStravaUI();
  renderActivity();
  toast('Strava odpojena');
}
function updateStravaUI() {
  const wrap = $('stravaStatus');
  if (!wrap) return;
  if (strava) {
    wrap.innerHTML = `<div class="hint">✅ Propojeno se Stravou${strava.athlete ? ` (${esc(strava.athlete)})` : ''}.</div>` +
      `<button id="stravaSyncBtn" class="ghost">⟳ Načíst aktivitu teď</button>` +
      `<button id="stravaDisconnect" class="ghost">Odpojit Stravu</button>`;
    $('stravaSyncBtn').addEventListener('click', () => syncStrava(false));
    $('stravaDisconnect').addEventListener('click', disconnectStrava);
  } else {
    wrap.innerHTML = `<button id="stravaConnect" class="ghost">🔗 Propojit se Stravou</button>` +
      `<p class="hint small">Automaticky načte spálené kalorie z tvých tréninků. Potřebuje jednorázové nastavení (návod ti dal Claude).</p>`;
    $('stravaConnect').addEventListener('click', connectStrava);
  }
}

/* ---------- Váha a graf ---------- */
function openWeight() {
  $('weightInput').value = '';
  renderWeightChart();
  renderWeightList();
  openSheet('weightSheet');
}
function saveWeight() {
  const kg = parseFloat($('weightInput').value);
  if (!(kg >= 20 && kg <= 400)) { toast('Zadej váhu (20–400 kg)'); return; }
  const today = todayKey();
  const ex = weights.find(w => w.date === today);
  if (ex) ex.kg = kg; else weights.push({ date: today, kg });
  weights.sort((a, b) => a.date < b.date ? -1 : 1);
  save(LS.weights, weights);
  profile.weight = kg; save(LS.profile, profile); // pro kalkulačku cílů
  $('weightInput').value = '';
  renderWeightChart();
  renderWeightList();
  toast('Váha uložena');
}
function deleteWeight(date) {
  weights = weights.filter(w => w.date !== date);
  save(LS.weights, weights);
  renderWeightChart();
  renderWeightList();
}
function renderWeightChart() {
  const el = $('weightChart');
  const data = weights.slice(-30);
  if (data.length < 2) {
    el.innerHTML = '<div class="ov-empty">Zapiš aspoň dvě vážení a ukáže se graf vývoje.</div>';
    return;
  }
  const kgs = data.map(w => w.kg);
  const min = Math.min(...kgs), max = Math.max(...kgs);
  const pad = (max - min) * 0.2 || 1;
  const lo = min - pad, hi = max + pad;
  const W = 320, H = 120, L = 6, R = 6, T = 8, B = 8;
  const x = i => L + (W - L - R) * (data.length === 1 ? 0.5 : i / (data.length - 1));
  const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const pts = data.map((w, i) => `${x(i).toFixed(1)},${y(w.kg).toFixed(1)}`).join(' ');
  const dots = data.map((w, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(w.kg).toFixed(1)}" r="2.5" fill="var(--brand)"/>`).join('');
  const diff = r1(data[data.length - 1].kg - data[0].kg);
  el.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" class="wc-svg"><polyline points="${pts}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}</svg>` +
    `<div class="wc-legend"><span>${data[0].kg} kg</span><span class="${diff <= 0 ? 'down' : 'up'}">${diff > 0 ? '+' : ''}${diff} kg</span><span>${data[data.length - 1].kg} kg</span></div>`;
}
function renderWeightList() {
  const el = $('weightList');
  el.innerHTML = '';
  [...weights].reverse().slice(0, 30).forEach(w => {
    const row = document.createElement('div');
    row.className = 'wl-row';
    row.innerHTML = `<span>${dateHuman(w.date)}</span><span class="wl-kg">${w.kg} kg</span><button class="entry-del" data-wdel="${w.date}" aria-label="Smazat">×</button>`;
    el.appendChild(row);
  });
}

/* ---------- Týdenní přehled ---------- */
function openOverview() { renderOverview(); openSheet('overviewSheet'); }
function renderOverview() {
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(todayKey(d)); }
  const perDay = days.map(k => ({ key: k, kcal: sumNutri(log.filter(e => e.date === k)).kcal }));
  const logged = perDay.filter(d => d.kcal > 0);
  const avg = logged.length ? Math.round(logged.reduce((a, d) => a + d.kcal, 0) / logged.length) : 0;
  let streak = 0;
  for (let i = perDay.length - 1; i >= 0; i--) { if (perDay[i].kcal > 0) streak++; else break; }
  $('overviewStats').innerHTML =
    `<div class="ov-tile"><div class="ov-num">${avg}</div><div class="ov-lab">Ø kcal/den</div></div>` +
    `<div class="ov-tile"><div class="ov-num">${logged.length}/7</div><div class="ov-lab">dní zapsáno</div></div>` +
    `<div class="ov-tile"><div class="ov-num">${streak}</div><div class="ov-lab">série dní</div></div>`;
  const goal = settings.kcal || 0;
  const maxV = Math.max(goal, ...perDay.map(d => d.kcal), 1);
  const dny = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  const cols = perDay.map(d => {
    const h = Math.round((d.kcal / maxV) * 100);
    const over = goal && d.kcal > goal;
    return `<div class="ov-col"><div class="ov-bar ${over ? 'over' : ''}" style="height:${h}%"></div></div>`;
  }).join('');
  const labels = perDay.map(d => {
    const lab = dny[new Date(d.key + 'T12:00:00').getDay()];
    return `<div class="ov-col2"><span>${lab}</span><small>${d.kcal ? r0(d.kcal) : '–'}</small></div>`;
  }).join('');
  const goalLine = goal ? `<div class="ov-goal" style="bottom:${Math.round((goal / maxV) * 100)}%"></div>` : '';
  $('overviewChart').innerHTML = `<div class="ov-plot">${goalLine}${cols}</div><div class="ov-xlabels">${labels}</div>`;
}

/* ---------- Kalendář ---------- */
let calYear, calMonth;
const MONTHS_CS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];

let calMode = 'nav';
function openCalendar(mode) {
  calMode = mode === 'copy' ? 'copy' : 'nav';
  $('calTitle').textContent = calMode === 'copy' ? 'Odkud zkopírovat?' : 'Kalendář';
  const d = new Date(currentDate + 'T12:00:00');
  calYear = d.getFullYear();
  calMonth = d.getMonth();
  renderCalendar();
  openSheet('calendarSheet');
}
// Zkopíruje jídla z jiného dne do aktuálního.
function copyDayEntries(sourceKey) {
  const src = log.filter(e => e.date === sourceKey);
  if (!src.length) { toast('V ten den nic nebylo'); return; }
  src.forEach(e => log.push({ ...e, id: uid(), date: currentDate }));
  save(LS.log, log);
  renderDay();
  toast(`Zkopírováno ${src.length} položek z ${dateHuman(sourceKey)}`);
}
function calShiftMonth(delta) {
  calMonth += delta;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}
function renderCalendar() {
  $('calMonthLabel').textContent = `${MONTHS_CS[calMonth]} ${calYear}`;
  const grid = $('calGrid');
  grid.innerHTML = '';
  const datesWithLog = new Set(log.map(e => e.date));
  const startIdx = (new Date(calYear, calMonth, 1).getDay() + 6) % 7; // pondělní start
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = todayKey();
  for (let i = 0; i < startIdx; i++) {
    const b = document.createElement('div');
    b.className = 'cal-day blank';
    grid.appendChild(b);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const b = document.createElement('button');
    b.className = 'cal-day';
    if (key === today) b.classList.add('today');
    if (key === currentDate) b.classList.add('selected');
    if (key > today) b.classList.add('future');
    b.innerHTML = `${day}${datesWithLog.has(key) ? '<span class="dot"></span>' : ''}`;
    b.addEventListener('click', () => {
      if (calMode === 'copy') {
        if (key === currentDate) { toast('To je aktuální den'); return; }
        copyDayEntries(key);
      } else {
        currentDate = key;
        renderDay();
      }
      calMode = 'nav';
      closeSheet('calendarSheet');
    });
    grid.appendChild(b);
  }
}

/* ---------- Události ---------- */
$('prevDay').addEventListener('click', () => shiftDate(-1));
$('nextDay').addEventListener('click', () => shiftDate(1));
$('dayLabel').addEventListener('click', openCalendar);
$('copyDayBtn').addEventListener('click', () => openCalendar('copy'));
$('calendarBack').addEventListener('click', () => closeSheet('calendarSheet'));
$('calPrev').addEventListener('click', () => calShiftMonth(-1));
$('calNext').addEventListener('click', () => calShiftMonth(1));
$('calToday').addEventListener('click', () => { currentDate = todayKey(); renderDay(); closeSheet('calendarSheet'); });
$('openSettings').addEventListener('click', openSettings);

$('meals').addEventListener('click', e => {
  const add = e.target.closest('[data-meal]');
  if (add) return openAdd(add.dataset.meal);
  const del = e.target.closest('[data-del]');
  if (del) {
    log = log.filter(x => x.id !== del.dataset.del);
    save(LS.log, log);
    renderDay();
    toast('Odebráno');
    return;
  }
  const edit = e.target.closest('[data-edit]');
  if (edit) return editEntry(edit.dataset.edit);
});

$('addBack').addEventListener('click', () => {
  stopScan();
  closeSheet('addSheet');
  if (recipeMode) { recipeMode = false; openSheet('recipeSheet'); } // zpět na recept, když ruším přidání suroviny
});
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
$('searchBtn').addEventListener('click', doSearch);
$('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

$('scanStart').addEventListener('click', () => { if (scanStream) stopScan(); else startScan(); });

$('portionBack').addEventListener('click', () => { editingEntryId = null; closeSheet('portionSheet'); });
$('portionGrams').addEventListener('input', updatePortionPreview);
$('portionSave').addEventListener('click', savePortion);
$('portionFav').addEventListener('click', () => {
  if (!pendingFood) return;
  toggleFav(pendingFood);
  $('portionFav').textContent = isFav(pendingFood) ? '★ Oblíbené' : '☆ Přidat k oblíbeným';
  toast(isFav(pendingFood) ? 'Přidáno k oblíbeným' : 'Odebráno z oblíbených');
});
$('quickPortions').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  $('portionGrams').value = chip.dataset.g;
  updatePortionPreview();
});
$('qSave').addEventListener('click', saveQuickKcal);

$('newCustom').addEventListener('click', () => openFoodEditor(null));
$('foodBack').addEventListener('click', () => closeSheet('foodSheet'));
$('foodSave').addEventListener('click', saveFood);
$('foodDelete').addEventListener('click', deleteFood);

$('newRecipe').addEventListener('click', () => { closeSheet('addSheet'); newRecipe(); });
$('recipeBack').addEventListener('click', () => closeSheet('recipeSheet'));
$('recipeAdd').addEventListener('click', () => { recipeMode = true; openAdd('snack_pm'); });
$('recipeSave').addEventListener('click', saveRecipe);
$('recipePortions').addEventListener('input', renderRecipe);
$('recipeList').addEventListener('click', e => {
  const b = e.target.closest('[data-ridel]');
  if (b) { recipeItems.splice(parseInt(b.dataset.ridel, 10), 1); renderRecipe(); }
});

document.querySelectorAll('.water-btns').forEach(row => row.addEventListener('click', e => {
  const w = e.target.closest('[data-water]');
  if (w) return addWater(parseInt(w.dataset.water, 10));
  const a = e.target.closest('[data-activity]');
  if (a) return addActivity(parseInt(a.dataset.activity, 10));
}));
$('activitySync').addEventListener('click', () => syncStrava(false));
$('activitySet').addEventListener('click', () => {
  setActivityKcal(parseFloat($('activityInput').value) || 0);
  $('activityInput').blur();
  toast('Aktivita zapsána');
});
$('activityInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('activitySet').click(); });

$('openWeight').addEventListener('click', openWeight);
$('weightBack').addEventListener('click', () => closeSheet('weightSheet'));
$('weightSave').addEventListener('click', saveWeight);
$('weightInput').addEventListener('keydown', e => { if (e.key === 'Enter') saveWeight(); });
$('weightList').addEventListener('click', e => {
  const b = e.target.closest('[data-wdel]');
  if (b) deleteWeight(b.dataset.wdel);
});
$('openOverview').addEventListener('click', openOverview);
$('overviewBack').addEventListener('click', () => closeSheet('overviewSheet'));

$('settingsBack').addEventListener('click', () => closeSheet('settingsSheet'));
$('settingsSave').addEventListener('click', saveSettings);
$('exportData').addEventListener('click', exportData);
$('importData').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); });

$('openCalc').addEventListener('click', openCalc);
$('calcBack').addEventListener('click', () => closeSheet('calcSheet'));
$('calcRun').addEventListener('click', runCalc);
$('calcApply').addEventListener('click', applyCalc);
document.querySelectorAll('#cSex .seg-btn').forEach(b => b.addEventListener('click', () => {
  calcSex = b.dataset.sex;
  document.querySelectorAll('#cSex .seg-btn').forEach(x => x.classList.toggle('active', x === b));
}));
document.querySelectorAll('#cGoal .seg-btn').forEach(b => b.addEventListener('click', () => {
  calcGoalType = b.dataset.goal;
  document.querySelectorAll('#cGoal .seg-btn').forEach(x => x.classList.toggle('active', x === b));
  setCalcGoalUI();
}));

// Klepnutí na tmavé pozadí sheetu = zavřít
document.querySelectorAll('.sheet').forEach(s => {
  s.addEventListener('click', e => { if (e.target === s) { stopScan(); s.classList.add('hidden'); } });
});

/* ---------- Service worker ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ---------- Start ---------- */
renderDay();
handleStravaRedirect(); // pokud se vracíme z autorizace Stravy
