# Les recettes de papa poulpe — Cloudflare Workers + D1

Version sans Render, pensée pour durer sur le plan gratuit Cloudflare.

## Ce que contient ce projet
- front-end iPhone / Safari ;
- stockage des recettes dans **Cloudflare D1** ;
- export **JSON** et **CSV** ;
- import automatique depuis un lien (titre, image, ingrédients, et copie texte quand disponibles) ;
- illustration **papa poulpe cuisinier** dans le bandeau.

## Pré-requis
- Node.js déjà installé ;
- un compte Cloudflare gratuit.

## Installation
```bash
npm install
npx wrangler login
```

## 1. Créer la base D1
```bash
npx wrangler d1 create les-recettes-papa-poulpe --location weur
```

Wrangler va afficher :
- `database_name`
- `database_id`

Copie le `database_id` dans `wrangler.jsonc` à la place de `REPLACE_WITH_DATABASE_ID`.

## 2. Appliquer la structure de la base
```bash
npx wrangler d1 migrations apply DB --remote
```

## 3. Tester en local
```bash
npm run dev
```
Puis ouvre l’adresse donnée par Wrangler.

## 4. Déployer
```bash
npm run deploy
```

Cloudflare te donnera une URL du type :
`https://les-recettes-de-papa-poulpe.<ton-sous-domaine>.workers.dev`

## 5. Sur iPhone
- ouvre l’URL dans Safari ;
- fais **Partager** ;
- puis **Sur l’écran d’accueil**.

## Mise à jour plus tard
```bash
git add .
git commit -m "Nouvelle version"
git push
npm run deploy
```

## Sauvegarde recommandée
Même avec D1, garde l’habitude de faire :
- **Exporter JSON** régulièrement ;
- **Exporter CSV** si tu veux une version lisible hors appli.

## Fichiers importants
- `src/worker.js` : API + logique Cloudflare ;
- `public/` : interface ;
- `migrations/0001_init.sql` : création de la base ;
- `wrangler.jsonc` : configuration Worker + D1.
