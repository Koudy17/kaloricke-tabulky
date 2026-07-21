'use strict';

/* ---------- Úložiště ---------- */
const LS = {
  foods: 'kt_foods',
  log: 'kt_log',
  settings: 'kt_settings',
};
const load = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let foods = load(LS.foods, []);            // vlastní jídla
let log = load(LS.log, []);                // deníkové záznamy
let settings = load(LS.settings, { kcal: 2000, prot: 100, carb: 250, fat: 65 });

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
  { id: 'lunch', label: 'Oběd' },
  { id: 'dinner', label: 'Večeře' },
  { id: 'snack', label: 'Svačina' },
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
  $('dayLabel').textContent = dateHuman(currentDate);
  const entries = dayEntries();
  const tot = sumNutri(entries);

  // Prstenec
  $('kcalNow').textContent = r0(tot.kcal);
  $('kcalGoal').textContent = r0(settings.kcal);
  const circ = 2 * Math.PI * 52; // 326.7
  const frac = settings.kcal > 0 ? Math.min(tot.kcal / settings.kcal, 1) : 0;
  const ring = $('ringProgress');
  ring.style.strokeDashoffset = String(circ * (1 - frac));
  ring.style.stroke = tot.kcal > settings.kcal ? 'var(--danger)' : 'var(--brand)';

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
          <div class="entry-main">
            <div class="entry-name">${esc(e.name)}</div>
            <div class="entry-sub">${r0(e.grams)} g · B ${r1(n.prot)} · S ${r1(n.carb)} · T ${r1(n.fat)}</div>
          </div>
          <span class="entry-kcal">${r0(n.kcal)}</span>
          <button class="entry-del" data-del="${e.id}" aria-label="Smazat">×</button>`;
        el.appendChild(row);
      }
    }
    wrap.appendChild(el);
  }
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
let pendingMeal = 'snack';
let pendingFood = null; // {name, kcal100, prot100, carb100, fat100, source}

function openAdd(meal) {
  pendingMeal = meal || 'snack';
  switchTab('search');
  $('searchResults').innerHTML = '';
  $('searchStatus').textContent = '';
  renderCustomList();
  openSheet('addSheet');
  setTimeout(() => $('searchInput').focus(), 150);
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== name));
  if (name !== 'scan') stopScan();
}

function pickFood(food) {
  pendingFood = food;
  $('portionName').textContent = food.name;
  $('portionPer100').textContent =
    `Na 100 g: ${r0(food.kcal100)} kcal · B ${r1(food.prot100)} · S ${r1(food.carb100)} · T ${r1(food.fat100)}`;
  $('portionGrams').value = 100;
  $('portionMeal').value = pendingMeal;
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
}
function savePortion() {
  const g = parseFloat($('portionGrams').value);
  if (!g || g <= 0) { toast('Zadej množství v gramech'); return; }
  log.push({
    id: uid(), date: currentDate, meal: $('portionMeal').value,
    name: pendingFood.name, grams: g,
    kcal100: pendingFood.kcal100 || 0, prot100: pendingFood.prot100 || 0,
    carb100: pendingFood.carb100 || 0, fat100: pendingFood.fat100 || 0,
  });
  save(LS.log, log);
  closeSheet('portionSheet');
  closeSheet('addSheet');
  renderDay();
  toast('Přidáno do deníku');
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
  return {
    name,
    kcal100: r1(kcal),
    prot100: r1(+n.proteins_100g || 0),
    carb100: r1(+n.carbohydrates_100g || 0),
    fat100: r1(+n.fat_100g || 0),
    source: 'off',
  };
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
      if (data && Array.isArray(data.hits)) return data.hits.map(offToFood).filter(Boolean);
    }
  } catch { /* vlastní proxy není k dispozici → zkusíme veřejné níže */ }

  // 2) Záloha: veřejné CORS proxy na Search-a-licious (funguje i na GitHub Pages).
  const url = 'https://search.openfoodfacts.org/search?' + new URLSearchParams({
    q, page_size: '25',
    fields: 'code,product_name,product_name_cs,generic_name,brands,nutriments',
  });
  const data = await fetchViaProxies(url, 9000);
  return (data.hits || []).map(offToFood).filter(Boolean);
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
    const b = document.createElement('button');
    b.className = 'result';
    b.innerHTML = `
      <div class="result-main">
        <div class="result-name">${esc(f.name)}</div>
        <div class="result-sub">B ${r1(f.prot100)} · S ${r1(f.carb100)} · T ${r1(f.fat100)} / 100 g</div>
      </div>
      <span class="result-kcal">${r0(f.kcal100)} kcal</span>`;
    b.addEventListener('click', () => pickFood(f));
    container.appendChild(b);
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

/* ---------- Nastavení + záloha ---------- */
function openSettings() {
  $('sKcal').value = settings.kcal;
  $('sProt').value = settings.prot;
  $('sCarb').value = settings.carb;
  $('sFat').value = settings.fat;
  openSheet('settingsSheet');
}
function saveSettings() {
  settings = {
    kcal: parseFloat($('sKcal').value) || 0,
    prot: parseFloat($('sProt').value) || 0,
    carb: parseFloat($('sCarb').value) || 0,
    fat: parseFloat($('sFat').value) || 0,
  };
  save(LS.settings, settings);
  closeSheet('settingsSheet');
  renderDay();
  toast('Nastavení uloženo');
}
function exportData() {
  const blob = new Blob([JSON.stringify({ foods, log, settings, v: 1 }, null, 2)], { type: 'application/json' });
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
      save(LS.foods, foods); save(LS.log, log); save(LS.settings, settings);
      closeSheet('settingsSheet');
      renderDay();
      toast('Data obnovena ze zálohy');
    } catch {
      toast('Soubor se nepodařilo načíst');
    }
  };
  reader.readAsText(file);
}

/* ---------- Události ---------- */
$('prevDay').addEventListener('click', () => shiftDate(-1));
$('nextDay').addEventListener('click', () => shiftDate(1));
$('dayLabel').addEventListener('click', () => { currentDate = todayKey(); renderDay(); });
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
  }
});

$('addBack').addEventListener('click', () => { stopScan(); closeSheet('addSheet'); });
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
$('searchBtn').addEventListener('click', doSearch);
$('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

$('scanStart').addEventListener('click', () => { if (scanStream) stopScan(); else startScan(); });

$('portionBack').addEventListener('click', () => closeSheet('portionSheet'));
$('portionGrams').addEventListener('input', updatePortionPreview);
$('portionSave').addEventListener('click', savePortion);

$('newCustom').addEventListener('click', () => openFoodEditor(null));
$('foodBack').addEventListener('click', () => closeSheet('foodSheet'));
$('foodSave').addEventListener('click', saveFood);
$('foodDelete').addEventListener('click', deleteFood);

$('settingsBack').addEventListener('click', () => closeSheet('settingsSheet'));
$('settingsSave').addEventListener('click', saveSettings);
$('exportData').addEventListener('click', exportData);
$('importData').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); });

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
