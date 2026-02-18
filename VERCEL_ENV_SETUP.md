# Configuration des Variables d'Environnement Vercel

## Problème
Si l'application ne se charge pas correctement sur Vercel (page blanche), c'est probablement dû à des variables d'environnement manquantes.

## Variables d'Environnement Requises

### Variables Principales (Application Forex_Pricers)
Ces variables sont déjà configurées pour votre application principale :

- `VITE_SUPABASE_URL` = `https://xxetyvwjawnhnowdunsw.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4ZXR5dndqYXduaG5vd2R1bnN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5NzM5MDcsImV4cCI6MjA3NDU0OTkwN30.M7CkHVh812jNENMlZVoDkCt1vZlgar-3cmwF4xAmtOs`
- `VITE_GEMINI_API_KEY` = `AIzaSyAecEj25iUirNNX38uxQhKbecbcnlutOuQ`
- `VITE_APP_NAME` = `Forex Pricers`
- `VITE_APP_ENVIRONMENT` = `production` (ou `development`)

### Variables Futures Insights Dashboard
Même projet Supabase que ticker-peek-pro (Edge Functions scrape-*).

- `VITE_FUTURES_SUPABASE_URL` = `https://merzfmfodlmskuygkwnw.supabase.co`
- `VITE_FUTURES_SUPABASE_PUBLISHABLE_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcnpmbWZvZGxtc2t1eWdrd253Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjEwOTYsImV4cCI6MjA4NjczNzA5Nn0.A4FsFhSYR1Wjo7kWYkFF7PiYt3VQT584B30Xp_g_cGE`
- `VITE_FUTURES_SUPABASE_PROJECT_ID` = `merzfmfodlmskuygkwnw`

## Comment Configurer dans Vercel

1. **Accédez à votre projet Vercel**
   - Allez sur https://vercel.com
   - Sélectionnez votre projet `forex-pricers-advanced`

2. **Accédez aux paramètres**
   - Cliquez sur **Settings** dans le menu du projet
   - Cliquez sur **Environment Variables** dans le menu de gauche

3. **Ajoutez les variables**
   - Cliquez sur **Add New**
   - Pour chaque variable ci-dessus :
     - **Name** : Le nom de la variable (ex: `VITE_FUTURES_SUPABASE_URL`)
     - **Value** : La valeur correspondante
     - **Environment** : Sélectionnez **Production**, **Preview**, et **Development** (ou au minimum **Production**)

4. **Variables à ajouter (Futures Insights — même config que ticker-peek-pro)**
   ```
   VITE_FUTURES_SUPABASE_URL=https://merzfmfodlmskuygkwnw.supabase.co
   VITE_FUTURES_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcnpmbWZvZGxtc2t1eWdrd253Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjEwOTYsImV4cCI6MjA4NjczNzA5Nn0.A4FsFhSYR1Wjo7kWYkFF7PiYt3VQT584B30Xp_g_cGE
   VITE_FUTURES_SUPABASE_PROJECT_ID=merzfmfodlmskuygkwnw
   ```

5. **Redéployez**
   - Après avoir ajouté toutes les variables, allez dans l'onglet **Deployments**
   - Cliquez sur les trois points (...) du dernier déploiement
   - Sélectionnez **Redeploy**
   - Ou poussez un nouveau commit pour déclencher un nouveau déploiement

## Vérification

Après le redéploiement, vérifiez que :
1. L'application se charge correctement
2. Le dashboard Futures Insights fonctionne (route `/futures-insights`)
3. Les autres fonctionnalités de l'app continuent de fonctionner

## Dépannage

Si l'application ne se charge toujours pas :

1. **Vérifiez la console du navigateur**
   - Ouvrez les outils de développement (F12)
   - Regardez l'onglet Console pour les erreurs
   - Regardez l'onglet Network pour les requêtes qui échouent

2. **Vérifiez les logs Vercel**
   - Allez dans l'onglet **Deployments**
   - Cliquez sur le dernier déploiement
   - Regardez les logs de build et de runtime

3. **Vérifiez que toutes les variables sont présentes**
   - Retournez dans **Settings** > **Environment Variables**
   - Vérifiez que toutes les variables listées ci-dessus sont présentes
   - Vérifiez qu'elles sont activées pour l'environnement approprié (Production)

4. **Testez localement**
   - Assurez-vous que votre fichier `.env` local contient toutes les variables
   - Testez avec `npm run dev` pour vérifier que tout fonctionne localement

## Vol Surface 3D (scrape-vol-surface) et CORS

Si la vue **Vol Surface 3D** affiche « Failed to send a request to the Edge Function » ou une erreur CORS dans la console :

1. **Même projet Supabase**  
   L’URL utilisée par l’app (`VITE_FUTURES_SUPABASE_URL`) doit être celle du projet où la fonction **scrape-vol-surface** est déployée (ex. `https://merzfmfodlmskuygkwnw.supabase.co` ou le projet que vous utilisez).

2. **Déployer la fonction**  
   La fonction se trouve dans ce repo : `supabase/functions/scrape-vol-surface/`. Déployez-la sur le projet Futures (Dashboard Supabase > Edge Functions > Deploy, ou CLI `supabase functions deploy scrape-vol-surface --project-ref <ref>`).

3. **CORS et JWT**  
   Pour les appels depuis le navigateur (ex. `forex-pricers-advanced.vercel.app`), la fonction doit répondre **200 OK** à la requête OPTIONS (preflight). Le code inclut déjà les en-têtes CORS. Il faut aussi que la fonction soit configurée avec **Verify JWT: false** (Dashboard > Edge Functions > scrape-vol-surface > Settings), sinon la preflight OPTIONS peut recevoir 401 et le navigateur bloque la requête.

4. **Secret Firecrawl**  
   Dans le projet Supabase (Futures), définir le secret **FIRECRAWL_API_KEY** (Dashboard > Project Settings > Edge Functions > Secrets) pour que la fonction puisse appeler l’API Firecrawl.

## Note Importante

- Les variables d'environnement avec le préfixe `VITE_` sont exposées au client (navigateur)
- Ne mettez jamais de secrets sensibles dans ces variables
- Les clés Supabase `anon` et `publishable` sont conçues pour être publiques et sécurisées par RLS (Row Level Security)
