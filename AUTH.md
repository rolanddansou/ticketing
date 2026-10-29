# Authentification

## Démarrage

1. Utiliser Node.js 24 et `npm ci`.
2. Copier `.env.example` vers `.env`, configurer DATABASE_URL et FRONTEND_URL.
3. Générer **deux** secrets indépendants avec
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` :
   JWT_SECRET et OUTBOX_ENCRYPTION_KEY. Les valeurs d'exemple ne sont pas utilisables.
4. Configurer SMTP_HOST/PORT/SECURE/FROM et les identifiants si nécessaires.
5. `npm run db:deploy`, `npm run db:generate`, puis `npm run auth:bootstrap-admin`.
6. `npm run dev`. En production : `npm run build` puis `npm start`.

Les migrations ne sont pas appliquées automatiquement au démarrage. Les utilisateurs
existants doivent être invités par le Super Admin pour définir leur mot de passe.
Le frontend est à développer séparément : il lit le fragment token des liens,
l'envoie par POST à l'API puis le retire de l'URL. Aucun GET ne consomme de jeton.
SMTP est couvert via un faux provider dans les tests ; vérifier la délivrabilité
avec les paramètres de votre fournisseur avant exploitation.

## Permissions Ticket

Toutes les routes /tickets exigent Bearer. /health reste public.

| Rôle | Create | Get / Listing | Update |
| --- | --- | --- | --- |
| SUPER_ADMIN / AGENT | Oui | Tous | Tous |
| EMPLOYEE | Oui | Ses tickets | Non |
| VIEWER | Non | Tous | Non |

POST /tickets n'accepte plus createdById : l'identité connectée l'impose.
EMPLOYEE ne peut pas fournir status, assignedToId ou resolveById à la création.
Un ticket d'autrui retourne 404 pour EMPLOYEE ; son total de listing est filtré
en base. Les tickets historiques sans créateur restent visibles au support et
aux VIEWER. Le repository conserve la création sans utilisateur pour les reprises.

## Changer son mot de passe

POST /auth/change-password (Bearer) accepte currentPassword, password et
confirmPassword. L'ancien mot de passe est vérifié puis toutes les sessions et
les liens sont révoqués atomiquement. Réponse 204, cookie effacé ; reconnexion
requise. Les modifications concurrentes ne peuvent pas réutiliser l'ancien hash.

## Mot de passe oublié

POST /auth/forgot-password avec email retourne toujours le même message 202,
compte inconnu ou inactif inclus. Seuls les comptes ACTIVE reçoivent un email.
Le lien FRONTEND_URL/reset-password#token=... expire après 30 minutes ; le frontend
POST /auth/reset-password avec token/password/confirmPassword. Succès : 204,
cookie effacé et toutes les sessions/liens révoqués ; reconnexion requise.
Un nouveau lien invalide le précédent. Les jetons invitation/reset ne sont pas
interchangeables. Limites IP : forgot 5/15 min, reset et activation 10/15 min.

## Invitations

POST /users/invitations (SUPER_ADMIN) accepte name/email/role et retourne 202.
POST /users/:id/resend-invitation renvoie un lien aux comptes INVITED seulement.
Le lien FRONTEND_URL/accept-invitation#token=... est valable 48 h et à usage unique.
Le frontend lit le fragment et POST /auth/accept-invitation avec token/password/
confirmPassword. Réponse 204 : l'utilisateur peut se connecter, aucune session
n'est créée automatiquement. Renvoi, changement d'email ou désactivation invalident
les anciens liens et emails en attente. Compte + jeton + outbox sont transactionnels.

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
