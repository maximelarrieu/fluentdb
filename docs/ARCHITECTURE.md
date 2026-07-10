# Architecture — FluentDB

Ce document décrit comment FluentDB est structuré, les abstractions qui portent
le projet, les flux de données principaux et les raisons des choix techniques.

## 1. Vue d'ensemble

FluentDB est une **application web locale** : un serveur Node (API + service des
fichiers statiques) et une UI React qui tourne dans le navigateur. En
développement, l'UI est servie par Vite qui proxifie `/api` vers le serveur ; en
production, le serveur Fastify sert lui-même l'UI buildée (même origine, pas de
CORS).

```
┌─────────────────────────────┐        ┌──────────────────────────────────────┐
│   Navigateur (apps/web)      │  HTTP  │   Serveur Node (apps/server)          │
│                              │  /SSE  │                                       │
│  React + Vite + Tailwind     │◄──────►│  Fastify                              │
│  TanStack Query / Table      │        │   ├─ routes/  (API REST + SSE)        │
│  CodeMirror 6                │        │   ├─ services/ (connexions, requêtes) │
│  Zustand (état UI)           │        │   ├─ drivers/  (abstraction moteurs)  │──► PostgreSQL
└─────────────────────────────┘        │   ├─ docker/   (détection conteneurs) │──► MySQL/MariaDB
                                        │   ├─ ai/       (abstraction provider) │──► SQLite
              types + schémas Zod       │   └─ store/    (connexions, historique)│──► Docker socket
              ◄── packages/shared ──►   └──────────────────────────────────────┘──► Gemini API
```

## 2. Monorepo (npm workspaces)

```
fluentdb/
├── packages/shared   → @fluentdb/shared : types TS + schémas Zod partagés
├── apps/server       → @fluentdb/server : API Fastify
└── apps/web          → @fluentdb/web    : UI React/Vite
```

**Pourquoi un monorepo.** Le serveur et l'UI partagent un grand nombre de types
(configs de connexion, nœuds du schéma, résultats de requête, messages IA).
`packages/shared` centralise ces types et les schémas Zod de validation, ce qui
donne un **typage de bout en bout** : le contrat d'API est écrit une fois et
consommé des deux côtés. Une seule installation, une seule version de TypeScript.

## 3. Le serveur (`apps/server`)

Point d'entrée testable : `buildApp()` (`src/app.ts`) construit l'instance
Fastify, branche les services et enregistre les routes. `src/index.ts` l'appelle,
lie le socket sur `127.0.0.1` et sert l'UI en production. Les tests utilisent
`buildApp()` + `fastify.inject()` — pas de port réseau.

### Couches

- **`routes/`** — points d'entrée HTTP, validation Zod des entrées, pas de logique
  métier. Une route par domaine : `connections`, `schema`, `data`, `query`,
  `ddl`, `export`, `docker`, `ai`.
- **`services/`** — logique applicative :
  - `connectionManager` gère les pools vivants par (connexion, base). Changer de
    base dans l'UI ouvre paresseusement un driver frère sur la même config.
  - `queryRunner` attribue un `queryId`, tient un registre pour l'annulation et
    enregistre chaque exécution dans l'historique.
  - `exporter` sérialise un résultat en CSV / JSON.
- **`drivers/`** — l'abstraction centrale (voir §5).
- **`store/`** — persistance : `connectionsStore` (JSON chiffré), `historyStore`
  (SQLite local, table bornée).
- **`docker/`, `ai/`, `security/`** — voir §5, §6, §7.

## 4. L'UI (`apps/web`)

