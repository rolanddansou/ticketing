# Ticketing API

API Express 5, TypeScript strict et Prisma 7, sans Docker, avec un module de tickets de support.

Le projet fournit la persistance et les contrats nécessaires pour créer, modifier,
consulter et lister des tickets. Ces opérations sont disponibles dans le repository ;
la seule route HTTP actuellement exposée est `GET /health`.

## Ce qui est réalisé

- Serveur Express avec parsing JSON limité à 1 Mo, réponses d'erreur JSON et gestion des routes inconnues.
- Configuration d'environnement chargée avec dotenv et validée par Zod.
- Connexion PostgreSQL via Prisma et `@prisma/adapter-pg`, vérifiée avant le démarrage HTTP.
- Arrêt du serveur et fermeture de Prisma sur SIGINT/SIGTERM.
- Modèle Ticket, enums de statut/priorité et migration SQL initiale.
- DTO indépendants de Prisma et validation à l'entrée des méthodes du repository.
- Interface du repository et implémentation Prisma avec pagination, filtres et mapping des dates.
- Tests des DTO et tests d'intégration sur PostgreSQL avec schéma isolé par exécution.
- Dépôt Git local sur `main`, `.gitignore` et normalisation des fins de ligne avec `.gitattributes`.

Les routes HTTP des tickets, l'authentification, la couche service et la suppression
de tickets ne sont pas encore implémentées. Aucun déploiement ni workflow GitHub Actions
n'est configuré.

## Stack et organisation

| Outil | Rôle |
| --- | --- |
| Node.js 24, npm | Exécution et gestion des dépendances |
| TypeScript strict, ESM / NodeNext | Typage et compilation |
| Express 5 | Serveur HTTP |
| PostgreSQL, Prisma 7 | Stockage, migrations et accès aux données |
| Zod | Validation des entrées et de la configuration |
| tsx, runner natif Node | Développement et tests |

```text
prisma/
  schema.prisma             # Modèle et enums
  migrations/               # Historique SQL
src/
  config/env.ts             # Configuration validée
  lib/prisma.ts             # Client Prisma partagé
  middlewares/              # Gestion des erreurs HTTP
  modules/tickets/
    ticket.dto.ts           # DTO et schémas Zod
    ticket.repository.ts    # Interface et erreur métier
    prisma-ticket.repository.ts
    index.ts                # Instance du repository
  routes/health.ts
  app.ts                    # Composition Express
  server.ts                 # Démarrage et arrêt
tests/                      # Tests DTO et repository
prisma.config.ts            # Configuration CLI Prisma
```

Le modèle Prisma décrit le stockage. Les DTO décrivent les entrées et sorties
indépendamment du stockage. L'interface du repository définit les opérations ;
son implémentation Prisma réalise les requêtes et convertit les résultats en DTO.

## Prérequis

- Node.js 24 (voir `.nvmrc`) et npm.
- Un serveur PostgreSQL local ou distant accessible.

## Base locale

Dans `psql`, connecté avec un compte administrateur :

```sql
CREATE ROLE ticketing LOGIN PASSWORD 'change_me';
CREATE DATABASE ticketing OWNER ticketing;
```

Remplacer le mot de passe avant utilisation. Pour `prisma migrate dev`, prévoir
une base de développement et une shadow database : le rôle local peut recevoir
`ALTER ROLE ticketing CREATEDB;`. Ne pas donner ce privilège au rôle de production.

## Installation et lancement

```powershell
npm ci
Copy-Item .env.example .env
# Adapter DATABASE_URL dans .env
npm run db:generate
npm run db:deploy
npm run dev
```

Sous macOS/Linux, remplacer `Copy-Item` par `cp`.
Le serveur écoute sur le port 3000 par défaut et ne démarre que si PostgreSQL répond.
`DATABASE_URL` doit utiliser `postgresql://` ou `postgres://` ; encoder les caractères
spéciaux du mot de passe dans l'URL. `NODE_ENV` accepte development, test ou production.
`PORT` doit être un entier entre 1 et 65535.

## Commandes

| Commande | Description |
| --- | --- |
| `npm run dev` | Serveur avec rechargement automatique |
| `npm run build` | Génération Prisma et compilation dans dist |
| `npm start` | Serveur compilé |
| `npm run typecheck` | Génération Prisma et contrôle TypeScript |
| `npm test` | Tests de validation des DTO |
| `npm run test:integration` | Tests du repository sur PostgreSQL dédié |
| `npm run db:generate` | Génération du client dans src/generated/prisma |
| `npm run db:migrate` | Création/application d'une migration de développement (nom demandé) |
| `npm run db:deploy` | Application des migrations versionnées |
| `npm run db:studio` | Interface de consultation des données |

La génération et la compilation ne nécessitent pas de connexion à la base.
Le modèle Ticket et sa migration initiale sont fournis. Après modification de
`prisma/schema.prisma`, lancer `db:migrate`, puis `db:generate` et versionner les
migrations. En production, appliquer `db:deploy` avant `npm start`.

## Contrats tickets

### Champs du ticket

