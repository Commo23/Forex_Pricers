# Guide de Déploiement Automatique Vercel

## Problème: Les changements GitHub ne se déploient pas automatiquement sur Vercel

### ✅ Étapes de Diagnostic et Résolution

#### 1. Vérifier la Connexion GitHub dans Vercel

1. Allez sur [vercel.com](https://vercel.com) et connectez-vous
2. Ouvrez votre projet
3. Allez dans **Settings** → **Git**
4. Vérifiez que:
   - Le repository GitHub est bien connecté
   - La branche de production est correcte (généralement `main` ou `master`)
   - Les webhooks GitHub sont actifs

#### 2. Vérifier les Webhooks GitHub

1. Allez sur votre repository GitHub
2. Cliquez sur **Settings** → **Webhooks**
3. Vérifiez qu'il y a un webhook Vercel avec:
   - URL: `https://api.vercel.com/v1/integrations/deploy/...`
   - Événements: `push`, `pull_request`
   - Statut: ✅ Active (vert)

**Si le webhook n'existe pas ou est inactif:**
- Dans Vercel, allez dans **Settings** → **Git**
- Cliquez sur **Disconnect** puis **Connect Git Repository**
- Sélectionnez votre repository et reconnectez

#### 3. Vérifier la Configuration des Branches

Dans Vercel → **Settings** → **Git**:
- **Production Branch**: Doit être `main` (ou `master`)
- **Preview Branches**: Vérifiez que les branches sont bien configurées

#### 4. Vérifier les Build Settings

Dans Vercel → **Settings** → **General**:
- **Framework Preset**: `Vite` (ou détecté automatiquement)
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

#### 5. Vérifier les Logs de Déploiement

1. Dans Vercel, allez dans l'onglet **Deployments**
2. Vérifiez les derniers déploiements:
   - S'il y a des erreurs de build, corrigez-les
   - Si les déploiements sont en "Ready" mais pas automatiques, vérifiez les webhooks

#### 6. Vérifier les Variables d'Environnement

Dans Vercel → **Settings** → **Environment Variables**:
- Assurez-vous que toutes les variables nécessaires sont configurées
- Vérifiez qu'elles sont disponibles pour **Production**, **Preview**, et **Development**

#### 7. Forcer un Nouveau Déploiement

Si rien ne fonctionne:
1. Dans Vercel → **Deployments**
2. Cliquez sur **...** (trois points) sur le dernier déploiement
3. Sélectionnez **Redeploy**

#### 8. Vérifier le fichier `.gitignore`

Assurez-vous que `.vercel` n'est pas dans `.gitignore` (il devrait être ignoré, mais le dossier `.vercel` local doit exister)

### 🔧 Solutions Courantes

#### Solution 1: Reconnecter le Repository

```bash
# Dans Vercel Dashboard
1. Settings → Git → Disconnect
2. Connect Git Repository
3. Sélectionner le repository
4. Configurer les branches
```

#### Solution 2: Vérifier les Permissions GitHub

1. GitHub → Settings → Applications → Authorized OAuth Apps
2. Vérifiez que Vercel a les permissions nécessaires
3. Si nécessaire, révoquez et réautorisez

#### Solution 3: Vérifier le Build Command

Assurez-vous que `package.json` a le script `build`:
```json
{
  "scripts": {
    "build": "vite build"
  }
}
```

#### Solution 4: Ajouter un Webhook Manuellement (si nécessaire)

Si les webhooks ne se créent pas automatiquement:
1. GitHub → Settings → Webhooks → Add webhook
2. Payload URL: `https://api.vercel.com/v1/integrations/deploy/[VOTRE_INTEGRATION_ID]`
3. Content type: `application/json`
4. Events: `Just the push event`
5. Active: ✅

### 📋 Checklist de Vérification

- [ ] Repository GitHub connecté dans Vercel
- [ ] Webhook GitHub actif et fonctionnel
- [ ] Branche de production correcte (`main` ou `master`)
- [ ] Build command correct (`npm run build`)
- [ ] Output directory correct (`dist`)
- [ ] Variables d'environnement configurées
- [ ] Pas d'erreurs dans les logs de build
- [ ] Permissions GitHub correctes

### 🚀 Test Rapide

1. Faites un petit changement dans votre code
2. Commit et push vers GitHub:
   ```bash
   git add .
   git commit -m "test: vérification déploiement automatique"
   git push origin main
   ```
3. Vérifiez dans Vercel → Deployments qu'un nouveau déploiement démarre automatiquement

### 📞 Support

Si le problème persiste:
1. Vérifiez les logs dans Vercel → Deployments
2. Vérifiez les logs GitHub → Settings → Webhooks → Recent Deliveries
3. Contactez le support Vercel avec les détails du problème
