# Analyse de la page Futures Insights (Forex_Pricers)

**Date :** Février 2025  
**Périmètre :** Structure, flux de données, composants et intégration de la page « Futures Insights ». Aucune modification de code.

---

## 1. Identité et position dans l’app

| Élément | Valeur |
|--------|--------|
| **Nom** | Futures Insights |
| **Route** | `/futures-insights` |
| **Protection** | `ProtectedRoute` (accès authentifié) |
| **Sidebar** | Entrée « Futures Insights », icône `TrendingUp`, description « FX futures terminal with options & volatility data », badge « New » |
| **Fichier principal** | `src/pages/FuturesInsights.tsx` |

La page est un **terminal FX futures** intégré dans Forex_Pricers : sélection d’une devise, consultation des contrats futures, puis options et volatilité / Grecs. Les données proviennent d’un **projet Supabase dédié** (Futures Insights), dont les Edge Functions scrapent Barchart via Firecrawl.

---

## 2. Structure de la page

### 2.1 Arborescence des fichiers concernés

```
src/
├── pages/
│   └── FuturesInsights.tsx          → Point d’entrée : état de vue, handlers, rendu conditionnel
├── components/
│   ├── Layout.tsx                   → Enveloppe (sidebar, header app, contenu)
│   └── dashboard/                   → Composants partagés avec le “terminal”
│       ├── DashboardHeader.tsx      → Types ViewMode, Breadcrumb ; header “FX Futures Terminal” (non rendu ici)
│       ├── CurrencySelector.tsx     → Liste devises, boutons Futures / Vol & Greeks
│       ├── FuturesPanel.tsx         → Table des contrats futures
│       ├── OptionsPanel.tsx         → Chaîne d’options (calls/puts), maturités
│       ├── VolatilityPanel.tsx      → Volatilité et Grecs
│       ├── DataCard.tsx             → Carte avec titre + actions
│       ├── DataStates.tsx           → LoadingState, ErrorState, EmptyState
│       └── PriceChange.tsx          → Affichage variation (couleur +/−)
├── lib/
│   ├── api/
│   │   └── barchart.ts              → fetchCurrencies, fetchFutures, fetchOptions, fetchVolatility (Supabase Futures)
│   ├── supabase-futures.ts          → Client Supabase dédié (VITE_FUTURES_SUPABASE_*)
│   └── scrapeCache.ts              → Cache mémoire (TTL 10 min)
```

### 2.2 Rendu (JSX) de `FuturesInsights.tsx`

- **Layout** : la page est rendue dans `<Layout>`, donc avec la sidebar Forex_Pricers et le header applicatif (trigger sidebar, breadcrumbs optionnels du Layout, etc.).
- **Contenu** :
  - Un bloc **Currency selector + actions** : `CurrencySelector` (devise, boutons « Futures » et « Vol & Greeks »).
  - Puis, selon `view` :
    - `view === "futures"` et `selectedCurrency` → **FuturesPanel**
    - `view === "options"` et `selectedFuture` → **OptionsPanel**
    - `view === "volatility"` et `selectedFuture` et `optionSymbol` → **VolatilityPanel**

**Remarque :** `DashboardHeader` (et donc la barre « FX Futures Terminal » + fil d’Ariane) est **importé** pour les types `Breadcrumb` et `ViewMode`, mais **n’est pas rendu** dans le JSX. Les breadcrumbs sont mis à jour dans l’état (`handleBreadcrumbClick`, etc.) mais aucun composant ne les affiche sur cette page ; la navigation “retour” par breadcrumbs n’est pas disponible dans l’UI.

---

## 3. État et modes de vue

### 3.1 État local (`FuturesInsights.tsx`)

| État | Type | Rôle |
|------|------|------|
| `view` | `ViewMode` (`"home"` \| `"futures"` \| `"options"` \| `"volatility"`) | Vue affichée (panneau principal) |
| `selectedCurrency` | `CurrencyData \| null` | Devise choisie dans le sélecteur |
| `selectedFuture` | `FuturesContract \| null` | Contrat futur sélectionné (pour options / vol) |
| `optionSymbol` | `string` | Symbole option (ex. contrat) pour le panneau volatilité |
| `breadcrumbs` | `Breadcrumb[]` | Fil d’Ariane en mémoire (non affiché) |

### 3.2 Transitions de vue

