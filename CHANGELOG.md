# Changelog

Toutes les évolutions notables de FluentDB sont consignées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
projet respecte le [versionnage sémantique](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- **Tendance des tâches planifiées (graphe temporel)** : dans l'onglet d'une
  tâche, une bascule « Résultat / Tendance » trace l'évolution d'une **valeur
  numérique dans le temps** à partir de l'historique des exécutions — une ligne
  par catégorie quand la requête renvoie plusieurs lignes (ex. taille par
  table). Choix de la colonne de valeur et de la colonne de série ; graphe SVG
  léger (aucune dépendance) avec axes, légende, labels directs et survol
  (crosshair + infobulle), pensé pour le thème sombre.

### Modifié

- **Tâches planifiées — réactivité** : le nombre de tâches exécutées non
  consultées s'affiche en **badge** à la fois sur le bouton « Tâches
  planifiées » de l'arbre et à côté du **titre de l'onglet**. Le badge
  n'est vidé que lorsqu'on **consulte explicitement** la tâche (clic dans la
  liste, ou exécution manuelle) — un nouveau résultat planifié le fait
  (ré)apparaître, même quand l'onglet est ouvert. La liste et l'**historique se
  mettent à jour en direct** (sondage ~10 s) à l'arrivée d'un nouveau résultat.

### Ajouté

- **Tâches planifiées (requêtes récurrentes)** : depuis l'éditeur SQL, un bouton
  « Planifier » transforme une requête **de lecture** en tâche récurrente
  (chaque jour à une heure donnée, ou toutes les N minutes). Un onglet « Tâches
  planifiées » liste les tâches (exécuter maintenant, mettre en pause,
  supprimer) et affiche le dernier résultat en grille + l'historique des
  exécutions. Une **notification in-app** signale chaque nouveau résultat, avec
  un badge « non vus » sur le bouton d'accès. L'exécution a lieu **tant que
  FluentDB tourne**, avec **rattrapage au démarrage** des exécutions manquées.
  Les tâches sont strictement en lecture seule (jamais d'écriture planifiée) et
  les résultats sont conservés localement (SQLite).

### Corrigé

- **Structure d'une table (PostgreSQL)** : ouvrir la structure d'une table
  faisait planter la page (écran blanc). Les colonnes d'index étaient renvoyées
  comme une chaîne `"{col}"` (tableau PostgreSQL de type `name` non parsé par le
  pilote) au lieu d'un tableau, et `columns.join()` échouait. Même correctif que
  pour les clés étrangères : `array_agg(... ::text)`. Les vues n'ayant pas
  d'index n'étaient pas touchées — d'où le symptôme « ne marche que sur les
  vues ». Filet de sécurité définitif : un parseur de type est enregistré pour
  `name[]` côté pilote, si bien que toute colonne de type `name[]` (présente ou
  future) arrive comme un tableau JS, indépendamment des casts dans les requêtes.

### Ajouté

- **Recherche globale (palette ⌘/Ctrl+K)** : une palette de commande cherche
  d'un coup les tables, vues, vues matérialisées **et colonnes** de la base
  connectée (sur tous les schémas), avec navigation clavier ; la sélection ouvre
  l'objet (ou la structure de la table pour une colonne). Endpoint `search`
  adossé à une requête catalogue par moteur (pg_catalog / information_schema /
  sqlite_master), plafonnée.
- **Explication IA d'un objet** : un bouton « Expliquer » (survol) sur chaque
  table, vue et vue matérialisée de l'arbre de schéma ouvre l'assistant et
  décrit l'objet en langage naturel — ce que représente une ligne, le rôle des
  colonnes clés, les relations (clés étrangères), et pour une vue/matview ce que
  sa définition calcule et les tables qu'elle lit. Nouveau mode `explain_object`
  réutilisant le flux SSE ; le prompt reçoit la structure, la définition et le
  lineage de l'objet — structure seule, jamais les données.

### Corrigé

- **Relations manquantes dans l'ERD (PostgreSQL)** : les clés étrangères
  n'étaient reliées par aucune arête. L'introspection renvoyait les colonnes de
  clé étrangère comme une chaîne (`"{col}"`, tableau PostgreSQL de type `name`
  non parsé par le pilote) au lieu d'un tableau, si bien que l'ERD lisait `"{"`
  comme nom de colonne et n'attachait aucun lien. Les `array_agg` sont
  désormais castés en `text[]`.
- **Mini-carte de l'ERD illisible** : les nœuds étaient dessinés dans une
  couleur quasi identique au fond sombre. Ils sont maintenant colorés selon le
  type d'objet (table, vue, vue matérialisée) et bien visibles.

### Ajouté

- **Lineage dans le diagramme ERD** : les vues et vues matérialisées
  apparaissent désormais dans l'ERD (icône et libellé distincts selon le type),
  reliées par des **arêtes de lineage en pointillé** aux tables et vues dont
  elles tirent leurs données (PostgreSQL, via `pg_depend`). On voit d'un coup
  d'œil « d'où viennent les données » d'une vue. L'export DBML reste limité aux
  tables physiques et à leurs clés étrangères.
- **« Enregistrer en vue » depuis l'éditeur SQL** : un bouton transforme la
  requête courante en **vue** (ou en **vue matérialisée** sur PostgreSQL) en un
  clic ; un dialogue demande le nom, montre le `CREATE VIEW … AS …` généré, puis
  l'exécute (bloqué sur connexion en lecture seule). La nouvelle vue apparaît
  aussitôt dans l'arbre de schéma.
- **Vues matérialisées (PostgreSQL)** : elles apparaissent désormais dans une
  section dédiée « Vues matérialisées » de l'arbre de schéma, avec une icône
  distincte et un indicateur « vide » quand la vue n'est pas peuplée. On peut
  explorer leurs données, voir leur structure, consulter leur **définition SQL**
  et les **rafraîchir** en un clic (`REFRESH MATERIALIZED VIEW`, en
  `CONCURRENTLY` automatiquement lorsque la vue est peuplée et possède un index
  unique, pour ne pas bloquer les lectures). Auparavant les vues matérialisées
  étaient confondues avec les vues classiques et leur ouverture échouait
  (absentes d'`information_schema`) ; l'introspection passe maintenant par
  `pg_catalog`. Le rafraîchissement respecte le mode lecture seule. Un bouton
  « Voir la définition » est aussi disponible sur les vues classiques (tous
  moteurs).

### Corrigé

- **Chargement du fichier `.env`** : le serveur lit désormais le `.env` au
  démarrage (recherche en remontant depuis le dossier courant, sans dépendance
  externe). Auparavant `GEMINI_API_KEY` et les autres variables du `.env`
  étaient ignorées — l'assistant IA restait « non configuré » malgré une clé
  renseignée. Les variables déjà présentes dans l'environnement gardent la
  priorité.
- **Détection Docker** : en l'absence de `DOCKER_HOST`, le serveur sonde
  automatiquement les emplacements usuels au lieu du seul
  `/var/run/docker.sock`. Sous **Windows**, il utilise le *named pipe* de
  Docker Desktop (`\\.\pipe\docker_engine`) — c'est ce qui manquait pour la
  détection sous Windows. Sous macOS/Linux : socket système, Docker Desktop
  (`~/.docker/run/docker.sock`), Docker rootless (`$XDG_RUNTIME_DIR/docker.sock`),
  Colima, OrbStack et Rancher Desktop. Les schémas `npipe://`, `unix://`,
  `tcp://` de `DOCKER_HOST` sont reconnus. Les bases conteneurisées sont donc
  détectées sans configuration manuelle.

### Ajouté

- **Suggestions d'index par l'IA** : depuis le plan d'exécution, un bouton
  « Suggérer un index » envoie à l'assistant la requête, un résumé du plan (les
  parcours coûteux) et le schéma (structure seule) ; Gemini propose un ou des
  `CREATE INDEX` concrets, rendus en cartes « Insérer & exécuter ». L'exécution
  de l'index (DDL) passe par le dialogue de confirmation. L'assistant rappelle
  qu'un index accélère les lectures mais coûte en écritures et en espace.
- **Plan d'exécution visualisé (EXPLAIN)** : un bouton « Analyser » dans l'éditeur
  SQL affiche le plan d'exécution de la requête sous forme d'**arbre visuel**
  (parcours de table/index, jointures, tris…), avec le nombre de lignes estimé
  par étape, la part de coût, et les **étapes coûteuses en rouge**. Les
  parcours séquentiels sur colonnes non indexées sont signalés. Pour les
  requêtes de lecture, option « Mesurer (ANALYZE) » pour des métriques réelles
  (PostgreSQL) ; un `EXPLAIN` simple n'exécute jamais la requête. Vue « brut »
  disponible.
- **Diagrammes ERD** : un onglet « Diagramme ERD » affiche un schéma visuel
  vivant de la base connectée (tables, colonnes, clés primaires et étrangères,
  relations), auto-agencé. Fonctions : recherche de table, ré-agencement,
  **mode focus** (clic sur une table → estompe les tables non liées et surligne
  ses relations), pan/zoom + minimap, et **export en PNG, SVG et DBML**
  (format dbdiagram.io, ré-importable).
- **Assistant IA « safe by design » — garde-fous avant exécution** : toute
  requête d'écriture ou de structure (INSERT/UPDATE/DELETE, DDL) ouvre un
  dialogue de confirmation montrant, par instruction, son type, le SQL exact,
  une **estimation du nombre de lignes affectées** (dry-run `EXPLAIN`, sur les
  moteurs qui le supportent) et des **avertissements** sur les patterns
  dangereux (`UPDATE`/`DELETE` sans `WHERE`, `DROP`/`TRUNCATE`). Les lectures
  pures s'exécutent sans friction ; une option « ne plus demander pour cette
  session » est disponible.
- **Annulation de requête depuis l'éditeur SQL** : un bouton « Annuler » apparaît
  pendant l'exécution et interrompt la requête en cours (moteurs qui le
  supportent : PostgreSQL, MySQL). L'identifiant de requête est généré côté
  client, ce qui permet l'annulation avant même le retour de la réponse.
- Feuille de route priorisée post-v1 dans `docs/PLAN.md`.
- Documentation projet dans `docs/` : plan, architecture, documentation
  technique, documentation fonctionnelle et présentation client.
- Guide de contribution (`CONTRIBUTING.md`) : Conventional Commits, workflow de
  branches et de pull requests, tenue du changelog.
- Template de pull request (`.github/pull_request_template.md`).
- Ce changelog.

### Sécurité

- Les connexions **en lecture seule** refusent désormais aussi les écritures
  lancées depuis l'éditeur SQL libre (endpoint `/query`), pas seulement l'édition
  de la grille.

## [0.1.0] - 2026-07-10

Première version fonctionnelle : le cœur d'un client de base de données moderne
avec assistant IA, vérifié de bout en bout (52 tests, parcours navigateur
Playwright, chemin PostgreSQL validé via l'API).

### Ajouté

- **Gestion des connexions** : création, édition, suppression et test de
  connexions PostgreSQL, MySQL/MariaDB et SQLite ; identifiants chiffrés en
  local (AES-256-GCM) ; couleur et mode lecture seule par connexion.
- **Détection Docker** : repérage automatique des conteneurs de base de données
  et pré-remplissage de la connexion en un clic.
- **Explorateur de schéma** : arbre bases / schémas / tables / vues, avec
  colonnes, index et clés étrangères par table.
- **Grille de données** : pagination, tri et filtres côté serveur ; édition
  inline des cellules ; insertion et suppression de lignes ; enregistrement
  transactionnel des changements en attente.
- **Éditeur SQL** : CodeMirror 6, coloration, autocomplétion consciente du
  schéma, onglets multiples, exécution requête/sélection, historique.
- **Export** des résultats en CSV et JSON.
- **Éditeur de structure** : ajout / modification / suppression de colonnes et
  d'index via l'interface, avec aperçu du SQL avant application.
- **Assistant IA** : chat contextuel en streaming (SSE), génération de SQL en
  langage naturel, explication et correction de requêtes ; fournisseur Google
  Gemini, derrière une abstraction prête pour Ollama.

### Sécurité

- Serveur lié à `127.0.0.1` uniquement par défaut.
- Protection contre le DNS-rebinding (contrôle de l'en-tête `Host`).
- Requêtes de la grille et filtres toujours paramétrés ; identifiants validés
  contre le catalogue introspecté.
- Schéma envoyé à l'IA limité à la structure — jamais les données des lignes.

[Non publié]: https://github.com/maximelarrieu/fluentdb/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/maximelarrieu/fluentdb/releases/tag/v0.1.0
