# FluentDB — Présentation

> Le client de base de données moderne, avec un assistant IA intégré.

---

## Le problème

Gérer une base de données au quotidien passe encore par des outils vieillissants
ou austères. Les équipes jonglent entre un client SQL peu ergonomique, la
documentation du schéma, et un assistant IA dans un autre onglet vers lequel elles
copient-collent des requêtes. Résultat : du temps perdu, des erreurs, une prise en
main difficile pour les profils moins techniques.

## La solution : FluentDB

FluentDB réunit dans **une seule interface moderne** tout ce qu'il faut pour
travailler avec ses bases de données — explorer, requêter, éditer — et y intègre
un **assistant IA conscient du schéma** qui écrit et explique le SQL à votre place.

L'outil tourne **en local** : vos identifiants et vos données ne quittent pas votre
machine.

---

## Ce qui différencie FluentDB

### 🤖 Un assistant IA vraiment intégré

Posez votre question en français : *« les 10 dernières commandes avec le nom du
client »*. FluentDB connaît la structure de votre base et génère la requête, prête
à exécuter en un clic. Il explique aussi une requête existante, corrige une erreur,
propose une optimisation. **Vous gardez le contrôle** : l'IA propose, vous exécutez.

### ⚡ Une expérience au goût du jour

Interface soignée en mode sombre, grille de données fluide même sur de gros
volumes, éditeur SQL avec autocomplétion intelligente, onglets multiples. Le
confort d'un outil moderne, pensé pour aller vite.

### 🐳 Connexion en un clic à vos bases Docker

FluentDB détecte automatiquement les bases de données lancées dans Docker et
pré-remplit la connexion. Plus besoin de retrouver ports et mots de passe.

### ✏️ Édition sûre des données et de la structure

Modifiez des lignes directement dans la grille, ajoutez ou supprimez des colonnes
via l'interface. Chaque changement de structure affiche **le SQL exact avant de
l'appliquer** — aucune surprise. Les modifications de données sont enregistrées en
une transaction : tout ou rien.

### 🔒 Local et respectueux de vos données

Le serveur n'écoute que sur votre machine. Les identifiants sont chiffrés
localement. L'assistant IA ne reçoit que la **structure** de la base — jamais le
contenu de vos tables.

---

## Fonctionnalités clés

| | |
| --- | --- |
| **Multi-moteurs** | PostgreSQL, MySQL / MariaDB, SQLite (et une architecture prête pour d'autres). |
| **Explorateur de schéma** | Bases, tables, vues, colonnes, index, clés étrangères. |
| **Grille de données** | Pagination, tri, filtres, édition inline, insertion/suppression. |
| **Éditeur SQL** | Coloration, autocomplétion schéma, onglets, historique, export CSV/JSON. |
| **Éditeur de structure** | Colonnes et index via l'UI, avec aperçu du SQL. |
| **Assistant IA** | Génération, explication et correction de requêtes en langage naturel. |
| **Intégration Docker** | Détection et connexion automatiques. |

---

## Cas d'usage

- **Développeur** : requêter et éditer rapidement pendant le développement,
  se connecter à sa base Docker sans configuration.
- **Analyste / profil moins SQL** : formuler ses besoins en langage naturel et
  obtenir la requête, comprendre une requête existante.
- **Support / exploitation** : inspecter des données en production en toute
  sécurité grâce au mode lecture seule et au repère de couleur d'environnement.

---

## Sécurité et confidentialité en bref

- Exécution **100 % locale**, écoute limitée à votre machine.
- Identifiants **chiffrés** (AES-256-GCM).
- Requêtes d'édition **paramétrées** (protégées contre l'injection).
- L'IA reçoit **la structure, pas les données**.

---

## Où en est le produit

Première version **fonctionnelle et testée** : le cœur du métier est là et vérifié
de bout en bout. La suite : assistant **100 % local** (Ollama), **application
desktop** (Tauri), diagramme de schéma, gestion des vues et des migrations.

---

*FluentDB — parce qu'un outil de base de données peut être puissant **et** agréable.*
