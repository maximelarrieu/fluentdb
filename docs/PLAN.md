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

### Évolutions planifiées (détaillées)

Suite priorisée après le socle ERD / vues :

1. **Explication IA d'un objet** *(court terme, faible effort)* — un bouton
   « Expliquer » sur une table / vue / vue matérialisée dans l'arbre de schéma.
   Réutilise le flux SSE existant : nouveau mode `explain_object`, injection de
   la structure de l'objet, de sa définition (vues/matviews) et de ses
   dépendances de lineage dans le prompt (structure seule, jamais de données).
2. **Recherche globale** *(court terme)* — palette ⌘/Ctrl+K qui cherche tables,
   vues, matviews **et colonnes** sur tous les schémas, puis ouvre l'objet en un
   clic. Endpoint `search` avec une requête catalogue unique par moteur
   (pg_catalog / information_schema / sqlite_master), plafonné.
3. **Comparaison de schémas (prod/staging)** *(moyen/long terme, plus lourd)* —
   diff structurel entre deux connexions (tables/colonnes/index/FK
   ajoutés/supprimés/modifiés) puis génération du DDL de migration, derrière
   aperçu + confirmation (jamais auto-exécuté). À découper en jalons : diff
   lecture seule → génération DDL → application assistée.

### Prochaine série (ordre d'exécution acté)

Constat : la brique **tâches planifiées → snapshots → tendances → alertes** a
fait glisser FluentDB du simple client SQL vers un **outil léger de monitoring /
d'insights planifiés** — un angle sans équivalent chez les clients desktop
(TablePlus, DBeaver, pgAdmin). Les évolutions suivantes assument ce virage, tout
en récupérant deux points de sûreté/confort déjà repérés. Une PR par item.

1. **Tableau de bord (mur de tuiles)** — un onglet d'accueil qui agrège toutes
   les tâches planifiées : une tuile par tâche avec la dernière valeur, un
   sparkline de tendance et l'état d'alerte, cliquable pour ouvrir le détail.
   Donne enfin une vue d'ensemble à toute la donnée déjà collectée.
2. **Valeur-clé + delta** — pour une tâche mono-valeur (ex. un `COUNT`),
   afficher le grand chiffre et sa variation par rapport à l'exécution
   précédente (« ↑ 12 % depuis hier ») dans la liste et le détail. Faible
   effort, fort effet ; alimente aussi les tuiles du tableau de bord.
3. **NL → tâche planifiée** — décrire une surveillance en langage naturel
   (« la taille des tables chaque jour à 9h, alerte au-dessus de 10 Go ») et
   laisser l'IA générer la requête **+** la planification **+** le seuil d'un
   coup. Capitalise sur le NL→SQL et sur tout ce qui vient d'être construit.
4. **Écritures « safe »** — avant d'exécuter un `UPDATE`/`DELETE`, un dry-run
   (`EXPLAIN` / `SELECT count(*)` du même `WHERE`) affiche le nombre de lignes
   touchées et confirme, avec alerte forte sur `UPDATE`/`DELETE` sans `WHERE`
   et `DROP`/`TRUNCATE`. Concrétise l'axe « safe by design » du court terme.
5. **Persistance des onglets et connexions entre sessions** — retrouver son
   espace de travail (onglets ouverts, connexion active) au redémarrage.
   Confort attendu dès l'usage quotidien.

### Série suivante (inspirée des retours marché)

Issue d'une revue des frictions des clients concurrents (DBeaver lent sur gros
volumes, TablePlus/Beekeeper pauvres en fonctions DBA, export/import laborieux)
et des tendances IA (chat conscient du schéma, MCP). Ordre d'exécution acté :

1. **Générateur de données de test (mock data) assisté par IA** — remplir une
   table de lignes réalistes générées à partir de sa structure. L'IA propose un
   jeu cohérent (types respectés, valeurs plausibles, valeurs de FK choisies
   parmi les clés existantes) ; **aperçu** obligatoire avant insertion, insérée
   via des requêtes paramétrées.
