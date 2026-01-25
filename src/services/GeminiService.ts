/**
 * Service Gemini pour clarifier et normaliser les messages utilisateur
 * L'IA ne fait QUE clarifier/comprendre, pas d'actions
 */
interface ClarificationResult {
  clarifiedMessage: string;
  confidence: number;
  detectedIntent?: string;
  corrections?: string[];
  extractedParams?: {
    currencyPair?: { base: string; quote: string };
    amount?: { value: number; currency: string };
    countries?: { from?: string; to?: string };
    strategyType?: string;
    timeHorizon?: string;
  };
  fxData?: {
    amount: number | null;
    currency: string | null;
    direction: 'receive' | 'pay' | null;
    maturity: string | null; // Format "XM" ou "YYYY-MM-DD", toujours converti en années dans le service
    baseCurrency: string | null;
    currentRate: number | null;
    Barriere: number | null;
    hedgeDirection: 'upside' | 'downside' | null;
    flowType?: 'single' | 'recurring_monthly' | 'recurring_custom' | null; // Type de flux : unique, récurrent mensuel, ou récurrent personnalisé
    useCustomPeriods?: boolean | null; // true si flux récurrents non mensuels nécessitant Custom Periods
    missingFields?: string[]; // Champs obligatoires manquants
    question?: string; // Question à poser si champs manquants (avec "?")
  };
}

class GeminiService {
  private static instance: GeminiService;
  private apiKey: string | null = null;
  private isEnabled: boolean = false;
  private availableModels: string[] = []; // Cache des modèles disponibles

  private constructor() {
    this.loadApiKey();
  }

  static getInstance(): GeminiService {
    if (!GeminiService.instance) {
      GeminiService.instance = new GeminiService();
    }
    return GeminiService.instance;
  }

  /**
   * Charge la clé API depuis localStorage
   */
  private loadApiKey(): void {
    try {
      const settings = localStorage.getItem('fxRiskManagerSettings');
      if (settings) {
        const parsed = JSON.parse(settings);
        this.apiKey = parsed.chat?.geminiApiKey || null;
        this.isEnabled = !!this.apiKey && this.apiKey.trim().length > 0 && parsed.chat?.enableAI === true;
        console.log('[GeminiService] Clé API chargée:', {
          hasKey: !!this.apiKey,
          keyLength: this.apiKey?.length || 0,
          enableAI: parsed.chat?.enableAI,
          isEnabled: this.isEnabled
        });
      } else {
        console.log('[GeminiService] Aucun settings trouvé dans localStorage');
        this.isEnabled = false;
      }
    } catch (error) {
      console.error('[GeminiService] Erreur lors du chargement de la clé API:', error);
      this.isEnabled = false;
    }
  }

  /**
   * Met à jour la clé API
   */
  updateApiKey(apiKey: string | null): void {
    this.apiKey = apiKey;
    // Réinitialiser le cache des modèles quand la clé change
    this.availableModels = [];
    
    // Vérifier aussi enableAI dans les settings
    try {
      const settings = localStorage.getItem('fxRiskManagerSettings');
      if (settings) {
        const parsed = JSON.parse(settings);
        this.isEnabled = !!apiKey && apiKey.trim().length > 0 && parsed.chat?.enableAI === true;
      } else {
        this.isEnabled = !!apiKey && apiKey.trim().length > 0;
      }
    } catch (error) {
      this.isEnabled = !!apiKey && apiKey.trim().length > 0;
    }
    console.log('[GeminiService] Clé API mise à jour:', {
      hasKey: !!this.apiKey,
      keyLength: this.apiKey?.length || 0,
      isEnabled: this.isEnabled
    });
  }

  /**
   * Vérifie si Gemini est disponible
   */
  isAvailable(): boolean {
    return this.isEnabled;
  }

