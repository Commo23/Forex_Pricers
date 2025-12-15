# 🤖 Configuration du Chatbot Intelligent FX

## 📋 Vue d'ensemble

Le chatbot utilise **UNIQUEMENT Google Gemini AI** avec **function calling** pour comprendre le contexte et répondre intelligemment aux questions des utilisateurs en langage naturel.

## 🔧 Configuration

### Google Gemini AI ⭐

#### 1. Obtenir une clé API Gemini

1. Allez sur [https://makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)
2. Créez un compte Google ou connectez-vous
3. Cliquez sur **Create API Key**
4. Copiez la clé (elle commence par `AIza...`)

#### 2. Configurer la variable d'environnement

Créez ou modifiez le fichier `.env` à la racine du projet :

```env
VITE_GEMINI_API_KEY=AIzaSyAecEj25iUirNNX38uxQhKbecbcnlutOuQ
```

**Note:** Une clé par défaut est déjà configurée dans le code, mais il est recommandé de la mettre dans `.env` pour la production.

### 3. Redémarrer le serveur

```bash
npm run dev
```

## ✨ Fonctionnalités Disponibles

Le chatbot peut comprendre et répondre à des questions en langage naturel sur :

### 📊 **Taux de Change Spot**
- "Quel est le spot EUR/USD?"
- "Donne-moi le cours actuel de GBP/USD"
- "Combien vaut USD/JPY maintenant?"

### 💰 **Calcul de Prix d'Options**
- "Calcule un call EUR/USD strike 1.10 à 3 mois"
- "Quel est le prix d'un put GBP/USD strike 1.25 à 6 mois?"
- "Combien coûte une option call sur EUR/USD?"

### 📈 **Calcul de Forward FX**
- "Quel est le forward EUR/USD à 6 mois?"
- "Calcule le taux à terme GBP/USD pour 3 mois"
- "Forward USD/JPY à 1 an"

### 📚 **Explications et Conseils**
- "Explique le Zero-Cost Collar"
- "Quand utiliser un Participating Forward?"
- "Quelle est la différence entre call et put?"
- "Comment fonctionne le modèle Garman-Kohlhagen?"

## 🎯 Exemples de Questions

Le chatbot comprend le contexte, donc vous pouvez poser des questions de différentes manières :

✅ **Formats acceptés:**
- "EUR/USD spot?"
- "Je veux savoir le taux de change entre l'euro et le dollar"
- "Calcule-moi une option call sur EUR/USD avec strike 1.10 et maturité 3 mois"
- "Qu'est-ce qu'un collar zero-cost?"

## 🔄 Mode Fallback

Si la clé API n'est pas configurée, le chatbot fonctionne en **mode limité** avec des réponses basiques. Pour utiliser toutes les fonctionnalités intelligentes, configurez `VITE_GEMINI_API_KEY`.

## 💡 Astuces

1. **Réinitialiser la conversation**: Cliquez sur l'icône de reset (↻) dans le header du chat
2. **Questions complexes**: Le chatbot peut gérer des questions multi-parties
3. **Contexte**: Le chatbot se souvient de la conversation en cours

## 🛠️ Dépannage

### Erreur: "API key not found"
- Vérifiez que `VITE_GEMINI_API_KEY` est bien dans votre fichier `.env`
- Redémarrez le serveur de développement
- Une clé par défaut est déjà intégrée dans le code

### Erreur: "API quota exceeded"
- Gemini offre un quota gratuit généreux
- Vérifiez votre utilisation sur [Google Cloud Console](https://console.cloud.google.com/)
- Vous pouvez créer une nouvelle clé API si nécessaire

### Le chatbot ne comprend pas ma question
- Reformulez votre question de manière plus claire
- Utilisez les suggestions rapides pour voir des exemples
- Vérifiez que la clé API est bien configurée

## 📝 Notes Techniques

- **Modèle utilisé**: Gemini 2.5 Flash (modèle disponible dans v1beta)
- **API**: Google Generative AI (Gemini)
- **Function Calling**: Activé pour appeler les fonctions de calcul
- **Historique**: Conservé pendant la session (réinitialisable)
- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`

## 🔐 Sécurité

⚠️ **Important**: Ne commitez jamais votre clé API dans Git!

- Ajoutez `.env` à votre `.gitignore`
- Utilisez des variables d'environnement pour la production
- Pour Vercel/Netlify, configurez les variables dans le dashboard
- La clé Gemini par défaut est intégrée dans le code pour le développement, mais utilisez `.env` en production