2. **Bilan de santé (DBA doctor)** — un écran qui lit les catalogues/vues
   statistiques du moteur pour lister index inutilisés, tables très
   « seq-scannées » (index manquants), maintenance à faire (dead tuples →
   VACUUM), requêtes lentes (`pg_stat_statements`), tables sans clé primaire et
   pression sur les connexions. Chaque constat porte une gravité et, quand
   c'est pertinent, un SQL de remédiation à relire. Comble le trou n°1 des
   clients grand public et prolonge EXPLAIN + conseils d'index déjà en place.
3. **Serveur MCP** — exposer FluentDB comme serveur MCP pour que d'autres agents
   interrogent la base via sa couche sûre (lecture seule, garde-fous).
   *À cadrer avant de lancer (coût/complexité) — possible de passer.*
4. **Quick wins** — favoris / snippets de requêtes nommés ; bouton
   « Corriger avec l'IA » directement sur les erreurs d'exécution.

### Menus contextuels (clic droit) — standard des clients modernes

Système de menus au clic droit à la Chat2DB / DBeaver, découpé en phases (une
PR par phase) :

1. **Objets de l'arbre** *(fait)* — clic droit sur table / vue / vue
   matérialisée : ouvrir, structure, définition, `SELECT *`, compter, mock IA,
   expliquer IA, copier le nom, renommer, vider, supprimer. Actions
   destructrices ouvertes dans l'éditeur (→ confirmation d'écriture existante).
2. **Colonnes** — en-têtes de la grille + vue Structure : copier, trier,
   filtrer, créer un index, supprimer la colonne.
3. **Grille de données** — clic droit sur cellule/ligne : copier la valeur / la
   ligne, filtrer par cette valeur, mettre à NULL, supprimer la/les ligne(s).
4. **Connexion** — clic droit dans la barre latérale (en plus du menu `⋮`).

### Perf sur gros volumes & fonctions DBA

Deux axes issus des frictions marché (DBeaver lent sur gros volumes ;
TablePlus/Beekeeper pauvres en DBA). Une PR par item, dans cet ordre :

**Axe 1 — Perf sur gros volumes**

1. **Compte approximatif + exact à la demande** — remplacer le `COUNT(*)`
   systématique à l'ouverture d'une table par l'estimation du planificateur
   (`reltuples` en PostgreSQL, `information_schema.table_rows` en MySQL),
   affichée « ~1,2 M », avec un bouton « compter exactement ». Un filtre force
   un comptage exact (l'estimation ne reflète pas le `WHERE`). Supprime la
   latence n°1 à l'ouverture des grosses tables.
2. **Pagination keyset (curseur)** — naviguer par `WHERE clé > dernière_vue`
   plutôt qu'`OFFSET`, pour un défilement à coût constant quel que soit le
   volume. Navigation Précédent/Suivant par curseur (repli sur `OFFSET` quand
   aucune clé d'ordre total n'est disponible).
3. **Export en flux (streaming)** — exporter une table/requête en CSV/JSON via
   un curseur serveur, sans charger toutes les lignes en mémoire (aujourd'hui
   borné par `maxRows`).

**Axe 2 — Fonctions DBA**

4. **Moniteur d'activité + kill** — vue live de `pg_stat_activity` (requêtes en
   cours, état, durée, wait events) avec annulation/terminaison d'une session
   (`pg_cancel_backend` / `pg_terminate_backend`). Équivalents MySQL
   (`SHOW PROCESSLIST` / `KILL`).
5. **Arbre des verrous / blocages** — qui bloque qui (blocking tree) à partir
   de `pg_locks` / `pg_stat_activity`.
6. **Explorateur de tailles** — top tables/index par espace disque avec part
   relative ; réutilise les catalogues du Bilan de santé.
7. **Rôles & privilèges** — navigateur des utilisateurs/rôles et de leurs
   droits.

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