  /**
   * Clarifie et normalise un message utilisateur
   * L'IA doit seulement comprendre et clarifier, pas faire d'actions
   */
  async clarifyMessage(
    userMessage: string,
    context?: {
      currentStep?: string;
      previousMessages?: string[];
      availableOptions?: string[];
    }
  ): Promise<ClarificationResult> {
    console.log('[GeminiService] clarifyMessage appelé:', {
      isEnabled: this.isEnabled,
      hasApiKey: !!this.apiKey,
      messageLength: userMessage.length
    });
    
    if (!this.isEnabled || !this.apiKey) {
      console.log('[GeminiService] Gemini non disponible, retour du message original');
      // Retourner le message tel quel si Gemini n'est pas disponible
      return {
        clarifiedMessage: userMessage,
        confidence: 1.0
      };
    }

    try {
      const prompt = this.buildClarificationPrompt(userMessage, context);
      console.log('[GeminiService] Prompt construit, appel API...');
      const response = await this.callGeminiAPI(prompt);
      console.log('[GeminiService] Réponse API reçue:', response);
      
      // Si l'API retourne null (tous les modèles ont échoué), retourner le message original
      if (!response) {
        console.warn('[GeminiService] API a retourné null, utilisation du fallback local');
        return {
          clarifiedMessage: userMessage,
          confidence: 0.5 // Confiance réduite pour indiquer que Gemini n'a pas fonctionné
        };
      }
      
      if (response && response.clarifiedMessage) {
        // Si c'est une réponse à une question (intent question_response ou explanation),
        // ou si la réponse est longue (probablement une explication), augmenter la confiance
        const isQuestionResponse = response.detectedIntent === 'question_response' || 
                                   response.detectedIntent === 'explanation' ||
                                   response.clarifiedMessage.length > 100;
        
        return {
          clarifiedMessage: response.clarifiedMessage,
          confidence: isQuestionResponse ? (response.confidence || 0.9) : (response.confidence || 0.8),
          detectedIntent: response.detectedIntent,
          corrections: response.corrections,
          extractedParams: response.extractedParams,
          fxData: response.fxData
        };
      }

      console.warn('[GeminiService] Réponse API invalide, retour du message original');
      // En cas d'erreur, retourner le message original
      return {
        clarifiedMessage: userMessage,
        confidence: 0.5 // Confiance réduite
      };
    } catch (error: any) {
      console.error('[GeminiService] Erreur lors de la clarification:', error);
      console.error('[GeminiService] Détails de l\'erreur:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        userMessage
      });
      
      // Si c'est une erreur 404 (modèle non disponible), c'est OK, on continue sans IA
      if (error.message?.includes('404') || error.message?.includes('NOT_FOUND')) {
        console.log('[GeminiService] Modèles Gemini non disponibles, utilisation du mode basique (sans IA)');
      }
      
      // En cas d'erreur, retourner le message original (le chat fonctionnera en mode basique)
      return {
        clarifiedMessage: userMessage,
        confidence: 1.0
      };
    }
  }

  /**
   * Construit le prompt pour Gemini
   */
  private buildClarificationPrompt(
    userMessage: string,
    context?: {
      currentStep?: string;
      previousMessages?: string[];
      availableOptions?: string[];
    }
  ): string {
    let prompt = `Tu es un expert des marchés financiers spécialisé en Forex, gestion du risque de change et produits de couverture (FX Forwards, FX Swaps, FX Options, Collars, Risk Reversals).

Tu conseilles des entreprises non financières, des trésoriers et des analystes risques basés principalement en Europe.

Tu raisonnes comme un Risk Manager FX professionnel, avec une logique claire, structurée et quantitative.

**MISSION PRINCIPALE**:
À partir d'un message utilisateur en langage naturel, tu dois :

**DÉTECTION DU TYPE DE MESSAGE**:

1. **Si c'est une QUESTION** (mots-clés: "comment", "explique", "qu'est-ce que", "pourquoi", "fonctionne", "définition", etc.) :
   - **Répondre de manière pédagogique et professionnelle** dans "clarifiedMessage"
   - Utiliser le contexte de la session si disponible (paire de devises, volume, maturité, etc.)
   - Fournir des explications claires avec des exemples concrets adaptés au contexte
   - Utiliser un vocabulaire finance de marché précis mais accessible
   - Mettre "detectedIntent" à "question_response" ou "explanation"
   - "fxData" peut être null pour les questions pures
   - **IMPORTANT** : Pour les questions, "clarifiedMessage" peut être long et détaillé (plusieurs paragraphes si nécessaire)
   
2. **Si c'est une DEMANDE DE COUVERTURE** (ex: "je reçois 1M USD dans 6 mois", "je suis basé en Suisse") :
   - Comprendre le contexte économique
   - Identifier automatiquement le risque de change
   - Extraire ou déduire les paramètres clés dans "fxData"
   - Déterminer le sens du hedge
   - Proposer une ou plusieurs stratégies de couverture adaptées
   - Demander uniquement les informations manquantes nécessaires

**RÈGLE CRITIQUE**: 
- ANALYSE le message client et extrait les informations explicitement mentionnées ou déductibles logiquement
- NE JAMAIS inventer des valeurs numériques non mentionnées (taux, montants, dates)
- POUR LES CHAMPS OPTIONNELS non mentionnés, utilise null
- RÉPONDS UNIQUEMENT avec un JSON valide, aucun texte supplémentaire
- PARSING INTELLIGENT : comprend les variations linguistiques (ex: "1M", "un million", "1 000 000")
- RAISONNE en logique de Risk Management professionnel

**Message utilisateur**: "${userMessage}"

**Contexte actuel**: ${context?.currentStep || 'Aucun contexte spécifique'}

**MÉMOIRE DE CONVERSATION**:
${context?.previousMessages && context.previousMessages.length > 0 
  ? `Historique de la conversation (pour contexte et continuité - utilise-le pour mieux comprendre le contexte) :\n${context.previousMessages.map((msg, idx) => `- Message ${idx + 1}: ${msg}`).join('\n')}\n\n**Instructions pour utiliser l'historique** :
- Si l'utilisateur fait référence à un message précédent (ex: "comme je disais", "comme mentionné", "pour le même flux"), utilise l'historique pour comprendre le contexte
- Si l'utilisateur complète des informations précédemment mentionnées, combine les informations de l'historique avec le message actuel
- Si l'utilisateur corrige ou modifie une information précédente, utilise la nouvelle information du message actuel
- Maintenir la cohérence : si l'utilisateur a mentionné sa devise fonctionnelle dans un message précédent, tu peux la réutiliser si elle n'est pas mentionnée dans le message actuel
- Pour les flux récurrents : si l'utilisateur a mentionné plusieurs dates dans des messages précédents, combine-les pour déterminer flowType: "recurring_custom"`
  : 'Aucun historique de conversation précédent. Traite le message comme une nouvelle conversation.'}

**EXTRACTION AUTOMATIQUE DES INFORMATIONS**:

Lorsque l'utilisateur décrit sa situation, tu dois identifier et structurer les éléments suivants :

**1. DEVISES**:
- Devise de référence (fonctionnelle) de l'entreprise
- Devise du flux futur
- Paire FX concernée (ex : EUR/USD, USD/JPY…)

Exemple : "Je suis basé en France et je reçois 1M USD"
→ Devise fonctionnelle : EUR
→ Devise du flux : USD
→ Paire : EUR/USD

**2. TYPE DE FLUX**:
- Entrée de cash (receivable) → "receive"
- Sortie de cash (payable) → "pay"

**3. MONTANT NOTIONNEL**:
- Montant du flux
- Devise du nominal

**4. HORIZON TEMPOREL ET FRÉQUENCE DES FLUX**:
- Maturité exacte ou approximative
- Time to maturity (en années, mois ou jours) - **TOUJOURS convertir en années (format décimal)**
- **IMPORTANT - DISTINCTION CRITIQUE ENTRE TYPES DE FLUX** :

**A. FLUX UNIQUE (flowType: "single")** :
- L'utilisateur reçoit/paie UNE SEULE FOIS à une date précise
- Exemples de détection :
  - "je reçois 1M USD dans 6 mois" → flowType: "single"
  - "je dois payer 500K EUR dans 3 mois" → flowType: "single"
  - "réception unique de 2M USD le 31 décembre" → flowType: "single"
- Mots-clés : "une fois", "unique", "dans X mois" (sans mention de répétition), "le [date]"
- **Stratégie** : Utiliser un hedging standard (Forward ou Option) pour la maturité unique
- **useCustomPeriods** : false ou null

**B. FLUX RÉCURRENTS MENSUELS (flowType: "recurring_monthly")** :
- L'utilisateur reçoit/paie CHAQUE MOIS de manière régulière
- Exemples de détection :
  - "je reçois 100K USD chaque mois pendant 12 mois" → flowType: "recurring_monthly"
  - "paiement mensuel de 50K EUR pendant 6 mois" → flowType: "recurring_monthly"
  - "je reçois 200K USD tous les mois" → flowType: "recurring_monthly"
- Mots-clés : "chaque mois", "tous les mois", "mensuel", "mensuellement", "par mois", "monthly"
- **Stratégie** : Utiliser le hedging mensuel standard (Monthly Hedging) - le système génère automatiquement les périodes mensuelles
- **useCustomPeriods** : false

