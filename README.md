# Kalorické tabulky 🥗

Jednoduchá appka na počítání kalorií a maker — náhrada za placené appky. Zdarma, bez účtů, data zůstávají v tvém telefonu.

## Co umí
- 📅 **Denní deník** rozdělený na snídani, oběd, večeři a svačinu
- 🎯 **Prstenec kalorií** + progres bary pro bílkoviny / sacharidy / tuky vůči denním cílům
- 🔍 **Vyhledávání jídel** z databáze [OpenFoodFacts](https://openfoodfacts.org) (zdarma, i české produkty)
- 📷 **Sken čárového kódu** (funguje na Androidu v Chrome; jinde stačí vyhledávání)
- ✏️ **Vlastní jídla** — ulož si vlastní recepty nebo produkty, které v databázi nejsou
- 💾 **Data lokálně** v prohlížeči (localStorage) + **záloha/obnova** do JSON souboru
- 📱 **PWA** — přidej si to na plochu telefonu jako appku, funguje i offline (kromě vyhledávání)

## Spuštění lokálně
Potřebuješ Node.js:

```bash
node server.js
# otevři http://localhost:8777
```

(`server.js` je jen malý dev server pro náhled — pro nasazení není potřeba.)

## Nasazení zdarma
Je to čistě statický web (žádný backend), takže ho hodíš kamkoli:

- **Netlify / Vercel / Cloudflare Pages** — přetáhni složku nebo připoj Git repo. Hotovo.
- **GitHub Pages** — nahraj soubory do repa a zapni Pages.

Pro sken čárových kódů a PWA je potřeba **HTTPS** — všechny služby výše ho dávají automaticky.

⚠️ Nasazuj **bez** `server.js` (ten je jen pro lokální náhled).

## Soubory
| Soubor | K čemu |
|---|---|
| `index.html` | struktura appky |
| `styles.css` | vzhled (světlý i tmavý režim) |
| `app.js` | veškerá logika |
| `manifest.webmanifest` | PWA manifest |
| `sw.js` | service worker (offline) |
| `icon.svg` | ikona |
| `server.js` | lokální dev server (nenasazovat) |

## Data & soukromí
Všechna data (deník, vlastní jídla, cíle) jsou jen v tomhle prohlížeči. Nikam se neposílají. Při vyhledávání se posílá jen text dotazu / čárový kód do OpenFoodFacts. Před vymazáním historie prohlížeče nebo přenosem na jiný telefon použij **Nastavení → Zálohovat data**.

Data jídel: OpenFoodFacts, licence ODbL.
