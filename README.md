# Sentinelle BRVM : version autonome

Robot de trading pour la BRVM qui fonctionne seul, gratuitement, sans IA et sans jetons Claude.

Le système a trois parties :

1. **Un collecteur** (`src/collect.js`). Il tourne sur les serveurs gratuits de GitHub toutes les heures pendant la séance, puis après la clôture. À chaque passage, il :
   - récupère les cours et l'historique des 49 valeurs grâce à l'API de Sika Finance ;
   - bascule sur le bulletin officiel de brvm.org si cette API ne répond pas ;
   - relève les actualités et note leur impact selon des règles de mots-clés ;
   - calcule les signaux du robot ;
   - t'envoie les alertes sur Telegram.
2. **Un moteur d'analyse** (`docs/engine.js`), le même que celui de la version Claude. Il comprend :
   - 9 modules : tendance, momentum, RSI, Bollinger, volumes, structure de prix, risque, liquidité, actualité et dividende ;
   - le plan d'exécution chiffré ;
   - le backtest.
3. **Un tableau de bord** (`docs/index.html`). GitHub Pages le publie gratuitement à une adresse que tu ouvres sur ton téléphone. Tes positions et tes réglages restent dans ton navigateur et ne sont jamais publiés.

## Installation (environ 20 minutes, une seule fois)

Le plus simple est de faire l'installation sur un ordinateur. Ensuite, tout se consulte depuis le téléphone.

### 1. Créer le dépôt
1. Crée un compte gratuit sur https://github.com.
2. Clique sur **New repository** :
   - nom : `sentinelle-brvm` ;
   - visibilité : **Public** (c'est obligatoire pour que GitHub Pages soit gratuit ; seules les données de marché sont publiques) ;
   - coche **Add a README file** ;
   - clique sur **Create repository**.
3. Dans le dépôt, clique sur **Add file → Upload files**. Glisse le **contenu** du dossier `sentinelle-brvm` décompressé :
   - les dossiers `docs` et `src` ;
   - les fichiers `package.json`, `package-lock.json` et `README.md`.
   
   Valide avec **Commit changes**.
4. Le dossier `.github` est souvent caché par Windows et macOS, donc crée-le à la main :
   - clique sur **Add file → Create new file** ;
   - comme nom, tape exactement `.github/workflows/sentinelle.yml` ;
   - colle le contenu du fichier `sentinelle.yml` fourni dans l'archive, puis valide avec **Commit changes**.

### 2. Autoriser la publication
1. Va dans **Settings → Actions → General → Workflow permissions**, coche **Read and write permissions**, puis **Save**.
2. Va dans **Settings → Pages**. Dans « Build and deployment », choisis la source **Deploy from a branch**, puis la branche `main` et le dossier `/docs`. Clique sur **Save**.

### 3. Lancer la première collecte
1. Ouvre l'onglet **Actions**, choisis **Sentinelle BRVM – collecte**, puis clique sur **Run workflow**.
2. Le premier passage télécharge 3 ans d'historique pour les 49 valeurs et prend 5 à 15 minutes. Les suivants durent environ 1 minute.
3. Ouvre ton tableau de bord à l'adresse `https://TON-NOM.github.io/sentinelle-brvm/`.
4. Sur le téléphone, ajoute la page à l'écran d'accueil (menu du navigateur → « Ajouter à l'écran d'accueil »).

### 4. Recevoir les alertes sur Telegram (facultatif mais recommandé)
1. Dans Telegram, écris à **@BotFather** et envoie `/newbot`. Choisis un nom, puis copie le **token** qu'il te donne.
2. Envoie un message quelconque à ton nouveau bot.
3. Ouvre `https://api.telegram.org/botTON_TOKEN/getUpdates` dans un navigateur et repère le nombre qui suit `"chat":{"id":`. C'est ton **chat id**.
4. Dans GitHub, va dans **Settings → Secrets and variables → Actions → New repository secret** et crée deux secrets :
   - `TELEGRAM_TOKEN` : le token ;
   - `TELEGRAM_CHAT_ID` : le chat id.

Tu recevras alors :
- les variations de plus de 4 % sur tes valeurs suivies ;
- les changements de décision du robot (par exemple, SIBC qui passe à Achat, avec prix limite, stop et objectif) ;
- les actualités importantes ;
- la note de clôture chaque soir.

## Réglages
- **Valeurs suivies et seuil d'alerte** : modifie `docs/data/config.json` directement sur GitHub (icône crayon). Par exemple : `"watchlist": ["SIBC","SHEC","BOAC"]`, `"alertMovePct": 4`.
- **Capital, risque, frais, positions** : dans l'onglet Portefeuille du tableau de bord. Ces réglages sont enregistrés sur ton téléphone uniquement.
- **Stratégie** : les poids des modules et les seuils sont dans `docs/engine.js` (`WEIGHTS`, fonction `evaluate`).
- **Mots-clés des actualités** : dans `src/news-rules.js`.

## Utilisation sur ton ordinateur (sans GitHub)
Il te faut Node.js 20 ou une version plus récente (https://nodejs.org). Ensuite :
```
npm install
npm run collect      # collecte et calcul des signaux
npm run serve        # tableau de bord sur http://localhost:8080
```
Sous Windows, le Planificateur de tâches peut lancer `npm run collect` toutes les heures.

## Limites à connaître
- **Délai des cours** : 15 minutes, comme sur Sika Finance. Il n'existe pas de flux BRVM gratuit en temps réel.
- **Source de données** : l'API de Sika Finance n'est pas documentée officiellement. Si elle change, le collecteur bascule sur le bulletin de brvm.org (clôtures seulement) et le signale dans le statut de la page. Si les serveurs de GitHub sont un jour bloqués par ces sites, lance le collecteur depuis ton ordinateur.
- **Horaires** : GitHub peut retarder les tâches planifiées de quelques minutes. Il les suspend aussi après 60 jours sans activité sur le dépôt ; les commits automatiques du robot comptent normalement comme activité.
- **Actualités** : la notation par mots-clés est moins fine qu'une lecture humaine. Les chiffres clés restent à lire dans l'article, via le lien.
- **Ordres** : le robot ne passe aucun ordre. Il te donne le prix limite, la quantité et le stop ; tu transmets l'ordre à ta SGI.
