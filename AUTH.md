# Authentification

## Emails

SMTP_HOST/PORT/SECURE/FROM sont requis, SMTP_USER/PASSWORD si authentification.
OUTBOX_ENCRYPTION_KEY : clé dédiée de 32 octets encodée en hexadécimal (64 caractères),
à conserver pour déchiffrer les emails en attente. Ne pas réutiliser JWT_SECRET.
L'interface EmailProvider permet de remplacer SMTP ; FakeEmailProvider sert aux tests.
L'outbox chiffre destinataire et contenu avec AES-256-GCM. Worker intégré au serveur,
lease de 60 s et cinq essais, espacés de 1/5/15/60 minutes. Les messages expirés ou
abandonnés sont purgés, comme les messages envoyés. Livraison au moins une fois :
une interruption après acceptation SMTP peut produire un doublon au redémarrage.

## Administration (Bearer SUPER_ADMIN)

- POST /users : name, email, role (EMPLOYEE par défaut), password, confirmPassword ; 201.
- GET /users : page, limit, role, status ; GET /users/:id.
- PATCH /users/:id : name/email/role uniquement.
- POST /users/:id/disable et /enable : désactivation/réactivation.

Un compte sans mot de passe doit accepter une invitation avant activation.
Les changements d'email/rôle et la désactivation révoquent les sessions.
Le dernier SUPER_ADMIN actif ne peut pas être désactivé ou rétrogradé, même
lors d'appels concurrents. Le hash et la confirmation ne figurent jamais en sortie.

## Sessions navigateur

Login retourne uniquement le JWT dans le JSON ; refresh_token est un cookie
HttpOnly, SameSite=Lax, Path=/auth, Secure en production. Sessions multiples,
durée absolue de 30 jours. POST /auth/refresh renouvelle JWT/cookie et invalide le
refresh précédent ; sa réutilisation révoque toute la session.
POST /auth/logout ferme cette session, POST /auth/logout-all ferme toutes les
sessions (Bearer requis). Ces trois routes exigent Origin correspondant à
FRONTEND_URL et X-CSRF-Protection: 1. Le frontend utilise credentials: include.
Frontend et API doivent être sur le même site ; HTTPS requis en production.
TRUST_PROXY_HOPS=0 par défaut, à adapter uniquement aux proxies maîtrisés.

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
