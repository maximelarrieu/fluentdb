# Documentation FluentDB

Point d'entrée de la documentation du projet. Chaque document a un public et un
objectif précis.

| Document | Pour qui | Contenu |
| -------- | -------- | ------- |
| [PLAN.md](./PLAN.md) | Équipe projet | Vision, décisions actées, jalons, feuille de route. |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Développeurs | Structure du code, abstractions clés, flux de données, choix techniques et leurs raisons. |
| [TECHNICAL.md](./TECHNICAL.md) | Développeurs, intégrateurs | Installation, configuration, référence de l'API HTTP, ajout d'un moteur ou d'un provider IA. |
| [FUNCTIONAL.md](./FUNCTIONAL.md) | Product, support, utilisateurs avancés | Ce que fait le produit, fonctionnalité par fonctionnalité, du point de vue de l'utilisateur. |
| [PRESENTATION.md](./PRESENTATION.md) | Client, prospects | Présentation commerciale : valeur, différenciation, cas d'usage. |

Documents à la racine du dépôt :

- [`../README.md`](../README.md) — prise en main rapide.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — conventions de commits, PR et changelog.
- [`../CHANGELOG.md`](../CHANGELOG.md) — journal des versions.

## Maintien de la documentation

La documentation vit **au fil des changements**, pas en fin de projet :

- Une PR qui change le comportement met à jour `FUNCTIONAL.md` et/ou `TECHNICAL.md`.
- Une PR qui change une structure ou un flux met à jour `ARCHITECTURE.md`.
- Toute PR visible pour l'utilisateur ajoute une ligne au `CHANGELOG.md`.
- Le `PLAN.md` est mis à jour quand un jalon avance ou qu'une décision change.