- **Home** : seule la barre Currency + boutons est visible ; aucun panneau de données.
- **Futures** : clic « Futures » → `view = "futures"`, breadcrumbs mis à jour, affichage de `FuturesPanel` pour `selectedCurrency`.
- **Options** : clic sur une ligne dans `FuturesPanel` → `handleSelectFuture` → `view = "options"`, `selectedFuture` défini, affichage de `OptionsPanel`.
- **Volatility** :  
  - soit depuis la barre : « Vol & Greeks » sans avoir choisi un contrat → un pseudo-contrat est créé à partir de `selectedCurrency`, `view = "volatility"` ;  
  - soit depuis Options : « Vol & Greeks » sur un contrat → `handleViewVolatility(contract.contract)` → `optionSymbol` et `view = "volatility"`, affichage de `VolatilityPanel`.

Les handlers `handleBreadcrumbClick` mettent à jour `view` et `breadcrumbs` (et éventuellement `selectedFuture`), mais comme il n’y a pas de `DashboardHeader` rendu, l’utilisateur ne peut pas cliquer sur les breadcrumbs.

---

## 4. Composants utilisés

### 4.1 CurrencySelector

- **Props :** `selectedCurrency`, `onSelect`, `onLoadFutures`, `onLoadVolatility`.
- **Comportement :**
  - Au montage, appelle `fetchCurrencies()` (sans catégorie : une seule liste de devises, contrairement à ticker-peek-pro qui a des onglets Currencies / Energies / etc.).
  - Affiche un `<select>` avec déduplication par nom.
  - Si une devise est sélectionnée : boutons « Futures » et « Vol & Greeks », plus « Refresh Data ».
- **Différence avec ticker-peek-pro :** pas de `onLoadVolSurface`, pas d’onglets par catégorie de commodité.

### 4.2 FuturesPanel

- **Props :** `currency: CurrencyData`, `onSelect: (future: FuturesContract) => void`.
- **Données :** `fetchFutures(currency.symbol)` au montage / changement de `currency.symbol`, avec cache et `forceRefresh` sur bouton Refresh.
- **UI :** titre (nom + symbole), dernier cours + variation (PriceChange), `DataCard` avec tableau (Contract, Month, Last, Change, %, Open, High, Low, Volume, Open Int). Clic sur une ligne → `onSelect(future)`.
- **États :** loading, error, rawPreview (affiché en fallback si aucune ligne parsée).

### 4.3 OptionsPanel

- **Props :** `contract: FuturesContract`, `onViewVolatility?: (optionSymbol: string) => void`.
- **Données :** `fetchOptions(contract.contract, maturity)` ; sélecteur de maturité si `expirations` renvoyées.
- **UI :** onglets Calls / Puts, tableau par strike (Open, High, Low, Latest, Change, Bid, Ask, Volume, Open Int), bouton « Vol & Greeks » qui appelle `onViewVolatility(contract.contract)`.

### 4.4 VolatilityPanel

- **Props :** `contract: FuturesContract`, `optionSymbol: string`.
- **Données :** `fetchVolatility(contract.contract, optionSymbol, moneyness, maturity, optionsType)`.
- **UI :** sélecteurs Options Type, Maturity, Strikes (moneyness 5 / 20 / 50), onglets Calls/Puts, tableau Grecs (Strike, Latest, IV, Delta, Gamma, Theta, Vega, IV Skew, Last Trade).

### 4.5 Bloc commun : DataCard, DataStates, PriceChange

- **DataCard :** conteneur avec barre de titre et zone d’actions (ex. Refresh).
- **DataStates :** LoadingState (« Fetching from Barchart via Firecrawl »), ErrorState (message + Retry), EmptyState.
- **PriceChange :** parsing du nombre depuis la chaîne, couleur positive/négative, préfixe « + » si positif.

---

## 5. Données et backend

### 5.1 Client Supabase dédié (`supabase-futures.ts`)

- Variables d’environnement : `VITE_FUTURES_SUPABASE_URL`, `VITE_FUTURES_SUPABASE_PUBLISHABLE_KEY`.
- Le client `futuresSupabase` n’est créé que si les deux sont définis ; sinon `futuresSupabase === null`.
- `isFuturesSupabaseAvailable()` utilisé dans `barchart.ts` avant chaque appel ; si indisponible, retour immédiat avec un message d’erreur explicite (credentials Futures Insights non configurées).

### 5.2 Couche API (`barchart.ts`)

