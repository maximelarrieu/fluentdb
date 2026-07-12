# Changelog

Toutes les évolutions notables de FluentDB sont consignées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
projet respecte le [versionnage sémantique](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- **Blocages / verrous (DBA)** : l'onglet « Activité » affiche en tête un
  encart « Blocages » listant les sessions en attente d'un verrou et qui les
  bloque (PostgreSQL `pg_blocking_pids`, MySQL `sys.innodb_lock_waits`), avec un
  bouton pour **terminer la session bloquante**.
- **Moniteur d'activité + kill (DBA)** : un onglet « Activité » liste les
  sessions serveur en direct (PostgreSQL `pg_stat_activity`, MySQL processlist)
  — utilisateur, base, état, wait event, durée, requête — et permet d'**annuler
  la requête** en cours (`pg_cancel_backend` / `KILL QUERY`) ou de **terminer la
  session** (`pg_terminate_backend` / `KILL`). Rafraîchissement automatique.
  Indisponible sur SQLite (mono-processus).
- **Menu contextuel sur les connexions** : clic droit sur une connexion dans la
  barre latérale (connecter / déconnecter, nouvelle requête, copier le nom,
  modifier, supprimer) — en complément du bouton `⋮`.
- **Menu contextuel sur les cellules/lignes** : clic droit sur une cellule de
  la grille — copier la valeur, copier la ligne (JSON), filtrer par cette
  valeur, et (tables éditables) mettre à NULL ou marquer la ligne pour
  suppression.
- **Menu contextuel sur les colonnes** : clic droit sur un **en-tête de colonne**
  de la grille (copier le nom, trier ↑/↓, filtrer par cette colonne, créer un
  index, supprimer la colonne) et sur une **ligne de la vue Structure** (copier,
  modifier, créer un index, supprimer). Les actions DDL passent par l'aperçu +
  confirmation existant.
- **Menu contextuel au clic droit (arbre de schéma)** : un clic droit sur une
  table, une vue ou une vue matérialisée ouvre un menu d'actions — ouvrir les
  données, voir la structure, voir la définition (vues), `SELECT *` ou compter
  les lignes dans un nouvel éditeur, générer des données de test (IA), expliquer
  avec l'IA, copier le nom, renommer, vider et supprimer. Les actions
  destructrices (vider / supprimer) ouvrent leur SQL dans un éditeur et passent
  par la confirmation d'écriture habituelle. Les items s'adaptent au type d'objet
  et à la disponibilité de l'IA.
- **Snippets SQL (favoris)** : depuis l'éditeur, un bouton « Snippets » permet
  d'enregistrer la requête courante sous un nom et de recharger n'importe quel
  snippet en un clic. Conservés localement entre les sessions.
- **Corriger une erreur avec l'IA** : quand une requête échoue, un bouton
  « Corriger avec l'IA » apparaît sous le message d'erreur et transmet la
  requête **et l'erreur** à l'assistant, qui propose une version corrigée
  (visible quand un fournisseur IA est configuré).
- **Bilan de santé (DBA doctor)** : un onglet « Bilan de santé » interroge les
  catalogues/vues statistiques du moteur (lecture seule) et liste des constats
  classés par catégorie et gravité, avec un SQL de remédiation à relire quand
  c'est pertinent. **PostgreSQL** : index jamais utilisés (→ `DROP INDEX`),
  tables très parcourues sans index (candidats à un index), dette de VACUUM
  (lignes mortes), requêtes les plus coûteuses (`pg_stat_statements`, avec un
  rappel si l'extension est absente), tables sans clé primaire, pression sur
  les connexions. **MySQL** : tables sans clé primaire, connexions. **SQLite** :
  `integrity_check`, violations de clés étrangères, tables sans clé primaire.
- **Données de test générées par l'IA (mock data)** : depuis une table, un
  bouton « Données de test » demande à l'assistant de générer N lignes
  réalistes à partir de la **structure** (types respectés, valeurs plausibles
  selon le nom des colonnes, valeurs de clés étrangères choisies parmi les clés
  existantes, colonnes auto-incrémentées exclues). Les lignes sont **prévisualisées
  et relues** avant d'être insérées (insertion paramétrée via le chemin de
  mutation habituel). Endpoint `POST /api/ai/mock`.
- **Créer une surveillance en langage naturel (IA)** : depuis l'onglet
  « Tableau de bord » ou « Tâches planifiées », décrire une surveillance en
  français (« la taille de chaque table du schéma public chaque jour à 9h,
  alerte au-dessus de 10 Go ») et laisser l'assistant proposer une **tâche
  planifiée complète** — requête **de lecture**, planification et seuil
  d'alerte. La proposition est **relue et éditable** avant création (rien n'est
  créé ni exécuté sans validation) et la requête est garantie en lecture seule
  côté serveur (endpoint `POST /api/ai/monitor`).
- **Valeur-clé + variation (tâches planifiées)** : la dernière valeur d'une
  tâche (somme de sa colonne numérique, ou nombre de lignes à défaut) est mise
  en évidence avec sa **variation par rapport à l'exécution précédente**
  (« ↗ 20 % », « — stable ») — dans la liste, en tête du détail et sur les
  tuiles du tableau de bord. L'indicateur est **neutre** (une flèche donne le
  sens, sans jugement « bon / mauvais »).
