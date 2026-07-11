# Documentation technique — FluentDB

Public : développeurs et intégrateurs. Couvre l'installation, la configuration,
la référence de l'API HTTP et l'extension du produit (moteurs, providers IA).

## 1. Prérequis

- Node.js ≥ 20 (développé et testé sous Node 22).
- npm 10+ (workspaces).
- Optionnel : un démon Docker pour la détection de conteneurs ; une clé API
  Gemini pour l'assistant IA.

## 2. Installation et scripts

```bash
npm install
cp .env.example .env
```

Scripts (racine) :

| Script | Effet |
| ------ | ----- |
| `npm run dev` | Serveur (`tsx watch`) + UI (Vite) en parallèle, rechargement à chaud. |
| `npm run dev:server` / `npm run dev:web` | Lancer une seule moitié. |
| `npm run build` | Build de l'UI (Vite) puis du serveur (esbuild → `apps/server/dist`). |
| `npm start` | Lance le serveur de production (sert l'UI buildée). |
| `npm run typecheck` | `tsc --noEmit` sur `shared`, `server`, `web`. |
| `npm test` | Tests unitaires + API (vitest). |
| `npm run e2e` | Parcours navigateur (Playwright). |

En développement : serveur sur `http://127.0.0.1:4983`, UI sur
`http://localhost:5173` (Vite proxifie `/api` vers le serveur).
En production : tout est servi sur `http://127.0.0.1:4983`.

## 3. Configuration (variables d'environnement)

| Variable | Rôle | Défaut |
| -------- | ---- | ------ |
| `FLUENTDB_PORT` | Port du serveur. | `4983` |
| `FLUENTDB_DATA_DIR` | Dossier des données (connexions, historique, clé). | `~/.fluentdb` |
| `FLUENTDB_SECRET` | Clé de chiffrement (hex, 32 octets). Sinon générée dans le dossier de données. | — |
| `FLUENTDB_UNSAFE_LISTEN` | `1` pour écouter sur `0.0.0.0` (déconseillé). | — |
| `FLUENTDB_ALLOW_HOSTS` | Hôtes supplémentaires autorisés (liste séparée par des virgules). | — |
| `GEMINI_API_KEY` | Active l'assistant IA. | — |
| `GEMINI_MODEL` | Modèle Gemini. | `gemini-2.5-flash` |
| `DOCKER_HOST` | Surcharge du point d'accès Docker (`unix://…` ou `tcp://…`). | `/var/run/docker.sock` |

Données persistées dans `FLUENTDB_DATA_DIR` :

- `connections.json.enc` — connexions chiffrées (AES-256-GCM).
- `key` — clé de chiffrement (mode `0600`) si `FLUENTDB_SECRET` n'est pas fourni.
- `fluentdb.db` — SQLite de l'historique des requêtes.

## 4. Référence de l'API HTTP

Toutes les routes sont préfixées par `/api`, en JSON, validées par Zod. Erreurs :
`{ "error": string, "detail"?: string }` avec un code HTTP adapté (`400`
validation, `404` introuvable, `409` conflit/non connecté, `403` lecture seule /
hôte interdit, `503` service IA/Docker indisponible).

### Santé

- `GET /api/health` → `{ ok, name }`

### Connexions

- `GET /api/connections` → liste (secrets masqués, `hasPassword`, `connected`).
- `POST /api/connections` → crée (201).
- `PUT /api/connections/:id` → met à jour (mot de passe inchangé via la sentinelle).
- `DELETE /api/connections/:id`
- `POST /api/connections/test` → teste une config sans la sauvegarder → `{ ok, serverVersion }`.
- `POST /api/connections/:id/connect` → ouvre le pool → `{ ok, capabilities }`.
- `POST /api/connections/:id/disconnect`

`capabilities` : `{ multipleDatabases, schemas, cancelQuery, transactionalDdl,
alterColumn, serverVersion }` — pilote l'UI selon le moteur.

### Schéma (scopé `/api/connections/:id/…`, query `?database=&schema=`)

- `GET /databases`
- `GET /schemas`
- `GET /tables` → tables + vues (avec estimation de lignes).
- `GET /tables/:table/structure` → colonnes, PK, index, clés étrangères.
- `GET /autocomplete` → `{ catalog, dialect, typeNames }` pour CodeMirror.
- `GET /erd` → `{ tables[], relations[], truncated? }` — schéma pour le diagramme
  ERD (tables, colonnes avec PK/FK, relations), assemblé depuis l'introspection.

### Données

- `POST /tables/:table/rows/query` — corps `{ page, pageSize, sorts[], filters[], database?, schema? }`
  → `{ columns, rows, total, pkColumns }`.
- `POST /tables/:table/rows/mutate` — corps `{ changes: { inserts[], updates[], deletes[] }, database?, schema? }`
  → `{ inserted, updated, deleted }` (une transaction). `403` si connexion en lecture seule.

Filtres : `op` ∈ `eq, neq, gt, gte, lt, lte, contains, starts_with, is_null, not_null`.

### Requêtes SQL

- `POST /api/connections/:id/query` — `{ sql, database?, maxRows?, queryId? }`
  → `{ queryId, resultSets[], durationMs }`. Multi-statements ; `truncated` par
  jeu de résultats ; `affectedRows` pour les écritures. Un `queryId` fourni par
  le client permet de cibler l'annulation avant même le retour de la réponse.
- `POST /api/queries/:queryId/cancel` → `{ cancelled }`. Annule la requête en
  vol (PostgreSQL, MySQL) ; `cancelled:false` si l'id est inconnu ou le moteur
  ne le supporte pas (SQLite).
- `POST /api/connections/:id/query/explain` — `{ sql, database?, analyze? }` →
  `QueryPlan` (arbre normalisé : `kind`, lignes estimées/réelles, part de coût,
  warnings). `analyze:true` n'est honoré que pour un statement de lecture et si
  le moteur le supporte (PostgreSQL) — un `EXPLAIN` simple n'exécute jamais.
- `POST /api/connections/:id/query/plan` — `{ sql, database? }` →
  `{ statements: [{ sql, kind, operation, warnings[], estimatedRows|null }], requiresConfirmation }`.
  Analyse sans exécuter : classifie chaque instruction (`read`/`write`/`ddl`/`other`),
  signale les patterns dangereux et estime les lignes affectées des écritures via
  un dry-run `EXPLAIN`. Alimente le dialogue de confirmation. Une connexion en
  lecture seule fait échouer un `write`/`ddl` envoyé à `/query` avec un **403**.
- `GET /api/history?connectionId=&search=` → historique (réussites et échecs).
- `DELETE /api/history/:id` · `DELETE /api/history?connectionId=`

### DDL (structure)

- `POST /api/connections/:id/ddl/preview` — `{ change, database? }`
  → `{ statements[], warnings[] }` **sans exécuter**.
- `POST /api/connections/:id/ddl/apply` — `{ statements[], database? }`. `403` si lecture seule.

`change` est une union discriminée (`kind`) : `createTable`, `dropTable`,
`renameTable`, `addColumn`, `alterColumn`, `dropColumn`, `createIndex`,
`dropIndex`.

### Export

- `POST /api/connections/:id/export` — `{ format: 'csv'|'json', sql, database?, fileName? }`
  → fichier en pièce jointe.

### Docker

- `GET /api/docker/status` → `{ available, detail? }`.
- `GET /api/docker/databases` → conteneurs de BDD détectés avec connexion suggérée
  (`503` si Docker indisponible).

### Assistant IA

- `GET /api/ai/status` → `{ configured, provider, model }`.
- `POST /api/ai/chat` — `{ connectionId?, database?, mode, messages[], context? }`.
  Réponse **SSE** (`text/event-stream`), événements :
  `{ type: 'text', delta }`, `{ type: 'sql_suggestion', sql }`,
  `{ type: 'done' }`, `{ type: 'error', message }`.
  `mode` ∈ `chat, generate_sql, explain, fix, index_advice`. Le mode
  `index_advice` accepte `context.planSummary` (résumé du plan d'exécution) et
  fait proposer des `CREATE INDEX` à partir du plan et du schéma.

## 5. Étendre FluentDB

### Ajouter un moteur de base de données

1. Créer `apps/server/src/drivers/<moteur>/` :
   - `dialect.ts` — implémente `Dialect` (quoting, placeholder, types, dialecte CM).
   - `ddl.ts` — `buildXxxDdl(change): DdlPreview` (fonction pure).
   - `driver.ts` — implémente `Driver` (cf. `types.ts`), en réutilisant
     `sqlBuilder` pour `selectRows` / `mutateRows`.
2. L'enregistrer dans `drivers/registry.ts`.
3. Ajouter le moteur à `engineKinds` / `engineLabels` / `defaultPorts` dans
   `packages/shared/src/connections.ts`.
4. Tests : snapshots de `buildDdl` par dialecte + (optionnel) projet d'intégration
   gaté par variable d'environnement, sur le modèle de `test-integration/postgres.test.ts`.

Le driver SQLite (`drivers/sqlite/driver.ts`) est l'implémentation de référence.

### Ajouter un provider IA (ex. Ollama)

1. Créer `apps/server/src/ai/providers/ollama.ts` implémentant `AiProvider`
   (`chatStream`) via `fetch` vers `http://localhost:11434/api/chat`.
2. Le sélectionner dans `buildApp()` (aujourd'hui `geminiFromEnv()`), par exemple
   selon une variable d'environnement.

Contrainte : un provider ne produit que du texte, il n'a jamais accès aux drivers.

## 6. Tests

```bash
npm test                       # unitaires + API (fixture SQLite, sans réseau)
npm run e2e                    # Playwright (voir note ci-dessous)

# Intégration moteur (auto-ignorée sans la variable) :
TEST_PG_URL=postgres://user:pw@127.0.0.1:5432/db npx vitest run --project integration
```

Note Playwright : le runner attend le Chromium préinstallé. Dans un environnement
où le binaire est ailleurs, pointer dessus via `FLUENTDB_CHROMIUM` (utilisé par
`playwright.config.ts`) et `PLAYWRIGHT_BROWSERS_PATH`.

## 7. Build de production

`npm run build` produit :

- `apps/web/dist` — UI statique.
- `apps/server/dist/index.js` — serveur bundlé (esbuild) ; les modules natifs
  (`better-sqlite3`, `pg`, `mysql2`, `@google/genai`) restent externes et sont
  résolus depuis `node_modules`.

`npm start` lance le serveur, qui détecte `apps/web/dist` et le sert lui-même.