- **Import :** `futuresSupabase`, `isFuturesSupabaseAvailable` depuis `@/lib/supabase-futures` ; `getCached`, `setCache` depuis `@/lib/scrapeCache`.
- **Fonctions :**
  - `fetchCurrencies(forceRefresh)` : cache `currencies`, invoke `scrape-currencies` (sans body category).
  - `fetchFutures(symbol, forceRefresh)` : cache `futures:${symbol}`, invoke `scrape-futures` avec `{ symbol }`.
  - `fetchOptions(symbol, maturity?, forceRefresh)` : cache `options:${symbol}:${maturity}`, invoke `scrape-options`.
  - `fetchVolatility(futureSymbol, optionSymbol, moneyness?, maturity?, optionsType?, forceRefresh)` : cache avec clé détaillée, invoke `scrape-volatility`.
- En cas d’absence de credentials Futures : toutes renvoient `{ success: false, error: "Futures Insights Supabase credentials not configured..." }` sans appeler Supabase.

### 5.3 Cache

- **scrapeCache.ts** : cache mémoire (Map), TTL 10 minutes par défaut ; clés comme `currencies`, `futures:${symbol}`, etc. Partagé avec le reste de l’app si d’autres modules l’utilisent.

### 5.4 Types (barchart.ts)

- `CurrencyData`, `FuturesContract`, `OptionData`, `OptionsResponse`, `GreekRow`, `VolatilityResponse`, `OptionsTypeOption` : cohérents avec les réponses des Edge Functions (format attendu type “Barchart / Firecrawl”).

---

## 6. Flux utilisateur résumé

1. Utilisateur va sur `/futures-insights` (protégé).
2. Layout affiche la sidebar Forex_Pricers ; le contenu principal est le sélecteur de devise + boutons.
3. Chargement des devises via `fetchCurrencies()` (Supabase Futures → `scrape-currencies`).
4. L’utilisateur choisit une devise puis :
   - **Futures** : affichage de la liste des contrats ; clic sur un contrat → panneau Options.
   - **Vol & Greeks** : soit avec un pseudo-contrat (devise seule), soit après avoir choisi un contrat puis « Vol & Greeks » depuis Options → panneau Volatility.
5. Dans Options, sélecteur de maturité et onglets Calls/Puts ; dans Volatility, sélecteurs options type, maturité, moneyness, onglets Calls/Puts.

Aucune URL ne change (tout en état local) ; aucun fil d’Ariane visible pour revenir en arrière.

---

## 7. Points d’attention (sans modification de code)

1. **DashboardHeader non rendu** : les breadcrumbs sont maintenus en état mais jamais affichés ; l’utilisateur ne peut pas naviguer “Home → Futures → Options” par clic. Pour avoir le même comportement que le terminal autonome (ticker-peek-pro), il faudrait rendre `<DashboardHeader breadcrumbs={breadcrumbs} onBreadcrumbClick={handleBreadcrumbClick} />` dans FuturesInsights.
2. **Pas de Vol Surface 3D** : contrairement à ticker-peek-pro, il n’y a pas de vue “Vol Surface 3D” ni de composant du type VolSurfacePanel (ni `fetchVolSurface` / `scrape-vol-surface` dans barchart.ts de Forex_Pricers).
3. **Une seule liste de devises** : `fetchCurrencies` n’accepte pas de catégorie ; la liste est unique (souvent “currencies” côté Edge Function par défaut).
4. **Credentials Futures** : si `VITE_FUTURES_SUPABASE_URL` ou `VITE_FUTURES_SUPABASE_PUBLISHABLE_KEY` sont absents, toute la page affiche des erreurs “Futures Insights Supabase credentials not configured...” au chargement des devises (et pareil pour futures/options/vol si on contournait le sélecteur). Doc : `VERCEL_ENV_SETUP.md`.
5. **Projet Supabase séparé** : le dashboard Futures Insights repose sur un second projet Supabase (et ses Edge Functions scrape-*), distinct de celui utilisé pour l’auth et les données principales de Forex_Pricers.

---

## 8. Synthèse

La page **Futures Insights** est une sous-application “terminal FX futures” intégrée dans Forex_Pricers : elle utilise le **Layout** et la **sidebar** de l’app, un **client Supabase dédié** (Futures), et les **composants dashboard** (CurrencySelector, FuturesPanel, OptionsPanel, VolatilityPanel) alimentés par **barchart.ts** et le **cache mémoire**. L’état de la page (vue, devise, contrat, optionSymbol, breadcrumbs) est entièrement local ; les breadcrumbs ne sont pas affichés car **DashboardHeader** n’est pas rendu. La structure est claire et réutilise les mêmes briques que le terminal autonome (ticker-peek-pro), avec en moins la vue “Vol Surface 3D” et la navigation par breadcrumbs dans l’UI.
