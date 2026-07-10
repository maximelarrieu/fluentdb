# Contribuer à FluentDB

Ce document décrit les conventions de travail du projet : format des commits,
workflow des branches, gestion des pull requests et tenue du changelog. Elles
existent pour rendre l'historique lisible, les revues rapides et les releases
automatisables.

## Sommaire

- [Format des commits (Conventional Commits)](#format-des-commits)
- [Branches](#branches)
- [Pull requests](#pull-requests)
- [Changelog](#changelog)
- [Avant de pousser](#avant-de-pousser)

## Format des commits

Le projet suit **[Conventional Commits 1.0](https://www.conventionalcommits.org/fr/)**.
C'est le format le plus répandu : il rend l'historique lisible d'un coup d'œil,
permet de dériver automatiquement le changelog et la version SemVer.

```
<type>(<scope>): <résumé impératif, minuscule, sans point final>

<corps optionnel : le POURQUOI du changement, pas le comment>

<pied optionnel : BREAKING CHANGE, refs d'issues>
```

### Types autorisés

| Type       | Usage                                                             | Impact SemVer |
| ---------- | ----------------------------------------------------------------- | ------------- |
| `feat`     | Nouvelle fonctionnalité visible par l'utilisateur                 | `minor`       |
| `fix`      | Correction de bug                                                 | `patch`       |
| `docs`     | Documentation uniquement                                          | —             |
| `refactor` | Changement de code sans effet fonctionnel ni correctif            | —             |
| `perf`     | Amélioration de performance                                       | `patch`       |
| `test`     | Ajout ou correction de tests                                      | —             |
| `build`    | Système de build, dépendances (npm, esbuild, vite)                | —             |
| `ci`       | Configuration d'intégration continue                             | —             |
| `chore`    | Tâches diverses sans impact sur `src` (config, outillage)         | —             |
| `style`    | Formatage, sans changement de logique                             | —             |

### Scopes du projet

Le scope situe le changement. Scopes courants :

`server`, `web`, `shared`, `drivers`, `postgres`, `mysql`, `sqlite`, `ai`,
`docker`, `connections`, `grid`, `editor`, `structure`, `security`, `docs`, `ci`.

### Changements cassants

Un changement d'API/comportement incompatible se signale par un `!` après le
type/scope **et** un pied `BREAKING CHANGE:` :

```
feat(drivers)!: renomme runQuery en execute dans l'interface Driver

BREAKING CHANGE: tous les drivers doivent renommer runQuery en execute.
```

### Exemples

```
feat(ai): ajoute le provider Ollama derrière l'interface AiProvider
fix(grid): corrige l'échappement LIKE des filtres « contains »
docs(architecture): décrit l'abstraction driver et le flux DDL preview→apply
refactor(mysql): simplifie la détection des résultats multi-statements
test(drivers): couvre buildDdl par dialecte en snapshots
```

### Règles

- Résumé ≤ 72 caractères, à l'impératif présent (« ajoute », pas « ajouté »).
- Un commit = un changement cohérent. On ne mélange pas une feature et un refactor.
- Le corps explique **pourquoi**, pas **comment** (le diff dit le comment).

## Branches

- `main` : branche stable, protégée. Aucun push direct.
- Branches de travail : `type/description-courte` en kebab-case.
  Exemples : `feat/ollama-provider`, `fix/like-escape`, `docs/architecture`.

## Pull requests

Toute PR doit :

1. **Cibler une intention claire** — une PR = une fonctionnalité ou un correctif.
   Éviter les PR fourre-tout.
2. **Suivre le template** (`.github/pull_request_template.md`) : contexte,
   changements, vérification, captures si l'UI change, impact changelog.
3. **Être verte** : `npm run typecheck && npm test` doivent passer.
4. **Mettre à jour la doc et le `CHANGELOG.md`** quand le changement est visible.

Le **titre de la PR suit aussi Conventional Commits** — c'est lui qui sert de
message de merge (squash) et alimente le changelog.

### Cycle de vie

1. Créer la branche depuis `main` à jour.
2. Committer par petites unités conventionnelles.
3. Ouvrir la PR en remplissant le template.
4. Faire relire, corriger, garder la CI verte.
5. Merge en **squash** (historique linéaire, un commit conventionnel par PR).

## Changelog

Le fichier [`CHANGELOG.md`](./CHANGELOG.md) suit
**[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)** et le
versionnage **[SemVer](https://semver.org/lang/fr/)**.

Fonctionnement « au fil de l'eau » :

- Chaque PR qui change quelque chose de visible ajoute une ligne sous la section
  **`## [Non publié]`**, dans la bonne catégorie : `Ajouté`, `Modifié`,
  `Corrigé`, `Déprécié`, `Retiré`, `Sécurité`.
- Au moment d'une release, on renomme `[Non publié]` en `[x.y.z] - AAAA-MM-JJ`,
  on tague le commit (`vX.Y.Z`) et on recrée une section `[Non publié]` vide.
- Les entrées sont écrites **pour l'utilisateur**, pas pour le développeur :
  ce qui change pour lui, pas le nom du fichier modifié.

## Avant de pousser

```bash
npm run typecheck      # types OK sur shared, server, web
npm test               # 52 tests unitaires + API (fixture SQLite)
npm run build          # le build de prod passe
```

Les tests d'intégration moteur sont facultatifs en local (auto-ignorés sans
les variables d'env) :

```bash
TEST_PG_URL=postgres://user:pw@127.0.0.1:5432/db npx vitest run --project integration
```
