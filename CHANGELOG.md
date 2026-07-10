# Changelog

Toutes les évolutions notables de FluentDB sont consignées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
projet respecte le [versionnage sémantique](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

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