**C. FLUX RÉCURRENTS NON MENSUELS (flowType: "recurring_custom")** :
- L'utilisateur reçoit/paie PLUSIEURS FOIS mais pas mensuellement (dates spécifiques différentes)
- Exemples de détection :
  - "je reçois 500K USD dans 3 mois, puis 500K dans 6 mois, puis 500K dans 9 mois" → flowType: "recurring_custom"
  - "paiements trimestriels de 1M USD" → flowType: "recurring_custom"
  - "je reçois 200K USD le 15 mars, 200K le 15 juin, 200K le 15 septembre" → flowType: "recurring_custom"
  - "plusieurs flux à des dates différentes" → flowType: "recurring_custom"
- Mots-clés : "plusieurs fois", "à plusieurs dates", "trimestriel", "trimestriellement", "dates spécifiques", "différentes dates", "puis", "ensuite"
- **Stratégie** : **UTILISER "Use Custom Periods Instead of Monthly Hedging"** - le système doit activer l'option Custom Periods pour définir des périodes personnalisées avec des volumes et dates spécifiques
- **useCustomPeriods** : true (OBLIGATOIRE pour ce type de flux)

**RÈGLES DE DÉTECTION** :
1. Si l'utilisateur mentionne "chaque mois", "mensuel", "tous les mois" → flowType: "recurring_monthly"
2. Si l'utilisateur mentionne plusieurs dates ou périodes différentes → flowType: "recurring_custom", useCustomPeriods: true
3. Si l'utilisateur mentionne UNE SEULE date/maturité sans répétition → flowType: "single"
4. En cas de doute, privilégier "single" et demander confirmation si nécessaire

**5. SENS DU RISQUE**:
Tu dois toujours répondre à la question : Que se passe-t-il si le taux de change évolue défavorablement ?

Exemples :
- Réception USD → Risque de baisse du USD vs EUR → hedgeDirection: "downside"
- Paiement USD → Risque de hausse du USD vs EUR → hedgeDirection: "upside"

**DÉTERMINATION DU SENS DU HEDGE**:

Tu dois automatiquement déduire :
- Acheter ou vendre la devise étrangère
- Position économique long / short sur la devise
- Type de protection recherchée :
  - Protection totale
  - Protection avec participation favorable
  - Budget de prime nul ou non

**STRATÉGIES DE COUVERTURE À CONSIDÉRER**:

Selon le profil utilisateur et les contraintes, proposer :
- FX Forward (couverture simple, sans optionalité)
- FX Option (Call / Put)
- Zero-Cost Collar
- Participating Forward
- Risk Reversal

Tu dois expliquer pourquoi une stratégie est adaptée (dans le champ "detectedIntent" et "clarifiedMessage").

**GESTION DES INFORMATIONS MANQUANTES**:

Si certaines données sont absentes, tu dois les demander explicitement, sans supposition hasardeuse.

Exemples d'informations à demander si absentes :
- Volatilité implicite
- Taux d'intérêt des deux devises
- Spot FX actuel
- Niveau de protection souhaité
- Contraintes de coût (prime, zero cost, etc.)

Tu dois poser des questions précises, professionnelles et limitées.

**EXEMPLE DE RAISONNEMENT ATTENDU**:

Si l'utilisateur dit : "Je reçois 1M USD dans 6 mois, je suis basé en France"

Tu dois comprendre que :
- Il est long USD / short EUR
- Il est exposé à une baisse de USD
- Il doit vendre USD / acheter EUR pour se couvrir
- Un Put USD / Call EUR ou un Forward de vente USD est pertinent

**CONTRAINTES IMPORTANTES**:
- Ne jamais inventer de données numériques
- Ne jamais donner de conseil réglementaire
- Rester pédagogique mais professionnel
- Utiliser un vocabulaire finance de marché précis
- Toujours raisonner en logique de Risk Management

**CHAMPS À EXTRAIRE - FX Data Extraction**:

