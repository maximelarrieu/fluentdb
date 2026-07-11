# Documentation fonctionnelle — FluentDB

Description du produit fonctionnalité par fonctionnalité, du point de vue de
l'utilisateur. Public : product, support, utilisateurs avancés.

## 1. Concepts

- **Connexion** : un accès enregistré à une base (moteur, hôte, identifiants…).
  On peut en avoir plusieurs et basculer de l'une à l'autre.
- **Espace de travail** : la zone de droite, organisée en **onglets** (données
  d'une table, structure d'une table, ou éditeur SQL).
- **Assistant IA** : panneau latéral qui génère et explique du SQL en langage
  naturel, en connaissant le schéma de la base connectée.

## 2. Gestion des connexions

Dans la barre latérale gauche :

- **Créer une connexion** (bouton `+`) : nom, moteur (PostgreSQL, MySQL/MariaDB,
  SQLite), hôte/port/utilisateur/mot de passe/base — ou chemin de fichier pour
  SQLite. Options : **SSL**, **lecture seule**, **couleur** (repère visuel, par
  ex. rouge pour la production).
- **Tester** la connexion avant de l'enregistrer (retourne la version du serveur).
- **Se connecter** : un clic sur la connexion l'ouvre ; une pastille verte indique
  l'état connecté.
- **Modifier / supprimer** via le menu contextuel (`⋯`). À l'édition, laisser le
  mot de passe vide conserve celui déjà enregistré.

Les identifiants sont **chiffrés localement** ; ils ne quittent jamais la machine
et ne sont jamais réaffichés en clair.

### Détection Docker

Sous la liste des connexions, FluentDB liste les **conteneurs de base de données**
détectés dans Docker (images `postgres`, `mysql`, `mariadb`…). Pour chacun : nom,
état (running/stopped), port publié. Le bouton **Utiliser** pré-remplit le
formulaire de connexion à partir de l'image et des variables d'environnement du
conteneur (utilisateur, mot de passe, base). Si Docker n'est pas lancé, un message
l'indique.

## 3. Explorateur de schéma

Colonne centrale, quand une connexion est active :

- Sélecteurs de **base** et de **schéma** (selon le moteur).
- **Filtre** de recherche de table.
- Sections **Tables** et **Vues**, avec le nombre d'éléments et une estimation de
  lignes au survol.
- **Clic** sur une table → ouvre ses **données**. **Icône colonnes** → ouvre sa
  **structure**.
- Bouton de **rafraîchissement** ; la version du serveur est affichée en bas.

## 4. Données d'une table

- **Grille** paginée (100 lignes par page), avec pagination en bas.
- **Tri** : clic sur un en-tête de colonne (asc → desc → aucun). La clé primaire
  est marquée d'une étoile.
- **Filtres** : barre dédiée, plusieurs conditions combinables (`=`, `≠`, `<`,
  `>`, contient, commence par, est NULL…).
- **Édition inline** : double-clic sur une cellule pour la modifier ; `Entrée`
  valide, `Échap` annule. Les cellules modifiées sont surlignées.
- **Ajouter une ligne** : bouton « Ligne » — une ligne vierge éditable apparaît en
  bas de la grille.
- **Supprimer des lignes** : cases à cocher en début de ligne.
- **Enregistrer** : une **barre de changements en attente** récapitule les
  modifications ; « Enregistrer » les applique **en une seule transaction** (tout
  ou rien), « Annuler » les abandonne.

> Une table **sans clé primaire** est en lecture seule (FluentDB ne peut pas
> cibler une ligne de façon sûre) ; un message l'explique.

## 5. Structure d'une table

- **Colonnes** : nom, type, nullabilité, valeur par défaut, marque de clé primaire
  et d'auto-incrément.
- **Ajouter une colonne** / **modifier** / **supprimer**.
- **Index** et **clés étrangères** listés.

