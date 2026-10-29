# Ticketing API

API Express 5, TypeScript strict et Prisma 7, sans Docker, avec un module de tickets de support.

Le projet fournit la persistance et les contrats nécessaires pour créer, modifier,
consulter et lister des tickets et des utilisateurs. Ces opérations sont disponibles dans les repositories ;
les tickets disposent également de routes HTTP Create, Update, Listing et Get,
en plus de `GET /health`.

## Ce qui est réalisé

- Serveur Express avec parsing JSON limité à 1 Mo, réponses d'erreur JSON et gestion des routes inconnues.
- Configuration d'environnement chargée avec dotenv et validée par Zod.
- Connexion PostgreSQL via Prisma et `@prisma/adapter-pg`, vérifiée avant le démarrage HTTP.
- Arrêt du serveur et fermeture de Prisma sur SIGINT/SIGTERM.
- Modèle Ticket, enums de statut/priorité et migration SQL initiale.
- Modèle User avec email unique, rôles EMPLOYEE/AGENT/VIEWER et repository dédié.
- Relations Ticket vers son créateur, son utilisateur affecté et son utilisateur de résolution.
- DTO indépendants de Prisma et validation à l'entrée des méthodes du repository.
- Interface du repository et implémentation Prisma avec pagination, filtres et mapping des dates.
- Tests des DTO et tests d'intégration sur PostgreSQL avec schéma isolé par exécution.
- Dépôt Git local sur `main`, `.gitignore` et normalisation des fins de ligne avec `.gitattributes`.

Les routes HTTP des utilisateurs, l'authentification, la couche service et la suppression
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
  modules/users/
    user.dto.ts             # DTO User et validation
    user.repository.ts      # Interface et erreurs métier
    prisma-user.repository.ts
    index.ts                # Instance partagée User
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
| `npm test` | Tests de validation des DTO et des routes HTTP |
| `npm run test:integration` | Tests du repository sur PostgreSQL dédié |
| `npm run db:generate` | Génération du client dans src/generated/prisma |
| `npm run db:migrate` | Création/application d'une migration de développement (nom demandé) |
| `npm run db:deploy` | Application des migrations versionnées |
| `npm run db:recover-legacy` | Reprise des anciens tickets avant la migration User, puis déploiement |
| `npm run db:studio` | Interface de consultation des données |

La génération et la compilation ne nécessitent pas de connexion à la base.
Le modèle Ticket et sa migration initiale sont fournis. Après modification de
`prisma/schema.prisma`, lancer `db:migrate`, puis `db:generate` et versionner les
migrations. En production, appliquer `db:deploy` avant `npm start`.

La migration `20261029110000_add_users_and_ticket_relations` ajoute User et les
trois relations. Elle exige une table Ticket vide : si des tickets existent,
elle échoue explicitement et annule ses changements sans supprimer les données.
Pour une base restée à la migration initiale avec des tickets existants, lancer :

```powershell
npm run db:recover-legacy
```

Cette commande conserve les migrations historiques inchangées. Elle crée User et
les relations avec un créateur nullable, marque la migration User comme appliquée
avec Prisma, puis applique les migrations restantes. Les tickets et leurs champs
existants sont conservés ; leur créateur vaut null. La reprise fonctionne aussi
après un `db:deploy` échoué et peut être relancée. Un marqueur transactionnel sur
la table User permet de reprendre si la commande s'interrompt avant l'enregistrement
Prisma. Une table User existante non reconnue provoque un arrêt sans modification.
Exécuter cette commande seule, sans déploiement ou écriture simultanés.

La migration suivante, `20261029120000_optional_ticket_creator`, rend `createdById`
nullable sans modifier les tickets existants. Un ticket peut désormais être créé
sans User, par exemple avec `{ "title": "Demande de support" }` ; la réponse
contient `createdById: null`. Cette souplesse est temporaire et le créateur reste
interdit dans les modifications PATCH.

## Contrats utilisateurs

Le module `src/modules/users` suit la séparation Model Prisma → DTO → Repository.
`userRepository` expose `create`, `update`, `get` et `listing`, avec injection du
client dans `PrismaUserRepository`.

| Champ | Règles |
| --- | --- |
| `id` | UUID généré, interdit en entrée |
| `name` | Obligatoire en création, trimé, 1–200 caractères |
| `email` | Obligatoire en création, valide, trimé, minuscules, maximum 254 caractères, unique |
| `role` | EMPLOYEE par défaut ; valeurs EMPLOYEE, AGENT, VIEWER |
| `createdAt` | Automatique, exposé en ISO 8601, interdit en entrée |

`CreateUserDto` accepte name, email et role facultatif. `UpdateUserDto` accepte
ces champs partiellement et exige une valeur définie. Les propriétés inconnues
sont refusées. `get` retourne `UserDto | null` ; `update` lève `UserNotFoundError`
si l'utilisateur n'existe pas. Une collision d'email lors de create ou update
lève `UserEmailAlreadyExistsError`. Les autres erreurs techniques se propagent.

