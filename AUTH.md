# Authentification

## Login

Configurer JWT_SECRET (au moins 32 octets aléatoires), JWT_ISSUER et JWT_AUDIENCE.
POST /auth/login accepte email/password et retourne accessToken, tokenType Bearer,
expiresIn (900 secondes) et user. GET /auth/me exige Authorization: Bearer <token>.
Les sessions durent 30 jours et sont vérifiées à chaque requête. Les comptes
INVITED/DISABLED et les sessions révoquées sont refusés avec la même réponse 401.
Login est limité à 10 appels/minute/IP. Le stockage mémoire suppose une instance.

## Premier administrateur

Après les migrations : `npm run auth:bootstrap-admin`. Un terminal interactif est
requis ; les mots de passe sont saisis sans affichage. La commande refuse toute
relance dès qu'un SUPER_ADMIN existe. Un verrou transactionnel protège les appels
concurrents. Aucun secret n'est transmis comme argument ou écrit dans les logs.

## Comptes

Les utilisateurs existants deviennent INVITED, sans mot de passe, en conservant leurs
relations. Les statuts sont INVITED, ACTIVE et DISABLED ; SUPER_ADMIN complète les
rôles existants. Les DTO publics exposent le statut, jamais passwordHash.

Les mots de passe (15–128 caractères, espaces conservés) sont confirmés à la saisie,
puis hachés avec Argon2id (19 MiB, 2 itérations, parallélisme 1). Aucune confirmation
n'est persistée. Appliquer les migrations avec `npm run db:deploy`.

Vérifications : `npm test`, `npm run typecheck`, `npm run build` et
`npm run test:integration` avec TEST_DATABASE_URL sur une base dédiée.