| Champ | Type exposé | Règles |
| --- | --- | --- |
| `id` | `string` (UUID) | Généré automatiquement, non modifiable |
| `title` | `string` | Obligatoire en création, trimé, 1 à 200 caractères |
| `description` | `string \| null` | Facultative, `null` par défaut |
| `status` | `OPEN \| IN_PROGRESS \| CLOSED` | `OPEN` par défaut |
| `priority` | `LOW \| MEDIUM \| HIGH` | `MEDIUM` par défaut |
| `createdAt` | `string` ISO 8601 | Générée automatiquement |
| `updatedAt` | `string` ISO 8601 | Actualisée à chaque modification |

### Séparation et signatures

Le module `src/modules/tickets` sépare les DTO Zod, l'interface `TicketRepository`
et son implémentation `PrismaTicketRepository`. Aucune route métier n'est exposée.
L'implémentation reçoit un client Prisma dans son constructeur ; `index.ts` fournit
`ticketRepository`, branché sur le client partagé. Les DTO n'importent aucun type Prisma.

| Méthode | Entrée | Sortie |
| --- | --- | --- |
| `create` | `CreateTicketDto` | `TicketDto` |
| `update` | UUID et `UpdateTicketDto` | `TicketDto`, ou `TicketNotFoundError` |
| `get` | UUID | `TicketDto` ou `null` |
| `listing` | `ListTicketsDto` | `{ items, total, page, limit }` |

Chaque méthode valide ses entrées avec Zod. Les propriétés inconnues sont refusées.
Create exige un titre trimé de 1 à 200 caractères. La description vaut `null` par
défaut ; le statut vaut `OPEN` et la priorité `MEDIUM`. Les statuts sont `OPEN`,
`IN_PROGRESS`, `CLOSED` ; les priorités `LOW`, `MEDIUM`, `HIGH`.
Update exige au moins une valeur définie ; les champs absents restent inchangés,
`description: null` efface la description. Tous les changements de statut sont permis.
L'UUID et les dates sont gérés automatiquement et interdits en entrée.
Les DTO de sortie exposent les dates en ISO 8601.

Listing accepte `page` et `limit` sous forme d'entiers positifs ou de chaînes
décimales. Valeurs par défaut : 1 et 20 ; limite maximale : 100. Les filtres
`status` et `priority` se combinent par ET. Tri : `createdAt DESC`, puis `id DESC`.
Le total filtré et les éléments sont lus dans une transaction RepeatableRead.
Une page hors résultats conserve le total et retourne `items: []`.
Seule l'absence du ticket est traduite en erreur métier pour Update ; les autres
erreurs techniques se propagent. Aucun type d'erreur Prisma ne fait partie du contrat.

### Exemple d'utilisation dans le code

```ts
import { ticketRepository } from "./modules/tickets/index.js";

const ticket = await ticketRepository.create({
  title: "Impossible de se connecter",
  description: "La page de connexion retourne une erreur.",
  priority: "HIGH",
});

await ticketRepository.update(ticket.id, { status: "IN_PROGRESS" });
const found = await ticketRepository.get(ticket.id);
const page = await ticketRepository.listing({
  page: 1,
  limit: 20,
  status: "IN_PROGRESS",
  priority: "HIGH",
});
```

Cet exemple correspond à un appel depuis un fichier placé dans `src/`, après
configuration de `DATABASE_URL` et application des migrations.

## Tests

```powershell
npm test
npm run typecheck
npm run build
```

Pour les tests d'intégration, créer une base dédiée et définir `TEST_DATABASE_URL`
dans `.env` (voir `.env.example`), puis lancer `npm run test:integration`.
Cette variable est obligatoire : aucun repli sur `DATABASE_URL`.
Le rôle de test doit pouvoir créer des schémas. Chaque exécution crée un schéma
UUID isolé, y applique les migrations, puis supprime uniquement ce schéma.
Exemple de création de la base de test, depuis un compte PostgreSQL administrateur :

```sql
CREATE DATABASE ticketing_test OWNER ticketing;
```

Les tests couvrent le cycle du repository, validation, valeurs par défaut, erreurs,
mapping des dates, filtres combinés, pagination et ordre déterministe.

## API

- `GET /health` exécute `SELECT 1` : `200 {"status":"ok"}` ou
  `503 {"error":{"message":"Base de données indisponible"}}`.
- Une route inconnue renvoie `404 {"error":{"message":"Route introuvable"}}`.
- Le corps JSON est limité à 1 Mo. Un JSON malformé renvoie 400 ; un corps trop gros, 413.
- Les erreurs internes renvoient 500 avec un message générique.

`src/app.ts` compose l'application ; `src/server.ts` gère la connexion initiale,
l'écoute HTTP et l'arrêt sur SIGINT/SIGTERM (délai maximal de 10 secondes).
`src/lib/prisma.ts` partage une seule instance Prisma avec l'adaptateur PostgreSQL.

Pour vérifier après lancement :

```powershell
Invoke-RestMethod http://localhost:3000/health
```

Les secrets `.env`, le client généré, les dépendances et `dist` sont ignorés par Git.

## Exécution du build

Après configuration de l'environnement et installation des dépendances :

```powershell
npm run build
npm run db:deploy
npm start
```

Le code compilé est généré dans `dist/`. La commande `db:deploy` applique uniquement
les migrations existantes ; la création de nouvelles migrations se fait en développement.