- **Tableau de bord (mur de tuiles)** : un onglet « Tableau de bord » agrège
  toutes les tâches planifiées en tuiles — dernière valeur en évidence,
  **sparkline** de tendance, état d'alerte (bordure/ligne ambre + résumé) ou
  d'échec, planning et prochaine exécution. Les tuiles sont regroupées par base
  de données et se rafraîchissent en direct ; un point signale un résultat non
  consulté. Cliquer une tuile ouvre la tâche correspondante dans l'onglet
  « Tâches planifiées ».
- **Tâches planifiées groupées par base** : l'onglet regroupe désormais les
  tâches par **base de données** (connexion + base) avec un en-tête par groupe.
  Les dialogues de création et d'édition gagnent un champ **« Base de données »**
  (optionnel) qui cible la requête et détermine ce regroupement.
- **Adapter une requête pour la tendance (IA)** : quand une requête ne renvoie
  aucune colonne numérique traçable (ex. des tailles formatées en texte via
  `pg_size_pretty`), l'onglet « Tendance » propose un bouton **« Adapter la
  requête avec l'IA »** qui demande à l'assistant de réécrire la requête pour
  renvoyer une valeur numérique (et garder une colonne de libellé pour les
  séries).
- **Alertes sur seuil (tâches planifiées)** : sur une tâche, on définit
  **soi-même** un seuil — une colonne numérique, un opérateur (>, ≥, <, ≤) et
  une valeur. À chaque exécution, si au moins une ligne franchit le seuil, une
  **notification in-app** le signale, la tâche et les exécutions concernées sont
  marquées en ambre, et le graphe de tendance affiche une **ligne de seuil**.
  Le seuil est éditable à tout moment et n'affecte jamais l'exécution
  (lecture seule).
- **Tendance des tâches planifiées (graphe temporel)** : dans l'onglet d'une
  tâche, une bascule « Résultat / Tendance » trace l'évolution d'une **valeur
  numérique dans le temps** à partir de l'historique des exécutions — une ligne
  par catégorie quand la requête renvoie plusieurs lignes (ex. taille par
  table). Choix de la colonne de valeur et de la colonne de série ; graphe SVG
  léger (aucune dépendance) avec axes, légende, labels directs et survol
  (crosshair + infobulle), pensé pour le thème sombre.

### Modifié

- **Export en flux (perf gros volumes)** : l'export CSV/JSON d'une table ou
  d'une requête passe désormais par un **curseur serveur** (curseur PostgreSQL,
  itérateur SQLite, flux MySQL) et écrit les lignes au fil de l'eau, sans
  matérialiser tout le résultat en mémoire ni le plafond de 100 000 lignes
  précédent.
- **Pagination keyset (perf gros volumes)** : la navigation Précédent/Suivant
  dans la grille utilise désormais un curseur (`WHERE clé > dernière_vue`) au
  lieu d'`OFFSET` quand la table a une clé primaire mono-colonne — coût constant
  quel que soit le numéro de page (fini le ralentissement en profondeur de
  pagination). Repli automatique sur `OFFSET` sinon (PK composite, tri sur une
  colonne non unique).
- **Compte de lignes approximatif (perf gros volumes)** : à l'ouverture d'une
  table, le total affiché provient désormais de l'estimation du planificateur
  (`reltuples` en PostgreSQL, `information_schema` en MySQL) — « ~1,2 M » — au
  lieu d'un `COUNT(*)` complet systématique, qui pouvait prendre plusieurs
  secondes sur les grosses tables. Un lien **« compter »** lance le comptage
  exact à la demande, et l'application d'un filtre force toujours un compte
  exact. SQLite (fichier local) reste en comptage exact.
- **Espace de travail persistant** : les onglets ouverts (tables, requêtes SQL
  et leur contenu, structure, ERD, tableau de bord, tâches) et la connexion
  active sont conservés entre les sessions (stockage local). Au redémarrage, la
  connexion est **rétablie automatiquement** et l'espace de travail restauré ;
  si elle n'est plus joignable (supprimée, base injoignable), l'espace repart
  propre. Les réglages de session (confirmation d'écriture « ne plus me
  demander », panneaux ouverts) restent volontairement non persistés.
- **Écritures « safe » — compte exact des lignes touchées** : avant d'exécuter
  un `UPDATE`/`DELETE`, la fenêtre de confirmation affiche désormais le **nombre
  exact** de lignes concernées, obtenu par un `SELECT count(*)` en lecture seule
  sur la même cible et le même `WHERE`. Fonctionne sur **tous les moteurs**, y
  compris SQLite (qui n'affichait aucune estimation) ; repli sur l'estimation du
  planificateur (`EXPLAIN`) pour les formes complexes (jointures, `UPDATE …
  FROM`, `DELETE … USING`). Les alertes existantes (`UPDATE`/`DELETE` sans
  `WHERE`, `DROP`/`TRUNCATE`) restent inchangées.
- **Tâches planifiées — édition** : un bouton « Modifier » sur une tâche ouvre
  un dialogue pour changer son **nom**, sa **planification** (chaque jour /
  intervalle) et sa **requête** sans avoir à la supprimer puis la recréer. La
  prochaine exécution est recalculée à l'enregistrement et la requête reste
  soumise au garde-fou lecture seule.
- **Panneau latéral repliable** : le panneau de gauche (connexions + encart
  Docker) se masque et se réaffiche via un bouton. Replié, il laisse un fin
  rail avec un bouton pour le rouvrir, libérant de la place pour l'espace de
  travail. L'état est conservé pendant la session.
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