**Champs Obligatoires**:
- **amount** (number|null): montant numérique sans devise (ex: 1000000 pour "1M", 500000 pour "500K")
- **currency** (string|null): devise du flux futur (USD, EUR, GBP, CHF, JPY, CAD, AUD, MAD, MXN, etc.)
- **direction** (string|null): "receive" (entrée de cash/receivable) ou "pay" (sortie de cash/payable)
- **maturity** (string|null): **IMPORTANT**: Toujours convertir en années au format décimal (ex: "6M" → "0.5", "3M" → "0.25", "2024-12-31" → calculer les jours jusqu'à cette date / 365)
- **baseCurrency** (string|null): devise de référence (fonctionnelle) de l'entreprise. Si le client mentionne un pays (ex: "je réside en France", "je suis basé en France"), déduis la devise (EUR). C'est la devise dans laquelle l'entreprise mesure ses résultats.

**Champs Optionnels**:
- **currentRate** (number|null): taux de change spot actuel mentionné. Si non mentionné, mets null (le système le cherchera automatiquement)
- **Barriere** (number|null): niveau de protection souhaité (seuil max/min) - niveau de strike ou barrière pour les options
- **hedgeDirection** (string|null): "upside" (protection contre la hausse) ou "downside" (protection contre la baisse). **DÉDUIS automatiquement** : 
  - Réception devise étrangère → risque baisse → "downside"
  - Paiement devise étrangère → risque hausse → "upside"
- **flowType** (string|null): "single" (flux unique), "recurring_monthly" (flux récurrents mensuels), ou "recurring_custom" (flux récurrents non mensuels). **DÉDUIS automatiquement** selon les règles de détection ci-dessus
- **useCustomPeriods** (boolean|null): true si flowType = "recurring_custom", false si flowType = "recurring_monthly" ou "single", null si flowType non déterminé. **CRITIQUE** : Ce champ indique au système d'utiliser "Use Custom Periods Instead of Monthly Hedging"
- **flowType** (string|null): Type de flux - **IMPORTANT à identifier** :
  - "single" : Flux unique à une date précise (ex: "je reçois 1M USD dans 6 mois")
  - "recurring_monthly" : Flux récurrents mensuels (ex: "je reçois 100K USD chaque mois")
  - "recurring_custom" : Flux récurrents non mensuels avec dates/volumes spécifiques (ex: "je reçois 500K dans 3 mois, 500K dans 6 mois, 500K dans 9 mois")
- **useCustomPeriods** (boolean|null): true si flowType = "recurring_custom", false sinon. Indique qu'il faut utiliser "Use Custom Periods Instead of Monthly Hedging"

**Règles de Conversion**:

**Montants**:
- "1M", "1 million" → 1000000
- "500K", "500 mille" → 500000
- "2,5M" → 2500000
- "1.5M" → 1500000
- "10 m dirhams" → 10000000

**Devises (normalisation)**:
- "dollar", "dollars", "$", "USD" → "USD"
- "euro", "euros", "€", "EUR" → "EUR"
- "livre", "livres", "£", "GBP" → "GBP"
- "yen", "¥", "JPY" → "JPY"
- "dirham", "dirhams", "MAD" → "MAD"
- "peso", "pesos", "MXN" → "MXN"
- Mapping pays → devises: Maroc → MAD, Mexique → MXN, France → EUR, USA → USD, UK → GBP, Japon → JPY, Suisse → CHF, etc.

**Direction**:
- "recevoir", "reçois", "encaisser", "perception", "je reçois" → "receive"
- "payer", "paie", "décaisser", "verser", "je dois payer" → "pay"

**Maturité** (TOUJOURS convertir en années):
- "dans X mois" → calculer X/12 (ex: "6 mois" → "0.5")
- "dans X semaines" → calculer approximatif en mois puis /12
- Date précise "YYYY-MM-DD" → calculer (date - aujourd'hui) / 365 jours
- "3M", "6M" → convertir en années (3M = 0.25, 6M = 0.5)

**Direction de couverture** (hedgeDirection):
- "couvrir à la baisse", "protection baisse", "ne pas descendre", "se protéger contre la baisse", "risque de baisse" → "downside"
- "couvrir à la hausse", "protection hausse", "ne pas monter", "se protéger contre la hausse", "risque de hausse" → "upside"
- **DÉDUCTION AUTOMATIQUE** : Si non mentionné explicitement, déduis selon la logique Risk Manager :
  - direction: "receive" + currency: "USD" + baseCurrency: "EUR" → hedgeDirection: "downside" (risque que USD baisse vs EUR)
  - direction: "pay" + currency: "USD" + baseCurrency: "EUR" → hedgeDirection: "upside" (risque que USD monte vs EUR)

**LOGIQUE DE RÉPONSE**:

**Si des champs OBLIGATOIRES manquent** (amount, currency, direction, maturity, baseCurrency):
- Retourne un JSON avec "fxData" contenant les champs trouvés (y compris ceux déduits logiquement)
- Ajoute "missingFields" avec la liste des champs manquants
- Ajoute "question" avec une question professionnelle en français demandant le champ manquant, **OBLIGATOIREMENT avec le symbole "?" à la fin**
- Formule la question comme un Risk Manager professionnel (ex: "Quelle est la maturité de votre flux de trésorerie?" plutôt que "Quand?")

**Si tous les champs obligatoires sont présents**:
- Retourne le JSON complet avec tous les champs extraits
- Maturity doit être en années (format décimal, ex: 0.5 pour 6 mois)
- Dans "clarifiedMessage", normalise le message en langage professionnel finance de marché
- Dans "detectedIntent", indique la stratégie de couverture la plus adaptée (ex: "fx_forward", "fx_option_put", "zero_cost_collar", "participating_forward", "risk_reversal")

**Format de réponse JSON**:

**Cas 1 - Champs manquants**:
{
  "clarifiedMessage": "message normalisé",
  "detectedIntent": "strategy_simulation",
  "fxData": {
    "amount": 1000000,
    "currency": "USD",
    "direction": "receive",
    "maturity": null,
    "baseCurrency": "EUR",
    "currentRate": null,
    "Barriere": null,
    "hedgeDirection": null,
    "missingFields": ["maturity"],
    "question": "Quelle est la maturité de votre flux de trésorerie?"
  }
}

**Cas 2 - Tous les champs présents (flux unique)**:
{
  "clarifiedMessage": "message normalisé",
  "detectedIntent": "strategy_simulation",
  "fxData": {
    "amount": 1000000,
    "currency": "USD",
    "direction": "receive",
    "maturity": "0.5",
    "baseCurrency": "EUR",
    "currentRate": 1.17,
    "Barriere": 1.22,
    "hedgeDirection": "downside",
    "flowType": "single",
    "useCustomPeriods": false
  }
}

**Cas 3 - Flux récurrents non mensuels (nécessite Custom Periods)**:
{
  "clarifiedMessage": "Réception de 500K USD à plusieurs dates spécifiques, devise fonctionnelle EUR. Utiliser Custom Periods.",
  "detectedIntent": "strategy_simulation",
  "fxData": {
    "amount": 500000,
    "currency": "USD",
    "direction": "receive",
    "maturity": "0.75",
    "baseCurrency": "EUR",
    "currentRate": null,
    "Barriere": null,
    "hedgeDirection": "downside",
    "flowType": "recurring_custom",
    "useCustomPeriods": true
  }
}

**Exemples de parsing avec raisonnement Risk Manager**:

Exemple 1: "Je reçois 1M USD dans 6 mois, ma devise principale est EUR. Le taux actuel est 1,17 et je veux me couvrir à la baisse avec un maximum à 1,22"
→ Analyse : Long USD / Short EUR. Risque de baisse USD vs EUR. Besoin de protection downside. Flux unique (une seule réception).
→ {
  "clarifiedMessage": "Réception de 1 000 000 USD dans 6 mois, devise fonctionnelle EUR. Taux spot 1,17. Protection downside souhaitée avec barrière à 1,22. Flux unique.",
  "detectedIntent": "fx_option_put",
  "fxData": {
    "amount": 1000000,
    "currency": "USD",
    "direction": "receive",
    "maturity": "0.5",
    "baseCurrency": "EUR",
    "currentRate": 1.17,
    "Barriere": 1.22,
    "hedgeDirection": "downside",
    "flowType": "single",
    "useCustomPeriods": false
  }
}

Exemple 2: "je réside au maroc, je veux acheter du café au mexique, 10 millions dirhams, je veux me protéger"
→ Analyse : Paiement en MAD (ou conversion MAD→MXN?). Flux payable. Risque de hausse de la devise étrangère si paiement en MXN.
→ {
  "clarifiedMessage": "Paiement de 10 000 000 MAD pour achat au Mexique. Protection contre risque de change requis.",
  "detectedIntent": "strategy_simulation",
  "fxData": {
    "amount": 10000000,
    "currency": "MAD",
    "direction": "pay",
    "maturity": null,
    "baseCurrency": "MAD",
    "currentRate": null,
    "Barriere": null,
    "hedgeDirection": null,
    "missingFields": ["maturity"],
    "question": "Quelle est la maturité de votre flux de trésorerie? Dans quelle devise se fera le paiement final (MAD ou MXN)?"
  }
}

Exemple 3: "Je suis basé en France et je reçois 1M USD dans 6 mois"
→ Analyse : Long USD / Short EUR. Risque de baisse USD vs EUR. Hedge direction: downside (déduit automatiquement). Flux unique.
→ {
  "clarifiedMessage": "Réception de 1 000 000 USD dans 6 mois, devise fonctionnelle EUR. Exposition au risque de baisse USD/EUR. Flux unique nécessitant un hedging standard.",
  "detectedIntent": "fx_forward",
  "fxData": {
    "amount": 1000000,
    "currency": "USD",
    "direction": "receive",
    "maturity": "0.5",
    "baseCurrency": "EUR",
    "currentRate": null,
    "Barriere": null,
    "hedgeDirection": "downside",
    "flowType": "single",
    "useCustomPeriods": false
  }
}

Exemple 4: "Je reçois 100K USD chaque mois pendant 12 mois, je suis basé en Suisse"
→ Analyse : Flux récurrents mensuels (chaque mois). Long USD / Short CHF. Risque de baisse USD vs CHF. Utiliser Monthly Hedging standard.
→ {
  "clarifiedMessage": "Réception récurrente de 100 000 USD chaque mois pendant 12 mois, devise fonctionnelle CHF. Exposition au risque de baisse USD/CHF. Utiliser Monthly Hedging standard.",
  "detectedIntent": "strategy_simulation",
  "fxData": {
    "amount": 100000,
    "currency": "USD",
    "direction": "receive",
    "maturity": "1.0",
    "baseCurrency": "CHF",
    "currentRate": null,
    "Barriere": null,
    "hedgeDirection": "downside",
    "flowType": "recurring_monthly",
    "useCustomPeriods": false
  }
}

Exemple 5: "Je reçois 500K USD dans 3 mois, puis 500K dans 6 mois, puis 500K dans 9 mois, je suis basé en Suisse"
→ Analyse : Flux récurrents non mensuels avec dates spécifiques (plusieurs dates différentes). Long USD / Short CHF. Nécessite Custom Periods.
→ {
  "clarifiedMessage": "Réception de 500 000 USD à 3 dates différentes (3, 6 et 9 mois), devise fonctionnelle CHF. Exposition au risque de baisse USD/CHF. Utiliser 'Use Custom Periods Instead of Monthly Hedging' pour définir les périodes personnalisées.",
  "detectedIntent": "strategy_simulation",
  "fxData": {
    "amount": 500000,
    "currency": "USD",
    "direction": "receive",
    "maturity": "0.75",
    "baseCurrency": "CHF",
    "currentRate": null,
    "Barriere": null,
    "hedgeDirection": "downside",
    "flowType": "recurring_custom",
    "useCustomPeriods": true
  }
}

Exemple 5: "Je reçois 500K USD dans 3 mois, puis 500K dans 6 mois, puis 500K dans 9 mois, je suis basé en Suisse"
→ Analyse : Flux récurrents non mensuels avec dates spécifiques. Long USD / Short CHF. Nécessite Custom Periods.
→ {
  "clarifiedMessage": "Réception de 500 000 USD à 3 dates différentes (3, 6 et 9 mois), devise fonctionnelle CHF. Exposition au risque de baisse USD/CHF. Utiliser 'Use Custom Periods Instead of Monthly Hedging' pour définir les périodes personnalisées.",
  "detectedIntent": "strategy_simulation",
  "fxData": {
    "amount": 500000,
    "currency": "USD",
    "direction": "receive",
    "maturity": "0.75",
    "baseCurrency": "CHF",
    "currentRate": null,
    "Barriere": null,
    "hedgeDirection": "downside",
    "flowType": "recurring_custom",
    "useCustomPeriods": true
  }
}

**IMPORTANT - RÈGLES PROFESSIONNELLES**:
- Si l'utilisateur oublie un champ obligatoire, tu DOIS retourner "question" avec "?" à la fin (formulation professionnelle)
- Maturity doit TOUJOURS être en années (format décimal, ex: 0.5, 0.25, 1.0)
- currentRate peut être null si non mentionné (le système le cherchera automatiquement)
- baseCurrency peut être déduit du pays mentionné (ex: "je réside en France", "je suis basé en France" → EUR)
- hedgeDirection doit être déduit automatiquement selon la logique Risk Manager si non mentionné explicitement
- Utilise un vocabulaire finance de marché précis dans "clarifiedMessage" (ex: "flux de trésorerie", "exposition au risque de change", "couverture", "devise fonctionnelle")
- Dans "detectedIntent", suggère la stratégie la plus adaptée selon le profil (forward simple, option, collar, etc.)
- Ne jamais inventer de données numériques (taux, montants, dates)
- Toujours raisonner en logique de Risk Management professionnel

**INSTRUCTION FINALE CRITIQUE**:

**Si c'est une QUESTION** (mots-clés: "comment", "explique", "qu'est-ce que", "pourquoi", "fonctionne", "définition", etc.) :
- Dans "clarifiedMessage", fournis une **réponse complète, pédagogique et professionnelle** (peut être longue, plusieurs paragraphes)
- Utilise le contexte de la session (fourni dans previousMessages) pour personnaliser la réponse
- Inclus des exemples concrets adaptés au contexte de l'utilisateur
- "detectedIntent" doit être "question_response" ou "explanation"
- "fxData" peut être null si ce n'est pas une demande de couverture

**Si c'est une DEMANDE DE COUVERTURE** :
- Réponds UNIQUEMENT avec un JSON valide, sans aucun texte avant ou après
- Le JSON doit commencer par { et se terminer par }
- Ne pas inclure de markdown, de code blocks, ou de texte explicatif

**Format JSON pour les deux cas**:
{
  "clarifiedMessage": "ta réponse complète ici (peut être longue pour les questions)",
  "detectedIntent": "question_response" | "explanation" | "strategy_simulation" | etc.,
  "fxData": { ... } ou null
}

**EXEMPLE pour une question**:
Message: "comment fonctionne le hedging"
→ {
  "clarifiedMessage": "Le hedging (couverture) est une stratégie financière qui permet de protéger votre entreprise contre les fluctuations défavorables des taux de change. Dans votre cas avec CHF/USD... [explication détaillée avec exemples adaptés au contexte]",
  "detectedIntent": "question_response",
  "fxData": null
}`;

    if (context?.availableOptions && context.availableOptions.length > 0) {
      prompt += `\n\n**Options disponibles**: ${context.availableOptions.join(', ')}`;
    }

    return prompt;
  }

  /**
   * Appelle l'API Gemini
   */
  private async callGeminiAPI(prompt: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }

    try {
      // D'abord, obtenir la liste des modèles disponibles
      const availableModels = await this.listAvailableModels();
      
      // Trouver un modèle utilisable
      const modelToUse = this.findUsableModel(availableModels);
      
      if (!modelToUse) {
        throw new Error('Aucun modèle Gemini disponible. Vérifiez votre clé API.');
      }

      // Essayer d'abord avec v1beta
      const apiVersions = ['v1beta', 'v1'];
      
      for (const version of apiVersions) {
        try {
          const apiUrl = `https://generativelanguage.googleapis.com/${version}/models/${modelToUse}:generateContent?key=${this.apiKey}`;
          console.log(`[GeminiService] Essai avec modèle: ${modelToUse} (${version})`);
          
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: prompt
                    }
                  ]
                }
              ],
                generationConfig: {
                  temperature: 0.2, // Réduire pour plus de cohérence
                  topK: 40,
                  topP: 0.95,
                  maxOutputTokens: 2000, // Augmenté pour éviter les réponses tronquées avec le nouveau prompt détaillé
                }
            })
          });

          if (response.ok) {
            const data = await response.json();
            console.log(`[GeminiService] ✅ Succès avec modèle: ${modelToUse} (${version})`);
            console.log('[GeminiService] Données brutes reçues:', JSON.stringify(data).substring(0, 500));
            
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text && text.trim().length > 0) {
              console.log('[GeminiService] Texte extrait de la réponse:', text.substring(0, 200));
              return this.parseGeminiResponse(text);
            } else {
              console.warn('[GeminiService] Aucun texte trouvé dans la réponse Gemini');
              console.warn('[GeminiService] Structure de la réponse:', JSON.stringify(data, null, 2).substring(0, 1000));
              // Essayer la version suivante ou le modèle suivant
              continue;
            }
          } else if (response.status === 404) {
            // Modèle non disponible sur cette version, essayer la suivante
            console.log(`[GeminiService] Modèle ${modelToUse} non disponible sur ${version}, essai suivant...`);
            continue;
          } else {
            // Autre erreur, essayer la version suivante
            const errorData = await response.text();
            console.log(`[GeminiService] Erreur ${response.status} avec ${version}, essai suivant...`);
            continue;
          }
        } catch (error: any) {
          if (error.message?.includes('404')) {
            continue; // Essayer la version suivante
          }
          // Si ce n'est pas une 404, continuer quand même pour essayer l'autre version
          console.log(`[GeminiService] Erreur avec ${version}:`, error.message);
          continue;
        }
      }
      
      // Si toutes les versions ont échoué, essayer avec d'autres modèles disponibles
      console.log('[GeminiService] Le modèle principal a échoué, essai avec d\'autres modèles disponibles...');
      for (const model of availableModels.slice(0, 5)) { // Essayer les 5 premiers modèles
        if (model === modelToUse) continue; // Déjà essayé
        
        for (const version of apiVersions) {
          try {
            const apiUrl = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${this.apiKey}`;
            console.log(`[GeminiService] Essai avec modèle alternatif: ${model} (${version})`);
            
            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: prompt
                      }
                    ]
                  }
                ],
                generationConfig: {
                  temperature: 0.2, // Réduire pour plus de cohérence
                  topK: 40,
                  topP: 0.95,
                  maxOutputTokens: 2000, // Augmenté pour éviter les réponses tronquées
                }
              })
            });

            if (response.ok) {
              const data = await response.json();
              console.log(`[GeminiService] ✅ Succès avec modèle alternatif: ${model} (${version})`);
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text && text.trim().length > 0) {
                console.log('[GeminiService] Texte extrait de la réponse (modèle alternatif):', text.substring(0, 200));
                return this.parseGeminiResponse(text);
              } else {
                console.warn('[GeminiService] Aucun texte trouvé dans la réponse (modèle alternatif)');
                continue;
              }
            }
          } catch (error) {
            continue; // Essayer le modèle suivant
          }
        }
      }
      
      // Si tous les modèles ont échoué, ne pas throw mais retourner null pour que le fallback prenne le relais
      console.warn('[GeminiService] Tous les modèles Gemini ont échoué, utilisation du fallback local');
      return null;
    } catch (error) {
      console.error('[GeminiService] Error calling Gemini API:', error);
      // Ne pas throw l'erreur, retourner null pour permettre le fallback
      return null;
    }
  }

  /**
   * Parse la réponse texte de Gemini en JSON structuré
   */
  private parseGeminiResponse(text: string): any {
    try {
      let cleanedText = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      // Si le texte commence par {, c'est probablement du JSON
      if (cleanedText.startsWith('{')) {
        // Trouver la première { et la dernière }
        const firstBrace = cleanedText.indexOf('{');
        let lastBrace = cleanedText.lastIndexOf('}');
        
        // Si la dernière } n'existe pas ou est avant la première {, chercher plus intelligemment
        if (lastBrace === -1 || lastBrace <= firstBrace) {
          // Compter les accolades pour trouver la fin du JSON
          let braceCount = 0;
          let inString = false;
          let escapeNext = false;
          
          for (let i = firstBrace; i < cleanedText.length; i++) {
            const char = cleanedText[i];
            
            if (escapeNext) {
              escapeNext = false;
              continue;
            }
            
            if (char === '\\') {
              escapeNext = true;
              continue;
            }
            
            if (char === '"' && !escapeNext) {
              inString = !inString;
              continue;
            }
            
            if (!inString) {
              if (char === '{') braceCount++;
              if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                  lastBrace = i;
                  break;
                }
              }
            }
          }
        }
        
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
        }
      }
      
      // Essayer de réparer le JSON si nécessaire (guillemets non fermés, etc.)
      cleanedText = this.repairJson(cleanedText);
      
      const parsed = JSON.parse(cleanedText);
      console.log('[GeminiService] JSON parsé avec succès:', parsed);
      
      // Valider que la structure de base est correcte
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Réponse JSON invalide: pas un objet');
      }
      
      // S'assurer que clarifiedMessage existe
      if (!parsed.clarifiedMessage || typeof parsed.clarifiedMessage !== 'string') {
        console.warn('[GeminiService] clarifiedMessage manquant ou invalide, utilisation du message original');
        parsed.clarifiedMessage = text.substring(0, 200); // Utiliser un extrait du texte
      }
      
      return parsed;
    } catch (parseError: any) {
      console.error('[GeminiService] Erreur lors du parsing JSON:', parseError);
      console.error('[GeminiService] Texte reçu de Gemini:', text.substring(0, 500));
      try {
        const cleanedTextForLog = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        console.error('[GeminiService] Texte nettoyé:', cleanedTextForLog.substring(0, 500));
      } catch (e) {
        // Ignorer si le nettoyage échoue
      }
      // Si le parsing échoue, essayer d'extraire le message clarifié directement
      // Chercher "clarifiedMessage" dans le texte (avec gestion des chaînes tronquées)
      let clarifiedMatch = text.match(/"clarifiedMessage"\s*:\s*"([^"]+)"/);
      
      // Si pas trouvé avec le pattern simple, essayer d'extraire même si la chaîne est tronquée
      if (!clarifiedMatch) {
        const startPattern = /"clarifiedMessage"\s*:\s*"/;
        const startMatch = text.match(startPattern);
        if (startMatch) {
          const startIndex = startMatch.index! + startMatch[0].length;
          // Chercher la fin de la chaîne ou prendre jusqu'à la fin si tronquée
          let endIndex = text.indexOf('"', startIndex);
          if (endIndex === -1) {
            // Si pas de guillemet fermant, prendre jusqu'à la fin ou jusqu'à une virgule/accolade
            endIndex = Math.min(
              text.indexOf(',', startIndex) !== -1 ? text.indexOf(',', startIndex) : text.length,
              text.indexOf('\n', startIndex) !== -1 ? text.indexOf('\n', startIndex) : text.length,
              text.indexOf('}', startIndex) !== -1 ? text.indexOf('}', startIndex) : text.length
            );
          }
          const extractedValue = text.substring(startIndex, endIndex).trim();
          if (extractedValue) {
            clarifiedMatch = [null, extractedValue];
          }
        }
      }
      
      const intentMatch = text.match(/"detectedIntent"\s*:\s*"([^"]+)"/);
      
      // Essayer d'extraire les paramètres même si le JSON n'est pas parfait
      let extractedParams: any = null;
      
      // Pattern plus flexible pour currencyPair (gère les espaces et ordre variable)
      const currencyPairBaseMatch = text.match(/"base"\s*:\s*"([A-Z]{3})"/i);
      const currencyPairQuoteMatch = text.match(/"quote"\s*:\s*"([A-Z]{3})"/i);
      
      // Pattern pour amount
      const amountValueMatch = text.match(/"value"\s*:\s*(\d+(?:\.\d+)?)/);
      const amountCurrencyMatch = text.match(/"currency"\s*:\s*"([A-Z]{3})"/i);
      
      if (currencyPairBaseMatch && currencyPairQuoteMatch) {
        extractedParams = extractedParams || {};
        extractedParams.currencyPair = {
          base: currencyPairBaseMatch[1].toUpperCase(),
          quote: currencyPairQuoteMatch[1].toUpperCase()
        };
      }
      
      if (amountValueMatch && amountCurrencyMatch) {
        extractedParams = extractedParams || {};
        extractedParams.amount = {
          value: parseFloat(amountValueMatch[1]),
          currency: amountCurrencyMatch[1].toUpperCase()
        };
      }
      
      // Extraire les pays si présents
      const countriesFromMatch = text.match(/"from"\s*:\s*"([^"]+)"/i);
      const countriesToMatch = text.match(/"to"\s*:\s*"([^"]+)"/i);
      if (countriesFromMatch || countriesToMatch) {
        extractedParams = extractedParams || {};
        extractedParams.countries = {};
        if (countriesFromMatch) extractedParams.countries.from = countriesFromMatch[1];
        if (countriesToMatch) extractedParams.countries.to = countriesToMatch[1];
      }
      
      // Essayer d'extraire fxData même si le JSON est mal formé
      let fxData: any = null;
      // Pattern amélioré pour gérer les nombres et null
      const fxDataAmountMatch = text.match(/"amount"\s*:\s*(null|\d+(?:\.\d+)?)/);
      const fxDataCurrencyMatch = text.match(/"currency"\s*:\s*(null|"([A-Z]{3})")/i);
      const fxDataDirectionMatch = text.match(/"direction"\s*:\s*(null|"([^"]+)")/i);
      const fxDataMaturityMatch = text.match(/"maturity"\s*:\s*(null|"([^"]+)")/i);
      const fxDataBaseCurrencyMatch = text.match(/"baseCurrency"\s*:\s*(null|"([A-Z]{3})")/i);
      const fxDataCurrentRateMatch = text.match(/"currentRate"\s*:\s*(null|\d+(?:\.\d+)?)/);
      const fxDataBarriereMatch = text.match(/"Barriere"\s*:\s*(null|\d+(?:\.\d+)?)/);
      const fxDataHedgeDirectionMatch = text.match(/"hedgeDirection"\s*:\s*(null|"([^"]+)")/i);
      const missingFieldsMatch = text.match(/"missingFields"\s*:\s*\[([^\]]+)\]/);
      const questionMatch = text.match(/"question"\s*:\s*"([^"]+)"/);
      
      if (fxDataAmountMatch || fxDataCurrencyMatch || fxDataDirectionMatch || fxDataMaturityMatch || fxDataBaseCurrencyMatch) {
        fxData = {};
        if (fxDataAmountMatch && fxDataAmountMatch[1] !== 'null') {
          fxData.amount = parseFloat(fxDataAmountMatch[1]);
        }
        if (fxDataCurrencyMatch && fxDataCurrencyMatch[1] !== 'null' && fxDataCurrencyMatch[2]) {
          fxData.currency = fxDataCurrencyMatch[2].toUpperCase();
        }
        if (fxDataDirectionMatch && fxDataDirectionMatch[1] !== 'null' && fxDataDirectionMatch[2]) {
          fxData.direction = fxDataDirectionMatch[2];
        }
        if (fxDataMaturityMatch && fxDataMaturityMatch[1] !== 'null' && fxDataMaturityMatch[2]) {
          fxData.maturity = fxDataMaturityMatch[2];
        }
        if (fxDataBaseCurrencyMatch && fxDataBaseCurrencyMatch[1] !== 'null' && fxDataBaseCurrencyMatch[2]) {
          fxData.baseCurrency = fxDataBaseCurrencyMatch[2].toUpperCase();
        }
        if (fxDataCurrentRateMatch && fxDataCurrentRateMatch[1] !== 'null') {
          fxData.currentRate = parseFloat(fxDataCurrentRateMatch[1]);
        }
        if (fxDataBarriereMatch && fxDataBarriereMatch[1] !== 'null') {
          fxData.Barriere = parseFloat(fxDataBarriereMatch[1]);
        }
        if (fxDataHedgeDirectionMatch && fxDataHedgeDirectionMatch[1] !== 'null' && fxDataHedgeDirectionMatch[2]) {
          fxData.hedgeDirection = fxDataHedgeDirectionMatch[2];
        }
        if (missingFieldsMatch) {
          const fields = missingFieldsMatch[1].split(',').map(f => f.trim().replace(/"/g, ''));
          fxData.missingFields = fields;
        }
        if (questionMatch) fxData.question = questionMatch[1];
      }
      
      if (clarifiedMatch) {
        const result: any = {
          clarifiedMessage: clarifiedMatch[1],
          confidence: 0.7,
          detectedIntent: intentMatch ? intentMatch[1] : undefined,
        };
        
        if (extractedParams) {
          result.extractedParams = extractedParams;
        }
        
        if (fxData) {
          result.fxData = fxData;
        }
        
        console.log('[GeminiService] Données extraites via fallback:', result);
        return result;
      }
      
      // Dernier recours : utiliser le texte tel quel
      console.warn('[GeminiService] Aucune donnée extraite, utilisation du texte brut');
      return {
        clarifiedMessage: text.trim().substring(0, 500), // Limiter la longueur
        confidence: 0.5
      };
    }
  }

  /**
   * Tente de réparer un JSON mal formé (chaînes non terminées, etc.)
   */
  private repairJson(jsonText: string): string {
    try {
      // Vérifier si le JSON est valide
      JSON.parse(jsonText);
      return jsonText;
    } catch (error) {
      // Si erreur, essayer de réparer
      let repaired = jsonText;
      
      // Réparer les chaînes non terminées dans les valeurs
      // Chercher les patterns "key": "value non terminée
      const stringPattern = /"([^"]+)":\s*"([^"]*)$/;
      const match = repaired.match(stringPattern);
      
      if (match) {
        // Fermer la chaîne et ajouter les accolades manquantes
        const beforeMatch = repaired.substring(0, match.index! + match[0].length);
        const afterMatch = repaired.substring(match.index! + match[0].length);
        
        // Fermer la chaîne
        repaired = beforeMatch + '"';
        
        // Compter les accolades ouvertes/fermées
        const openBraces = (repaired.match(/{/g) || []).length;
        const closeBraces = (repaired.match(/}/g) || []).length;
        
        // Ajouter les accolades fermantes manquantes
        if (openBraces > closeBraces) {
          // Ajouter les propriétés manquantes si nécessaire
          if (!repaired.includes('"confidence"')) {
            repaired += ',\n  "confidence": 0.8';
          }
          if (!repaired.includes('"detectedIntent"')) {
            repaired += ',\n  "detectedIntent": "strategy_simulation"';
          }
          
          // Fermer les accolades
          for (let i = 0; i < openBraces - closeBraces; i++) {
            repaired += '\n}';
          }
        }
      }
      
      return repaired;
    }
  }


  /**
   * Liste les modèles disponibles et les met en cache
   */
  async listAvailableModels(): Promise<string[]> {
    if (!this.apiKey) {
      return [];
    }

    // Si déjà en cache, retourner le cache
    if (this.availableModels.length > 0) {
      return this.availableModels;
    }

    try {
      // Essayer v1beta d'abord
      let response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`
      );
      
      if (!response.ok) {
        // Fallback sur v1
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1/models?key=${this.apiKey}`
        );
      }
      
      if (response.ok) {
        const data = await response.json();
        // Extraire les noms de modèles (format: "models/gemini-1.5-flash-001" -> "gemini-1.5-flash-001")
        const models = (data.models || []).map((m: any) => {
          const name = m.name || '';
          // Enlever le préfixe "models/" si présent
          return name.replace(/^models\//, '');
        }).filter((name: string) => name.length > 0);
        
        this.availableModels = models;
        console.log('[GeminiService] Modèles disponibles trouvés:', models.length, 'modèles');
        console.log('[GeminiService] Exemples de modèles:', models.slice(0, 10));
        return models;
      }
    } catch (error) {
      console.error('[GeminiService] Erreur lors de la liste des modèles:', error);
    }
    
    return [];
  }

  /**
   * Trouve un modèle utilisable depuis la liste disponible
   */
  private findUsableModel(availableModels: string[]): string | null {
    // Priorité des modèles à essayer
    const preferredModels = [
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash-002',
      'gemini-1.5-flash-001',
      'gemini-1.5-flash',
      'gemini-1.5-pro-latest',
      'gemini-1.5-pro-002',
      'gemini-1.5-pro-001',
      'gemini-1.5-pro',
      'gemini-2.0-flash-exp',
      'gemini-2.5-flash',
      'gemini-pro',
      'gemini-1.0-pro'
    ];

    // Chercher d'abord dans les modèles préférés
    for (const preferred of preferredModels) {
      const found = availableModels.find(m => 
        m === preferred || 
        m.startsWith(preferred + '-') ||
        m.includes(preferred)
      );
      if (found) {
        console.log('[GeminiService] Modèle préféré trouvé:', found);
        return found;
      }
    }

    // Si aucun modèle préféré trouvé, chercher n'importe quel modèle gemini
    const geminiModel = availableModels.find(m => 
      m.toLowerCase().includes('gemini') && 
      (m.toLowerCase().includes('flash') || m.toLowerCase().includes('pro'))
    );
    
    if (geminiModel) {
      console.log('[GeminiService] Modèle Gemini trouvé:', geminiModel);
      return geminiModel;
    }

    // Dernier recours : prendre le premier modèle disponible
    if (availableModels.length > 0) {
      console.log('[GeminiService] Utilisation du premier modèle disponible:', availableModels[0]);
      return availableModels[0];
    }

    return null;
  }

  /**
   * Teste la connexion à Gemini
   */
  async testConnection(): Promise<boolean> {
    if (!this.isEnabled || !this.apiKey) {
      return false;
    }

    try {
      // Réinitialiser le cache des modèles pour forcer une nouvelle recherche
      this.availableModels = [];
      
      // Essayer de lister les modèles d'abord pour voir ce qui est disponible
      const models = await this.listAvailableModels();
      if (models.length > 0) {
        console.log('[GeminiService] ✅ Modèles disponibles trouvés:', models.length);
        const usableModel = this.findUsableModel(models);
        if (usableModel) {
          console.log('[GeminiService] ✅ Modèle utilisable trouvé:', usableModel);
        } else {
          console.warn('[GeminiService] ⚠️ Aucun modèle utilisable trouvé dans la liste');
        }
      } else {
        console.warn('[GeminiService] ⚠️ Aucun modèle disponible');
        return false;
      }
      
      const result = await this.clarifyMessage('test');
      return result.confidence > 0;
    } catch (error) {
      console.error('[GeminiService] ❌ Gemini connection test failed:', error);
      return false;
    }
  }
}

export default GeminiService;

