// Cloudflare Pages Function : GET /api/news
// Agrège les derniers titres d'actualité des 18 valeurs.
// Sources : Google News et Yahoo Finance (RSS publics, sans clé) + Finnhub (facultatif, si la variable FINNHUB_KEY est définie).
// Résultat mis en cache 5 minutes au niveau de Cloudflare pour rester rapide et sobre.

const TICKERS = [
  { t: "SPCX",  q: '"SpaceX" stock OR shares',            lang: "en", fh: "SPCX" },
  { t: "TE",    q: '"T1 Energy"',                          lang: "en", fh: "TE" },
  { t: "IREN",  q: '"IREN" stock OR "IREN Limited"',       lang: "en", fh: "IREN" },
  { t: "ASTI",  q: '"Ascent Solar"',                       lang: "en", fh: "ASTI" },
  { t: "ASTS",  q: '"AST SpaceMobile"',                    lang: "en", fh: "ASTS" },
  { t: "HLIT",  q: '"Harmonic" HLIT',                      lang: "en", fh: "HLIT" },
  { t: "POET",  q: '"POET Technologies"',                  lang: "en", fh: "POET" },
  { t: "RDW",   q: '"Redwire"',                            lang: "en", fh: "RDW" },
  { t: "RKLB",  q: '"Rocket Lab"',                         lang: "en", fh: "RKLB" },
  { t: "PLTR",  q: '"Palantir"',                           lang: "en", fh: "PLTR" },
  { t: "RDDT",  q: '"Reddit" stock OR shares OR RDDT',     lang: "en", fh: "RDDT" },
  { t: "ONDS",  q: '"Ondas"',                              lang: "en", fh: "ONDS" },
  { t: "ALRIB", q: '"Riber" bourse OR action OR semi-conducteurs', lang: "fr" },
  { t: "MC",    q: '"LVMH" bourse OR action',              lang: "fr" },
  { t: "FDJU",  q: '"FDJ United"',                         lang: "fr" },
  { t: "ADYEN", q: '"Adyen"',                              lang: "en" },
  { t: "AMUN",  q: '"Amundi"',                             lang: "fr" },
  { t: "ASML",  q: '"ASML"',                               lang: "en", fh: "ASML" },
];

const YAHOO = {"SPCX": "SPCX", "TE": "TE", "IREN": "IREN", "ASTI": "ASTI", "ASTS": "ASTS", "HLIT": "HLIT", "POET": "POET", "RDW": "RDW", "RKLB": "RKLB", "PLTR": "PLTR", "RDDT": "RDDT", "ONDS": "ONDS", "ALRIB": "ALRIB.PA", "MC": "MC.PA", "FDJU": "FDJU.PA", "ADYEN": "ADYEN.AS", "AMUN": "AMUN.PA", "ASML": "ASML"};

const MAX_AGE_H = 72;      // on garde 3 jours d'actualité
const PER_TICKER = 6;      // titres max par valeur
const CACHE_SECONDS = 300; // 5 minutes

