# Authentification

## Comptes

Les utilisateurs existants deviennent INVITED, sans mot de passe, en conservant leurs
relations. Les statuts sont INVITED, ACTIVE et DISABLED ; SUPER_ADMIN complète les
rôles existants. Les DTO publics exposent le statut, jamais passwordHash.

Les mots de passe (15–128 caractères, espaces conservés) sont confirmés à la saisie,
puis hachés avec Argon2id (19 MiB, 2 itérations, parallélisme 1). Aucune confirmation
n'est persistée. Appliquer les migrations avec `npm run db:deploy`.

Vérifications : `npm test`, `npm run typecheck`, `npm run build` et
`npm run test:integration` avec TEST_DATABASE_URL sur une base dédiée.