- **État serveur** : **TanStack Query** — cache, invalidations (ex. rafraîchir
  l'arbre après un DDL), gestion des états de chargement/erreur.
- **État UI** : **Zustand** (`stores/workspace.ts`) — connexion active, base et
  schéma courants, onglets ouverts, ouverture du panneau IA.
- **Rendu** : composants « shadcn-style » (primitives Radix + Tailwind) dans
  `components/ui/` ; fonctionnalités isolées par domaine dans `features/`
  (`connections`, `schema-tree`, `data-grid`, `sql-editor`, `structure`, `erd`, `ai`).
  Le diagramme **ERD** (`features/erd`) rend le schéma via React Flow + un
  layout dagre ; le SQL généré pour l'export **DBML** est une fonction pure
  (`features/erd/dbml.ts`), testée en unitaire. Le **plan d'exécution**
  (`features/plan`) réutilise React Flow ; la normalisation du plan (
  `drivers/<moteur>/explain.ts`) est une fonction pure par dialecte, testée en
  unitaire, produisant un `PlanNode` uniforme (kind, lignes, coût, warnings).
- **Grille** : **TanStack Table** (headless) + **TanStack Virtual** — on contrôle
  entièrement le markup (édition inline, cellules dirty, renderers NULL/JSON) et
  on virtualise les grands jeux de résultats.
- **Éditeur** : **CodeMirror 6** avec `@codemirror/lang-sql`, alimenté en schéma
  pour l'autocomplétion, dialecte choisi selon le moteur connecté.

Le client HTTP typé (`api/client.ts`) est la seule porte vers le serveur ; il est
typé sur les types de `@fluentdb/shared`.

## 5. Abstraction *driver* (le cœur)

`src/drivers/types.ts` définit l'interface `Driver` que chaque moteur implémente.
C'est ce qui rend le produit multi-moteurs sans conditionnels disséminés.

Responsabilités d'un driver :

- **Cycle de vie** : `connect`, `disconnect`, `ping`, `serverVersion`.
- **Introspection normalisée** : `listDatabases`, `listSchemas`, `listTables`,
  `getTableStructure`, `getAutocompleteCatalog`. Chaque moteur traduit ses
  catalogues (`information_schema`, `pg_catalog`, `pragma`) vers **les mêmes
  types partagés** — l'UI ne voit jamais de forme spécifique à un moteur.
- **Exécution** : `runQuery(sql, { queryId, maxRows })` avec troncature, et
  `cancelQuery(queryId)` (PID backend pour PostgreSQL, `threadId` pour MySQL,
  no-op pour SQLite — exposé via `capabilities`).
- **Données** : `selectRows`, `mutateRows` — **toujours** construites par le
  `sqlBuilder` partagé (identifiants quotés et validés, valeurs en paramètres liés).
- **Structure** : `buildDdl(change)` — **fonction pure** qui produit le SQL sans
  l'exécuter (testable en snapshots par dialecte) — puis `applyDdl(statements)`.

Deux briques transverses accompagnent l'interface :

- **`sqlBuilder.ts`** : génère `SELECT`/`INSERT`/`UPDATE`/`DELETE` paramétrés.
  Valide chaque colonne contre le catalogue introspecté et exige que les clés de
  ligne couvrent exactement la clé primaire — c'est ce qui rend l'édition de la
  grille imperméable à l'injection.
- **`Dialect`** : quoting, style de placeholder (`$1` vs `?`), noms de types,
  dialecte CodeMirror. Consommé par l'autocomplétion et par les prompts IA.

**Ajouter un moteur** = créer `drivers/<moteur>/{driver,dialect,ddl}.ts` et
l'enregistrer dans `drivers/registry.ts`. Rien d'autre à toucher.

### Invariants d'édition

- Une table sans clé primaire est en lecture seule (bandeau dans l'UI).
- Les `WHERE` d'update/delete ne sont construits que sur les colonnes de clé
  primaire, en paramètres liés.
- Un lot de mutations s'exécute dans **une transaction** (rollback global si une
  opération échoue). Un update qui ne touche aucune ligne lève un conflit (409).

## 6. Abstraction *provider IA*

`src/ai/types.ts` définit `AiProvider` : une simple **complétion en streaming**
(`chatStream`). Choix structurants :

- **Pas de function-calling en v1.** Le SQL proposé arrive en blocs ```` ```sql ````
  que le serveur extrait en événements `sql_suggestion` sur le flux SSE ; l'UI les
  affiche en cartes avec « Insérer & exécuter ». Cela garde Gemini et Ollama
  interchangeables et impose la sécurité par construction.
- **La couche IA n'a aucune référence à un `Driver`.** Elle ne produit que du
  texte. Le SQL n'atteint la base que par `POST /query`, donc un clic utilisateur.
- **Contexte de schéma** (`schemaContext.ts`) : digest compact (une ligne par
  table : colonnes, types, PK, FK), priorisé (tables sélectionnées + voisins FK),
  tronqué avec mention. **Structure seule — jamais les données des lignes.**

Le provider Gemini (`ai/providers/gemini.ts`) est instancié depuis
`GEMINI_API_KEY`. Ajouter Ollama = un fichier `ai/providers/ollama.ts`
implémentant la même interface via `fetch`.

## 7. Sécurité

- **Écoute `127.0.0.1` uniquement** ; `0.0.0.0` exige un flag explicite.
- **Garde anti DNS-rebinding** (`security/hostGuard.ts`) : rejet des requêtes dont
  l'en-tête `Host` n'est pas local — le vrai vecteur d'attaque contre un outil
  local.
- **Chiffrement des identifiants** (`security/secrets.ts`) : AES-256-GCM, clé dans
  `~/.fluentdb/key` (mode `0600`) ou via `FLUENTDB_SECRET`. Les secrets ne sont
  jamais renvoyés par l'API (sentinelle à l'édition).
- **Mutations paramétrées** + validation des identifiants contre le catalogue.
  Le SQL libre de l'éditeur reste brut : c'est le produit, et il est clairement
  écrit par l'utilisateur.

## 8. Flux de données (exemples)

**Ouvrir une table.**
`SchemaTree` → `GET /connections/:id/tables` → `connectionManager.getDriver()` →
`driver.listTables()` (catalogue normalisé). Un clic ouvre un onglet ; `TableView`
appelle `POST .../rows/query` → `driver.selectRows()` (via `sqlBuilder`).

**Éditer des lignes.**
Éditions accumulées dans l'état local (cellules *dirty*) → « Enregistrer » →
`POST .../rows/mutate` → `driver.mutateRows()` (une transaction) → invalidation
TanStack Query → la grille se recharge.

**Modifier la structure.**
`ColumnDialog` construit un `DdlChange` → `POST .../ddl/preview` →
`driver.buildDdl()` renvoie le SQL **sans l'exécuter** → l'utilisateur valide →
`POST .../ddl/apply` → `driver.applyDdl()` → l'arbre et la structure se rafraîchissent.

**Assistant IA.**
`AssistantPanel` → `POST /ai/chat` (SSE). Le serveur construit le prompt système
(rôle + dialecte + digest de schéma), streame les deltas de texte, puis extrait
les blocs SQL en `sql_suggestion`. L'UI parse le flux et rend les cartes.

## 9. Tests

- **Unitaires / API** : `buildApp()` + `fastify.inject()`, fixture SQLite
  (fichier temp seedé). Couvrent connexions, introspection, requêtes, mutations,
  DDL, export, historique, IA (provider factice), Docker (faux socket unix).
- **Génération de SQL** : `buildDdl` et `sqlBuilder` en snapshots **par dialecte**
  (le SQL PostgreSQL/MySQL se teste sans serveur).
- **Intégration moteur** : projet vitest séparé, gaté par `TEST_PG_URL` (PostgreSQL
  vérifié) — auto-ignoré sinon.
- **Bout en bout** : Playwright pilote le parcours complet dans Chromium.
