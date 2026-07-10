# Plan projet — FluentDB

## 1. Contexte et vision

Les interfaces de gestion de bases de données existantes (TablePlus, pgAdmin,
DBeaver) sont perçues comme datées ou lourdes. **FluentDB** vise une alternative
moderne, agréable, avec un **assistant IA** de première classe et une expérience
« au goût du jour », sans sacrifier la puissance attendue d'un vrai client SQL.

Objectif de la v1 : couvrir le cœur du métier d'un client de base de données
(explorer, requêter, éditer données et structure) pour les moteurs les plus
courants, avec un assistant IA conscient du schéma et une intégration Docker.

## 2. Décisions actées

| Sujet | Décision | Raison |
| ----- | -------- | ------ |
| **Format** | Application web locale : serveur Node lancé en local, UI dans le navigateur. | Rapide à développer et à tester, moderne ; packaging desktop (Tauri) possible plus tard sans réécriture. |
| **Moteurs v1** | PostgreSQL, MySQL/MariaDB, SQLite, via une abstraction *driver*. | Couvre la grande majorité des cas ; l'abstraction permet d'ajouter des moteurs sans toucher au reste. |
| **Assistant IA** | Google **Gemini** d'abord, derrière une interface `AiProvider`. | Clé API disponible côté utilisateur ; **Ollama** (local) prévu ensuite, ajoutable en un fichier. |
| **Transport** | HTTP pour les requêtes SQL ; **SSE** pour le streaming IA. | Simple, testable, compatible avec l'outillage front (TanStack Query). |

## 3. Périmètre fonctionnel v1

- Gestion des connexions (multi-connexions, identifiants chiffrés localement).
- Détection des bases lancées dans Docker + connexion pré-remplie.
- Explorateur de schéma (bases, schémas, tables, vues, colonnes, index, FK).
- Grille de données : pagination, tri, filtres, édition inline, insert/delete.
- Édition de structure via l'UI (colonnes, index) avec aperçu du SQL.
- Éditeur SQL : coloration, autocomplétion schéma, onglets, historique.
- Export CSV / JSON.
- Assistant IA : NL→SQL, explication, correction/optimisation, chat contextuel.
- UI moderne, mode sombre.

## 4. Jalons

| Jalon | Contenu | État |
| ----- | ------- | ---- |
| **M0** | Squelette monorepo (workspaces, Fastify, Vite/React, tests). | ✅ Fait |
| **M1** | Connexions + driver SQLite de référence + store chiffré. | ✅ Fait |
| **M2** | Explorateur de schéma + grille (lecture) + drivers PostgreSQL/MySQL. | ✅ Fait |
| **M3** | Éditeur SQL (CodeMirror, autocomplétion, historique, export). | ✅ Fait |
| **M4** | Édition des données (inline) et de la structure (DDL preview→apply). | ✅ Fait |
| **M5** | Intégration Docker (détection des BDD). | ✅ Fait |
| **M6** | Assistant IA (Gemini, SSE, panneau chat). | ✅ Fait |
| **M7** | Finition, documentation, build production. | ✅ Fait |

## 5. Feuille de route (post-v1)

Priorisation issue de la recherche sur les frictions des outils existants
(DBeaver, pgAdmin, Beekeeper : lenteur sur gros volumes, écritures accidentelles,
UI datée, ERD absent/payant). L'axe **IA sécurisée + web-native** est celui où
FluentDB peut réellement innover, là où les concurrents desktop sont faibles.

### Court terme (fort impact / faible effort)

- **Assistant IA « safe by design »** *(en cours)* : avant toute écriture, montrer
  le SQL + l'estimation du nombre de lignes touchées (dry-run `EXPLAIN`) et alerter
  sur les patterns dangereux (`UPDATE`/`DELETE` sans `WHERE`, `DROP`/`TRUNCATE`).
  Le vrai problème du NL→SQL n'est pas la syntaxe mais les résultats/écritures
  silencieusement faux.
- **Mode « prod » renforcé** : connexions read-only par défaut, confirmations
  renforcées, repère visuel (on a déjà couleur + lecture seule à durcir).
- **Ergonomie manquante ailleurs** : exécuter la requête sous le curseur,
  ouvrir/sauver des `.sql`, palette de commandes, dropdown ENUM à l'édition.

### Moyen terme (différenciant)

- **Diagrammes ERD** *(planifié)* : vivant (base connectée), auto-agencé, mode
  focus, **export PNG/SVG/DBML**. La fonctionnalité la plus réclamée partout.
- **`EXPLAIN` visualisé + suggestion d'index par l'IA** applicable en un clic.
- **Streaming des gros result sets** pour écraser le grief n°1 (performance).
- **Provider Ollama** pour un assistant 100 % local (l'abstraction est prête).

### Long terme (paris structurellement hors de portée du desktop)

- **Collaboration temps réel** (partage de connexion/onglet par lien, curseurs,
  snippets d'équipe) — rendu possible par le choix « web ».
- **Time-travel** : historique versionné local + diff visuel du schéma.
- Packaging desktop **Tauri**, gestion des vues/fonctions/migrations, persistance
  des onglets et connexions entre sessions.

## 6. Qualité et vérification

- Tests unitaires + API (vitest via `fastify.inject()`), fixture SQLite universelle.
- Tests d'intégration moteur gatés par variable d'environnement (PostgreSQL vérifié).
- Parcours navigateur de bout en bout (Playwright).
- `typecheck` strict sur les trois packages.

État à la v1 : **52 tests verts**, parcours e2e vert, chemin PostgreSQL validé
via l'API HTTP.

## 7. Risques et limites assumées

- **Modèle de sécurité des identifiants** : chiffrement local honnête (protège
  copies/sauvegardes), pas contre un attaquant ayant déjà le compte utilisateur.
  Documenté comme tel — même posture que TablePlus.
- **SQLite** : `ALTER TABLE` limité (renommage de colonne uniquement via l'UI ;
  les changements de type passent par l'éditeur SQL). Signalé à l'utilisateur.
- **Assistant IA** : nécessite une clé Gemini pour un test de bout en bout ; la
  logique (streaming, extraction du SQL, digest de schéma) est couverte par un
  provider factice en test.