Toute modification passe par un **aperçu du SQL** : FluentDB montre exactement les
instructions qui seront exécutées (avec d'éventuels avertissements, par ex. les
limites d'`ALTER TABLE` sous SQLite) et ne les applique qu'après **validation**.

## 5 bis. Diagramme ERD

Bouton **« Diagramme ERD »** dans l'en-tête de l'explorateur : ouvre un schéma
visuel vivant de la base connectée.

- **Tables** rendues en cartes (colonnes, ★ clé primaire, marqueur de clé
  étrangère, type) ; **relations** dessinées entre colonnes.
- **Auto-agencement** : disposition automatique lisible dès l'ouverture, bouton
  **« Ré-agencer »**.
- **Mode focus** : un clic sur une table estompe les tables non liées et
  surligne ses relations directes (utile sur les gros schémas) ; « Quitter le
  focus » revient à la vue complète.
- **Recherche** d'une table (centre et zoome dessus).
- **Pan / zoom** + minimap.
- **Export** en un clic : **PNG**, **SVG** (pour docs et présentations) et
  **DBML** (format dbdiagram.io, texte portable ré-importable ailleurs).

## 6. Éditeur SQL

- **Onglets multiples** ; nouvel onglet via le `+` de la barre d'onglets.
- **Coloration syntaxique** et **autocomplétion consciente du schéma** (tables et
  colonnes de la base connectée, mots-clés du dialecte).
- **Exécuter** : `⌘/Ctrl + Entrée` pour tout le contenu, `⇧ ⌘/Ctrl + Entrée` pour
  la sélection. Le multi-statements est géré.
- **Annuler** : pendant l'exécution, un bouton « Annuler » interrompt la requête
  en cours (moteurs qui le supportent : PostgreSQL, MySQL ; SQLite s'exécute de
  façon synchrone et n'est pas annulable).
- **Garde-fous avant écriture (safe by design)** : une requête qui modifie des
  données ou la structure (INSERT/UPDATE/DELETE, DDL) ouvre un dialogue de
  confirmation qui montre, pour chaque instruction, son type, le SQL exact, une
  estimation du nombre de lignes affectées et des avertissements sur les
  patterns dangereux (`UPDATE`/`DELETE` sans `WHERE`, `DROP`/`TRUNCATE`). Les
  lectures pures s'exécutent directement. Option « ne plus demander pour cette
  session ». Sur une connexion en lecture seule, les écritures sont refusées.
- **Résultats** : grille en dessous ; durée, nombre de lignes, indicateur de
  troncature, nombre de lignes affectées pour les écritures ; onglets par jeu de
  résultats.
- **Export** des résultats en **CSV** ou **JSON**.
- **Expliquer** : envoie la requête courante à l'assistant IA.
- **Historique** : chaque exécution (réussie ou en erreur) est enregistrée.
- **Analyser (plan d'exécution)** : le bouton « Analyser » affiche le plan
  d'exécution de la requête en **arbre visuel** — chaque étape (parcours de
  table/index, jointure, tri), avec les lignes estimées, la part de coût et les
  étapes coûteuses en rouge. Les parcours complets de table sont signalés
  (candidats à un index). Pour un `SELECT`, « Mesurer (ANALYZE) » exécute la
  requête pour des métriques réelles (PostgreSQL) ; sinon l'estimation
  n'exécute rien. Une vue « brut » montre la sortie native d'EXPLAIN.
  - **Suggérer un index** : si le plan révèle un parcours coûteux (typiquement
    un parcours complet de table), un bouton envoie à l'assistant IA la requête,
    un résumé du plan et le schéma ; l'assistant propose un ou des `CREATE INDEX`
    en cartes prêtes à insérer/exécuter (l'exécution passe par la confirmation
    des écritures). Il rappelle qu'un index accélère les lectures mais coûte en
    écritures et en espace.

## 7. Assistant IA

Panneau latéral droit (bouton « Assistant »). Nécessite une clé Gemini
configurée côté serveur (sinon, un message explique comment l'activer).

- **Chat en langage naturel** : « Montre les 10 dernières commandes avec le nom du
  client », « Combien d'utilisateurs par pays ? ».
- **Conscient du schéma** : la **structure** de la base connectée est envoyée
  comme contexte (jamais les données des lignes).
- **Suggestions SQL** rendues en **cartes** : boutons **Insérer & exécuter**
  (ouvre un onglet SQL avec la requête) et **Copier**.
- **Modes** : génération de SQL, explication, correction/optimisation d'une
  requête en erreur, discussion libre.

> L'assistant **ne touche jamais** la base directement : il ne fait que proposer
> du SQL ; c'est vous qui décidez de l'exécuter.

## 8. États et repères

- **Écran d'accueil** tant qu'aucune connexion n'est active.
- **Notifications** (bas de l'écran) pour les succès, infos et erreurs.
- **Mode sombre** intégral.
- **Couleur de connexion** visible dans la liste, pour distinguer les
  environnements sensibles.
