# Le Fil

Revue de presse du portefeuille, hébergée sur Cloudflare Pages.

- `public/` : la page (index.html, app.js), les analyses (`data.json`, mises à jour par Claude matin et soir) et les en-têtes de sécurité (`_headers`).
- `functions/api/news.js` : la fonction Cloudflare qui agrège les titres d'actualité en direct (Google News, plus Finnhub si la clé est définie), avec un cache de 5 minutes.

## Réglages Cloudflare Pages

- Framework preset : **None**
- Build command : *(vide)*
- Build output directory : **public**
- Variable d'environnement facultative : `FINNHUB_KEY` (clé gratuite sur finnhub.io), à déclarer comme **Secret**.