`ListUsersDto` accepte page/limit (défauts 1/20, maximum 100, nombres ou chaînes
entières) et un filtre role facultatif. `UserListingDto` contient items, total,
page et limit. Ordre : createdAt DESC, id DESC ; lecture en RepeatableRead.

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
| `createdById` | `string \| null` (UUID User) | Facultatif en création, null par défaut, interdit en modification |
| `assignedToId` | `string \| null` | Facultatif, modifiable, null par défaut |
| `resolveById` | `string \| null` | Facultatif, modifiable, null par défaut |

### Séparation et signatures

Le module `src/modules/tickets` sépare les DTO Zod, l'interface `TicketRepository`
et son implémentation `PrismaTicketRepository`. Les routes utilisent ce contrat.
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
Les trois relations sont des clés étrangères indexées vers User. Les sorties
exposent les identifiants, sans charger les utilisateurs. `assignedToId: null`
ou `resolveById: null` efface la relation ; une référence inexistante lève
`TicketUserReferenceError`. La suppression en base d'un User référencé est refusée.
Les références et le statut sont indépendants ; tous les rôles peuvent être référencés.

Listing accepte `page` et `limit` sous forme d'entiers positifs ou de chaînes
décimales. Valeurs par défaut : 1 et 20 ; limite maximale : 100. Les filtres
`status`, `priority`, `createdById`, `assignedToId` et `resolveById` se combinent par ET.
Tri : `createdAt DESC`, puis `id DESC`.
Le total filtré et les éléments sont lus dans une transaction RepeatableRead.
Une page hors résultats conserve le total et retourne `items: []`.
L'absence du ticket et les références User invalides sont traduites en erreurs métier ;
les autres erreurs techniques se propagent. Aucun type d'erreur Prisma ne fait partie du contrat.

### Exemple d'utilisation dans le code

```ts
import { ticketRepository } from "./modules/tickets/index.js";
import { userRepository } from "./modules/users/index.js";

const user = await userRepository.create({ name: "Alice", email: "alice@example.com" });

const ticket = await ticketRepository.create({
  title: "Impossible de se connecter",
  description: "La page de connexion retourne une erreur.",
  priority: "HIGH",
  createdById: user.id,
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
Ils vérifient aussi l'unicité des emails, les trois relations, le refus de supprimer
un utilisateur référencé et la migration sur table Ticket vide ou déjà peuplée.

## API

### Routes tickets

| Méthode | URL | Réponse |
| --- | --- | --- |
| POST | `/tickets` | 201, TicketDto et en-tête Location |
| PATCH | `/tickets/:id` | 200, TicketDto modifié |
| GET | `/tickets` | 200, `{ items, total, page, limit }` |
| GET | `/tickets/:id` | 200, TicketDto |

Les corps POST/PATCH sont des objets JSON. POST exige uniquement `title` ;
`createdById` est facultatif et accepte null. S'il est renseigné, l'utilisateur
créateur doit déjà exister. PATCH accepte les champs modifiables du
DTO, exige au moins un champ et interdit `createdById`. Aucune authentification
n'est encore implémentée ; le créateur peut être fourni explicitement dans le corps.

Exemple de création (remplacer l'UUID par celui d'un utilisateur existant) :

```http
POST /tickets
Content-Type: application/json

{
  "title": "Impossible de se connecter",
  "priority": "HIGH",
  "createdById": "00000000-0000-4000-8000-000000000001"
}
```

Exemple de modification :

```http
PATCH /tickets/00000000-0000-4000-8000-000000000002
Content-Type: application/json

{ "status": "IN_PROGRESS", "assignedToId": null }
```

Listing : `GET /tickets?page=1&limit=20&status=OPEN&priority=HIGH`.
Les filtres `createdById`, `assignedToId` et `resolveById` sont aussi acceptés.
Les paramètres inconnus, répétés ou invalides sont refusés.

| Statut | Situation |
| --- | --- |
| 400 | DTO, UUID, pagination ou JSON invalide ; modification vide ou champ interdit |
| 404 | Ticket inexistant lors de Get ou Update |
| 413 | Corps JSON dépassant 1 Mo |
| 422 | Utilisateur référencé inexistant lors de Create ou Update |
| 500 | Erreur technique, message générique sans détails internes |

Format d'erreur : `{ "error": { "message": "..." } }`. Les erreurs de validation
Zod ajoutent `error.issues`, une liste de `{ path, message }` sans valeur d'entrée.
Les erreurs 500 sont journalisées côté serveur avec un code technique reconnu et
les frames de stack. Les messages bruts, métadonnées Prisma, corps et URL de requête
ne sont pas journalisés afin de ne pas exposer de secrets.
Les tests HTTP utilisent un repository injecté pour vérifier les contrats et les
réponses ; les tests d'intégration PostgreSQL vérifient séparément la persistance.

### Santé et erreurs générales

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