function gnewsUrl(q, lang) {
  const query = encodeURIComponent(q + " when:3d");
  return lang === "fr"
    ? `https://news.google.com/rss/search?q=${query}&hl=fr&gl=FR&ceid=FR:fr`
    : `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
}

function decode(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .trim();
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
}

export function parseRss(xml, ticker) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    let title = tag(b, "title");
    const source = tag(b, "source");
    // Google News ajoute " - Source" à la fin du titre : on le retire
    if (source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));
    const link = tag(b, "link");
    const ts = Date.parse(tag(b, "pubDate"));
    if (!title || !link || !ts) continue;
    items.push({ t: ticker, title, url: link, source: source || "Google News", ts });
  }
  return items;
}

const DIAG = {};
// Cloudflare limite le nombre de requêtes sortantes par appel (50 en offre gratuite) :
// Google (18) + Yahoo (18 ou 6) + Finnhub (0 ou 12) + 4 accès au cache restent en dessous.
// Le dernier résultat valable de chaque source est gardé dans UNE seule entrée de cache.
const LASTGOOD = "/__lastgood/v1";
async function fromYahoo(x) {
  const sym = YAHOO[x.t]; if (!sym) return [];
  const fr = /\.(PA|AS)$/.test(sym);
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}&region=${fr ? "FR" : "US"}&lang=${fr ? "fr-FR" : "en-US"}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (LeFil personal news reader)" }, cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true }, signal: AbortSignal.timeout(5000) });
    DIAG["Y_" + x.t] = r.status;
    if (!r.ok) return [];
    return parseRss(await r.text(), x.t).map((n) => ({ ...n, source: n.source === "Google News" ? "Yahoo Finance" : n.source }));
  } catch (e) { DIAG["Y_" + x.t] = String(e).slice(0, 60); return []; }
}

async function fromGoogle(x) {
  try {
    const r = await fetch(gnewsUrl(x.q, x.lang), {
      headers: { "User-Agent": "Mozilla/5.0 (LeFil personal news reader)", "Accept": "application/rss+xml,text/xml" },
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
      signal: AbortSignal.timeout(5000),
    });
    DIAG[x.t] = r.status;
    if (r.ok) return parseRss(await r.text(), x.t);
  } catch (e) { DIAG[x.t] = String(e).slice(0, 60); }
  return [];
}
// Lance les requêtes par petits groupes pour ne pas être bridé par Google News
async function inBatches(list, size, fn) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(...(await Promise.all(list.slice(i, i + size).map(fn))));
  return out;
}

async function fromFinnhub(x, key) {
  if (!key || !x.fh) return [];
  const to = new Date(), from = new Date(Date.now() - MAX_AGE_H * 3600e3);
  const d = (dt) => dt.toISOString().slice(0, 10);
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${x.fh}&from=${d(from)}&to=${d(to)}&token=${key}`,
      { cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true }, signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) return [];
    const j = await r.json();
    return (Array.isArray(j) ? j : []).map((n) => ({
      t: x.t, title: n.headline, url: n.url, source: n.source || "Finnhub", ts: (n.datetime || 0) * 1000,
    })).filter((n) => n.title && n.url && n.ts);
  } catch { return []; }
}

function norm(s) { return s.toLowerCase().replace(/[^a-z0-9àâçéèêëîïôûùüÿœ ]/gi, "").replace(/\s+/g, " ").trim().slice(0, 70); }

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/news?v=1", request.url).toString());
  const hit = new URL(request.url).searchParams.has("debug") ? null : await cache.match(cacheKey);
  if (hit) return hit;

  const debug = new URL(request.url).searchParams.has("debug");
  const hasFh = !!env.FINNHUB_KEY;
  const lgReq = new Request(new URL(LASTGOOD, request.url).toString());
  const lgHit = await cache.match(lgReq);
  const prev = lgHit ? await lgHit.json() : {};
  const [g, y, f] = await Promise.all([
    inBatches(TICKERS, 9, fromGoogle),
    inBatches(TICKERS.filter((x) => !(hasFh && x.fh)), 18, fromYahoo),
    Promise.all(TICKERS.map((x) => fromFinnhub(x, env.FINNHUB_KEY))),
  ]);
  // Remplace chaque source en échec par son dernier résultat valable
  const store = {};
  const keep = (key, items) => { const v = items.length ? items : (prev[key] || []); if (v.length) store[key] = v; return v; };
  const yT = TICKERS.filter((x) => !(hasFh && x.fh));
  const lists = [
    ...g.map((r, i) => keep("g/" + TICKERS[i].t, r)),
    ...y.map((r, i) => keep("y/" + yT[i].t, r)),
    ...f,
  ];
  waitUntil(cache.put(lgReq, new Response(JSON.stringify(store), { headers: { "Cache-Control": "public, max-age=86400" } })));
  const cutoff = Date.now() - MAX_AGE_H * 3600e3;
  const seen = new Set();
  const perTicker = {};
  const items = lists.flat()
    .filter((n) => n.ts >= cutoff && n.ts <= Date.now() + 3600e3)
    .sort((a, b) => b.ts - a.ts)
    .filter((n) => {
      const k = n.t + "|" + norm(n.title);
      if (seen.has(k)) return false;
      seen.add(k);
      perTicker[n.t] = (perTicker[n.t] || 0) + 1;
      return perTicker[n.t] <= PER_TICKER;
    })
    .map((n) => ({ ...n, url: /^https?:\/\//.test(n.url) ? n.url : "" }))
    .filter((n) => n.url);

  if (debug) { const c = {}; items.forEach((n) => (c[n.t] = (c[n.t] || 0) + 1)); return new Response(JSON.stringify({ diag: DIAG, finnhub: !!env.FINNHUB_KEY, n: items.length, perTicker: c }), { headers: { "Content-Type": "application/json" } }); }
  const res = new Response(JSON.stringify({ generated: Date.now(), items }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=60, s-maxage=${CACHE_SECONDS}`,
    },
  });
  waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
