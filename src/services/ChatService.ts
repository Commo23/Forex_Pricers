import ExchangeRateService from './ExchangeRateService';
import ChatSyncService from './ChatSyncService';
import GeminiService from './GeminiService';
import LoggerService from './LoggerService';
import InputValidator from './InputValidator';
import SessionManager from './SessionManager';
import RateLimiter from './RateLimiter';
import { ChatConfig } from '@/config/chatConfig';

/**
 * Service de chat pour l'assistant FX
 * Système basé sur des règles et pattern matching
 * Optionnellement assisté par Gemini AI pour clarifier les messages
 * Fonctionnalités:
 * - Obtenir le spot rate d'une paire de devises
 * - Calculer le prix d'une option (Call/Put)
 * - Calculer le forward FX
 */

/**
 * Dictionnaire de définitions financières prédéfinies
 */
const FINANCIAL_DEFINITIONS: Record<string, string> = {
  'zero cost collar': `📚 **Zéro Cost Collar (Collar Zéro Coût)**

Un **zéro cost collar** est une stratégie de couverture de change qui combine :
• **Un Call** (option d'achat) avec un strike élevé
• **Un Put** (option de vente) avec un strike bas

**Caractéristiques principales :**
• Le coût net de la stratégie est **zéro** (la prime du call = la prime du put)
• Protège contre les mouvements défavorables tout en permettant de bénéficier des mouvements favorables dans une fourchette
• Le strike du call définit le **plafond** (prix maximum)
• Le strike du put définit le **plancher** (prix minimum)

**Exemple :** Pour EUR/USD à 1.10, un collar pourrait avoir un call à 1.12 (plafond) et un put à 1.08 (plancher). Si le taux monte au-dessus de 1.12, vous êtes protégé. S'il descend en dessous de 1.08, vous êtes également protégé. Entre les deux, vous bénéficiez des mouvements favorables.`,

  'collar': `📚 **Collar (Collar de Change)**

Un **collar** est une stratégie de couverture qui limite les risques de change en créant une fourchette de prix :
• **Plafond (Cap)** : Prix maximum via un Call
• **Plancher (Floor)** : Prix minimum via un Put

**Avantages :**
• Protection contre les mouvements défavorables
• Coût réduit (ou nul dans le cas d'un zéro cost collar)
• Flexibilité dans le choix des strikes

**Utilisation :** Idéal pour les entreprises qui veulent se protéger tout en conservant un potentiel de gain limité.`,

  'zero cost': `📚 **Zéro Cost (Zéro Coût)**

Une stratégie **zéro cost** est une combinaison d'options où les primes s'annulent :
• La prime reçue d'une option = la prime payée pour l'autre
• Coût net = 0

**Exemples courants :**
• Zero Cost Collar
• Zero Cost Straddle
• Zero Cost Strangle

**Avantage principal :** Protection sans coût initial, idéal pour les entreprises soucieuses de leur budget.`,

  'call': `📚 **Call Option (Option d'Achat)**

Un **Call** est une option qui donne le droit (mais pas l'obligation) d'acheter une devise à un prix fixe (strike) à une date déterminée.

**Caractéristiques :**
• **Achat** : Vous avez le droit d'acheter à un prix fixe
• **Strike** : Prix d'exercice de l'option
• **Maturité** : Date d'expiration
• **Prime** : Coût de l'option

**Utilisation :** Protection contre la hausse d'une devise (ex: si vous devez acheter des USD et que l'EUR/USD monte).`,

  'put': `📚 **Put Option (Option de Vente)**

Un **Put** est une option qui donne le droit (mais pas l'obligation) de vendre une devise à un prix fixe (strike) à une date déterminée.

**Caractéristiques :**
• **Vente** : Vous avez le droit de vendre à un prix fixe
• **Strike** : Prix d'exercice de l'option
• **Maturité** : Date d'expiration
• **Prime** : Coût de l'option

**Utilisation :** Protection contre la baisse d'une devise (ex: si vous devez vendre des USD et que l'EUR/USD baisse).`,

  'forward': `📚 **Forward (Contrat à Terme)**

Un **forward** est un accord pour acheter ou vendre une devise à un prix fixe à une date future déterminée.

**Caractéristiques :**
• **Prix fixe** : Déterminé aujourd'hui pour une transaction future
• **Date de livraison** : Date d'échéance du contrat
• **Engagement ferme** : Obligation d'exécuter la transaction

**Avantages :**
• Prix garanti
• Pas de prime à payer
• Simplicité

**Inconvénients :**
• Pas de flexibilité (obligation d'exécuter)
• Pas de protection contre les mouvements favorables`,

  'strike': `📚 **Strike (Prix d'Exercice)**

Le **strike** est le prix auquel une option peut être exercée.

**Types de strike :**
• **At-the-money (ATM)** : Strike = prix spot actuel
• **In-the-money (ITM)** : Option avec valeur intrinsèque
• **Out-of-the-money (OTM)** : Option sans valeur intrinsèque

**Exemple :** Pour EUR/USD à 1.10, un call avec strike 1.12 est OTM, un call avec strike 1.08 est ITM.`,

  'volatility': `📚 **Volatilité**

La **volatilité** mesure l'amplitude des variations de prix d'une devise.

**Types :**
• **Volatilité historique** : Basée sur les variations passées
• **Volatilité implicite** : Dérivée des prix d'options sur le marché

**Impact :**
• Plus la volatilité est élevée, plus les options sont chères
• Mesurée en pourcentage annuel (ex: 10% = volatilité modérée)

**Utilisation :** Essentielle pour le pricing des options.`,

  'spot': `📚 **Spot Rate (Taux au Comptant)**

Le **spot rate** est le taux de change actuel pour une transaction immédiate (généralement dans 2 jours ouvrables).

**Caractéristiques :**
• Prix de marché actuel
• Livraison dans 2 jours (T+2)
• Base de référence pour tous les autres instruments

**Exemple :** EUR/USD = 1.10 signifie qu'1 euro = 1.10 dollars américains.`,

  'hedging': `📚 **Hedging (Couverture)**

Le **hedging** est une stratégie pour réduire ou éliminer le risque de change.

**Instruments utilisés :**
• Forwards
• Options (Call/Put)
• Swaps
• Options exotiques (barrières, digitales)

**Objectif :** Protéger contre les mouvements défavorables des taux de change tout en conservant un potentiel de gain si possible.`,

  'barrier option': `📚 **Barrier Option (Option à Barrière)**

Une **barrier option** est une option exotique qui s'active ou se désactive selon qu'un niveau de prix (barrière) est atteint ou non.

**Types :**
• **Knock-in** : L'option s'active si la barrière est touchée
• **Knock-out** : L'option se désactive si la barrière est touchée

**Avantages :**
• Moins cher qu'une option vanilla
• Protection personnalisée selon vos besoins

**Exemple :** Un knock-out call se désactive si le prix dépasse un certain niveau.`,

  'digital option': `📚 **Digital Option (Option Digitale)**

Une **digital option** (ou option binaire) paie un montant fixe si une condition est remplie à l'échéance.

**Caractéristiques :**
• **Paiement fixe** : Montant prédéterminé si l'option est dans la monnaie
• **Tout ou rien** : Soit le paiement complet, soit rien
• **Moins cher** : Généralement moins coûteux qu'une option vanilla

**Utilisation :** Idéal pour des scénarios où vous voulez une protection simple avec un coût réduit.`
};
export interface StrategySession {
  step: 'currency' | 'volume' | 'maturity' | 'components' | 'complete';
  currencyPair?: { base: string; quote: string };
  spotPrice?: number;
  baseVolume?: number;
  quoteVolume?: number;
  monthsToHedge?: number;
  currentComponent?: {
    type?: string;
    optionType?: 'call' | 'put';
    strike?: number;
    strikeType?: 'absolute' | 'percent';
    quantity?: number;
    volatility?: number;
    barrier?: number;
    barrierType?: 'absolute' | 'percent';
    secondBarrier?: number;
    rebate?: number;
    missingParams?: string[];
  };
  components: Array<{
    type: string;
    optionType?: 'call' | 'put';
    strike?: number;
    strikeType?: 'absolute' | 'percent';
    quantity?: number;
    volatility?: number;
    barrier?: number;
    barrierType?: 'absolute' | 'percent';
    secondBarrier?: number;
    rebate?: number;
  }>;
}

class ChatService {
  private static instance: ChatService;
  private exchangeRateService: ExchangeRateService;
  private geminiService: GeminiService;
  private strategySessions: Map<string, StrategySession> = new Map();
  private logger = LoggerService.getInstance();
  private sessionManager = SessionManager.getInstance();
  private rateLimiter = RateLimiter.getInstance();

  // Taux d'intérêt par défaut (en pourcentage annuel)
  private defaultRates: { [key: string]: number } = {
    'USD': 5.0,
    'EUR': 4.0,
    'GBP': 5.25,
    'JPY': 0.1,
    'CHF': 1.5,
    'AUD': 4.35,
    'CAD': 5.0,
    'NZD': 5.5
  };

  // Volatilité par défaut (10% annuelle)
  private defaultVolatility = 0.10;

  private constructor() {
    this.exchangeRateService = ExchangeRateService.getInstance();
    this.geminiService = GeminiService.getInstance();
    
    // Recharger la clé API au démarrage pour s'assurer qu'elle est à jour
    this.reloadGeminiApiKey();
  }

  /**
   * Recharge la clé API Gemini depuis les settings
   */
  private reloadGeminiApiKey(): void {
    try {
      const settings = localStorage.getItem('fxRiskManagerSettings');
      if (settings) {
        const parsed = JSON.parse(settings);
        if (parsed.chat?.geminiApiKey && parsed.chat?.enableAI) {
          this.geminiService.updateApiKey(parsed.chat.geminiApiKey);
          console.log('[ChatService] Clé API Gemini rechargée depuis les settings');
        } else {
          this.geminiService.updateApiKey(null);
          console.log('[ChatService] Gemini désactivé dans les settings');
        }
      }
    } catch (error) {
      console.error('[ChatService] Erreur lors du rechargement de la clé API:', error);
    }
  }

  static getInstance(): ChatService {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService();
    }
    return ChatService.instance;
  }

  /**
   * Efface toutes les sessions en mémoire et dans le localStorage
   * Utilisé lors du refresh du chat
   */
  clearAllSessions(): void {
    // Effacer toutes les sessions en mémoire
    this.strategySessions.clear();
    this.logger.debug('Toutes les sessions en mémoire effacées');
    
    // Effacer toutes les sessions du localStorage
    this.sessionManager.clearAllSessions();
  }

  /**
   * Traite un message de l'utilisateur et retourne une réponse
   */
  async processMessage(message: string, sessionId: string = 'default'): Promise<string> {
    try {
      // Validation des entrées
      const messageValidation = InputValidator.validateMessage(message);
      if (!messageValidation.valid) {
        this.logger.warn('Message invalide rejeté', { error: messageValidation.error, message });
        return `❌ ${messageValidation.error || 'Message invalide'}`;
      }
      
      const sanitizedMessage = messageValidation.sanitized!;
    
    // Validation du sessionId
    const sessionValidation = InputValidator.validateSessionId(sessionId);
    if (!sessionValidation.valid) {
      this.logger.warn('SessionId invalide', { error: sessionValidation.error, sessionId });
      sessionId = 'default'; // Utiliser la session par défaut
    } else {
      sessionId = sessionValidation.sanitized!;
    }
    
    // Rate limiting
    const rateLimitCheck = this.rateLimiter.checkAndRecord(sessionId, ChatConfig.rateLimit);
    if (!rateLimitCheck.allowed) {
      const resetIn = Math.ceil((rateLimitCheck.resetAt - Date.now()) / 1000);
      this.logger.warn('Rate limit atteint', { sessionId, resetIn });
      return `⏱️ Trop de requêtes. Veuillez patienter ${resetIn} seconde(s) avant de réessayer.`;
    }
    
    let processedMessage = sanitizedMessage;
    let detectedIntent: string | undefined;
    
    const normalizedMessage = sanitizedMessage.toLowerCase().trim();
    
    // D'abord, vérifier si on est dans une session de stratégie en cours
    // Essayer de charger depuis le SessionManager si pas en mémoire
    let session = this.strategySessions.get(sessionId);
    if (!session) {
      session = this.sessionManager.getSession(sessionId);
      if (session) {
        this.strategySessions.set(sessionId, session);
      }
    }
    
    if (session && session.step !== 'complete') {
      // Si on est dans une session active, ne pas appeler Gemini
      // Le système de règles gère déjà les étapes
      this.logger.debug('Session active, utilisation directe du système de règles', { sessionId, step: session.step });
      return await this.handleStrategyBuilding(sanitizedMessage, sessionId);
    }

    // Détecter les requêtes simples et claires qui ne nécessitent pas Gemini
    const isSimpleRequest = this.isSimpleClearRequest(normalizedMessage);
    const isDefinition = this.isDefinitionQuestion(normalizedMessage);
    
    const isGeminiAvailable = this.geminiService.isAvailable();
    this.logger.debug('Traitement du message', {
      isGeminiAvailable,
      isSimpleRequest,
      isDefinition,
      sessionId
    });
    
    // Variable pour stocker les paramètres extraits par Gemini
    let extractedParams: any = null;
    let fxData: any = null;
    
    // Appeler Gemini seulement si :
    // 1. Gemini est disponible
    // 2. La requête n'est pas simple/claire (besoin de clarification)
    // 3. Ce n'est pas une question de définition (gérée par le dictionnaire)
    if (isGeminiAvailable && !isSimpleRequest && !isDefinition) {
      try {
        this.logger.debug('Appel Gemini pour clarifier', { message: sanitizedMessage });
        
        const clarification = await this.geminiService.clarifyMessage(sanitizedMessage, {
          currentStep: session?.step,
          previousMessages: [], // Pourrait être enrichi avec l'historique
        });
        
        if (clarification.clarifiedMessage) {
          processedMessage = clarification.clarifiedMessage;
          detectedIntent = clarification.detectedIntent;
          extractedParams = clarification.extractedParams;
          fxData = clarification.fxData;
          
          // Si fxData est présent et contient des champs manquants, retourner la question
          if (fxData && typeof fxData === 'object') {
            if (fxData.missingFields && Array.isArray(fxData.missingFields) && fxData.missingFields.length > 0) {
              const question = (fxData.question && typeof fxData.question === 'string') 
                ? fxData.question 
                : `Il manque des informations: ${fxData.missingFields.join(', ')}`;
              this.logger.debug('Champs FX manquants détectés', { missingFields: fxData.missingFields });
              // S'assurer que la question se termine par "?"
              return question.endsWith('?') ? question : question + '?';
            }
            
            // Si fxData est complet, chercher currentRate si null
            if (fxData.currency && typeof fxData.currency === 'string' && 
                fxData.baseCurrency && typeof fxData.baseCurrency === 'string' && 
                !fxData.currentRate) {
              try {
                const exchangeData = await this.exchangeRateService.getExchangeRates(fxData.baseCurrency);
                if (exchangeData && exchangeData.rates && typeof exchangeData.rates === 'object') {
                  const rate = exchangeData.rates[fxData.currency];
                  if (rate && !isNaN(rate) && typeof rate === 'number') {
                    fxData.currentRate = rate;
                    this.logger.debug('Taux de change récupéré', { 
                      pair: `${fxData.baseCurrency}/${fxData.currency}`,
                      rate 
                    });
                  }
                }
              } catch (error) {
                this.logger.warn('Impossible de récupérer le taux de change', error);
                // Ne pas bloquer si on ne peut pas récupérer le taux
              }
            }
          }
          
          this.logger.debug('Message clarifié par Gemini', {
            original: sanitizedMessage,
            clarified: processedMessage,
            confidence: clarification.confidence,
            detectedIntent,
            extractedParams,
            fxData
          });
        } else {
          this.logger.warn('Gemini n\'a pas retourné de message clarifié');
        }
      } catch (error: any) {
        this.logger.error('Erreur lors de la clarification Gemini', error, { 
          message: sanitizedMessage,
          errorMessage: error?.message,
          errorStack: error?.stack 
        });
        // En cas d'erreur, utiliser le message original et continuer
        // Ne pas throw l'erreur, juste logger et continuer avec le message original
        processedMessage = sanitizedMessage;
        detectedIntent = undefined;
        extractedParams = null;
        fxData = null;
      }
    } else {
      if (isSimpleRequest) {
        this.logger.debug('Requête simple détectée, pas besoin de Gemini');
      } else if (isDefinition) {
        this.logger.debug('Question de définition détectée, utilisation du dictionnaire');
      } else {
        this.logger.debug('Gemini non disponible, utilisation du message original');
      }
    }
    
    const normalizedProcessed = processedMessage.toLowerCase().trim();

    // Si Gemini a détecté une question de définition OU si on a détecté une définition localement
    if (detectedIntent === 'definition_question' || isDefinition) {
      // Normaliser le message pour la recherche (enlever accents, tirets, etc.)
      const normalizeForSearch = (text: string): string => {
        return text
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Enlever accents
          .replace(/[-\s]/g, ' ') // Normaliser tirets et espaces
          .replace(/\s+/g, ' ')
          .trim();
      };
      
      const normalizedForDef = normalizeForSearch(processedMessage);
      
      // Mapping des termes de recherche vers les clés du dictionnaire
      const termMapping: Record<string, string> = {
        'zero cost collar': 'zero cost collar',
        'zero-cost collar': 'zero cost collar',
        'zero costcollar': 'zero cost collar',
        'collar': 'collar',
        'zero cost': 'zero cost',
        'zero-cost': 'zero cost',
        'call option': 'call',
        'option call': 'call',
        'call': 'call',
        'put option': 'put',
        'option put': 'put',
        'put': 'put',
        'forward': 'forward',
        'contrat a terme': 'forward',
        'strike': 'strike',
        'prix dexercice': 'strike',
        'volatility': 'volatility',
        'volatilite': 'volatility',
        'spot': 'spot',
        'taux spot': 'spot',
        'spot rate': 'spot',
        'hedging': 'hedging',
        'couverture': 'hedging',
        'barrier option': 'barrier option',
        'option barriere': 'barrier option',
        'digital option': 'digital option',
        'option digitale': 'digital option',
        'option binaire': 'digital option'
      };
      
      // Chercher les termes les plus longs d'abord
      const sortedKeys = Object.keys(termMapping).sort((a, b) => b.length - a.length);
      
      for (const searchTerm of sortedKeys) {
        if (normalizedForDef.includes(normalizeForSearch(searchTerm))) {
          const dictKey = termMapping[searchTerm];
          const definition = FINANCIAL_DEFINITIONS[dictKey];
          if (definition) {
            this.logger.debug('Définition trouvée', { searchTerm, dictKey });
            return definition;
          }
        }
      }
      
      // Si aucune définition trouvée, retourner un message générique avec suggestions
      return `❓ Je comprends que vous cherchez une définition, mais je n'ai pas d'information prédéfinie sur ce terme spécifique.\n\n` +
        `💡 **Termes que je peux expliquer** :\n` +
        `• Zero Cost Collar\n` +
        `• Call / Put Options\n` +
        `• Forward\n` +
        `• Strike\n` +
        `• Volatilité\n` +
        `• Spot Rate\n` +
        `• Hedging\n` +
        `• Barrier Options\n` +
        `• Digital Options\n\n` +
        `💡 **Ce que je peux faire** :\n` +
        `• Obtenir des taux de change spot\n` +
        `• Calculer des prix d'options (Call/Put)\n` +
        `• Calculer des forwards FX\n` +
        `• Simuler des stratégies de hedging`;
    }

    // Vérifier si l'utilisateur demande à voir les résultats
    if (this.isResultsRequest(normalizedProcessed)) {
      return await this.handleResultsRequest();
    }

    // Détection des différentes intentions
    // Vérifier d'abord avec le message original (pour la détection locale)
    // puis avec le message clarifié (pour Gemini)
    const originalNormalized = sanitizedMessage.toLowerCase().trim();
    const isStrategyRequest = 
      detectedIntent === 'strategy_simulation' || 
      this.isStrategySimulationRequest(normalizedProcessed) ||
      this.isStrategySimulationRequest(originalNormalized); // Fallback sur message original
    
    if (isStrategyRequest) {
      this.logger.debug('Demande de stratégie détectée', {
        detectedIntent,
        hasExtractedParams: !!extractedParams,
        extractedParams
      });
      
      // Si Gemini a extrait des paramètres, les utiliser
      // Sinon, essayer d'extraire localement depuis le message
      if (!extractedParams) {
        extractedParams = this.extractParamsFromMessage(sanitizedMessage);
        this.logger.debug('Paramètres extraits localement', { extractedParams });
      }
      
      // Si on a des paramètres (de Gemini ou extraction locale), les utiliser
      if (extractedParams && (extractedParams.currencyPair || extractedParams.countries)) {
        return await this.startStrategySimulationWithParams(sessionId, extractedParams);
      }
      
      // Sinon, démarrer normalement
      return await this.startStrategySimulation(sessionId);
    }

    if (this.isOptionPriceRequest(normalizedProcessed)) {
      return await this.handleOptionPriceRequest(processedMessage);
    }

    if (this.isForwardRequest(normalizedProcessed)) {
      return await this.handleForwardRequest(processedMessage);
    }

    if (this.isSpotRateRequest(normalizedProcessed)) {
      return await this.handleSpotRateRequest(processedMessage);
    }

    // Réponse par défaut avec suggestions
    return this.getDefaultResponse();
    } catch (error: any) {
      // Capturer toutes les erreurs non gérées
      this.logger.error('Erreur non gérée dans processMessage', error, { 
        message, 
        sessionId,
        errorMessage: error?.message,
        errorStack: error?.stack 
      });
      
      // Retourner un message d'erreur convivial
      return `❌ Désolé, une erreur est survenue lors du traitement de votre message.\n\n` +
        `💡 Veuillez réessayer ou reformuler votre demande.\n\n` +
        `Si le problème persiste, vérifiez que:\n` +
        `• Votre message est clair et complet\n` +
        `• Les informations fournies sont correctes\n` +
        `• Le service est bien configuré`;
    }
  }

  /**
   * Vérifie si la requête est simple et claire (ne nécessite pas Gemini)
   * Les messages contextuels complexes doivent passer par Gemini
   */
  private isSimpleClearRequest(message: string): boolean {
    // Détecter les messages contextuels complexes qui nécessitent Gemini
    const complexIndicators = [
      /\b(je|j'|mon|ma|mes|nous|notre|nos)\b/i, // Messages personnels
      /\b(réside|habite|vivre|vivant)\b/i, // Mentions de localisation
      /\b(acheter|achat|vendre|vente|opération|transaction)\b/i, // Mentions d'opérations
      /\b(protéger|proteger|protection|couverture|hedging)\b/i, // Mentions de protection
      /\b(élaborer|elaborer|créer|faire)\s+(une|un)?\s*(stratégie|strategy)\b/i, // Création de stratégie contextuelle
      /\b(maroc|mexique|france|allemagne|espagne|italie|usa|états-unis|royaume-uni|japon|suisse|australie|canada)\b/i // Mentions de pays
    ];
    
    // Si le message contient des indicateurs de complexité, il n'est pas "simple"
    if (complexIndicators.some(pattern => pattern.test(message))) {
      return false;
    }
    
    // Requêtes simples et directes qui sont bien détectées par le système de règles
    const simplePatterns = [
      /^(quel|quelle|quels|quelles)\s+(est|sont)\s+(le|la|les)\s+(spot|taux|rate)/i,
      /^(spot|taux)\s+[a-z]{3}\/[a-z]{3}/i,
      /^(calcule|calculer|price)\s+(un|une|le|la)?\s*(call|put|option)/i,
      /^(forward|futur|future)/i,
      /^(résultats|results|résumé|resume)/i,
      /^(simule|simuler|simulation)\s+(une|un)?\s*(stratégie|strategy)\s*$/i // Seulement si c'est juste "simule une stratégie" sans contexte
    ];
    
    return simplePatterns.some(pattern => pattern.test(message));
  }

  /**
   * Vérifie si c'est une question de définition
   */
  private isDefinitionQuestion(message: string): boolean {
    const definitionKeywords = [
      'c\'est quoi', 'qu\'est-ce que', 'qu\'est ce que', 'what is', 'what\'s',
      'définition', 'definition', 'explique', 'explain', 'explique-moi',
      'comment ça marche', 'how does', 'how do', 'décris', 'describe',
      'peux-tu expliquer', 'can you explain', 'qu\'est-ce qu\'un', 'qu\'est-ce qu\'une',
      'c\'est quoi un', 'c\'est quoi une', 'définis', 'define'
    ];
    
    return definitionKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Vérifie si le message demande un spot rate
   */
  private isSpotRateRequest(message: string): boolean {
    const normalized = message.toLowerCase();
    
    // Exclure les questions de définition
    const definitionKeywords = [
      'c\'est quoi', 'qu\'est-ce que', 'qu\'est ce que', 'what is', 'what\'s',
      'définition', 'definition', 'explique', 'explain', 'explique-moi',
      'comment ça marche', 'how does', 'how do', 'décris', 'describe',
      'peux-tu expliquer', 'can you explain', 'qu\'est-ce qu\'un', 'qu\'est-ce qu\'une',
      'c\'est quoi un', 'c\'est quoi une', 'définis', 'define'
    ];
    
    if (definitionKeywords.some(keyword => normalized.includes(keyword))) {
      return false;
    }
    
    // Exclure les termes financiers qui pourraient être confondus avec des paires
    const financialTerms = [
      'collar', 'zero cost', 'knockout', 'knockin', 'one-touch', 'no-touch',
      'double-touch', 'range-binary', 'forward', 'swap', 'option', 'call', 'put',
      'straddle', 'strangle', 'butterfly', 'spread'
    ];
    
    // Si le message contient un terme financier sans contexte de paire de devises, ce n'est pas un spot rate
    const hasFinancialTerm = financialTerms.some(term => normalized.includes(term));
    if (hasFinancialTerm) {
      // Vérifier s'il y a vraiment une paire de devises explicite
      const explicitPairPattern = /\b([A-Z]{3})\/?\s*([A-Z]{3})\b/i;
      if (!explicitPairPattern.test(message)) {
        return false;
      }
    }
    
    const spotKeywords = ['spot', 'taux', 'rate', 'cours', 'prix', 'change'];
    const hasSpotKeyword = spotKeywords.some(keyword => normalized.includes(keyword));
    
    // Détecte les paires de devises (format XXX/YYY ou XXX YYY)
    // Mais seulement si c'est explicite et pas un terme financier
    const currencyPairPattern = /\b([A-Z]{3})\/?\s*([A-Z]{3})\b/i;
    const hasCurrencyPair = currencyPairPattern.test(message);

    // Pour être un spot rate, il faut soit un mot-clé spot, soit une paire explicite
    // ET ne pas être une question de définition ou un terme financier seul
    return (hasSpotKeyword || hasCurrencyPair) && !hasFinancialTerm;
  }

  /**
   * Extrait la paire de devises du message
   */
  private extractCurrencyPair(message: string): { base: string; quote: string } | null {
    // Pattern pour XXX/YYY ou XXX YYY
    const patterns = [
      /([A-Z]{3})\/([A-Z]{3})/i,
      /([A-Z]{3})\s+([A-Z]{3})/i,
      /([A-Z]{3})([A-Z]{3})/i
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return {
          base: match[1].toUpperCase(),
          quote: match[2].toUpperCase()
        };
      }
    }

    return null;
  }

  /**
   * Gère la demande de spot rate
   */
  private async handleSpotRateRequest(message: string): Promise<string> {
    const pair = this.extractCurrencyPair(message);

    if (!pair) {
      return '❓ Je n\'ai pas pu identifier la paire de devises. Veuillez spécifier une paire au format EUR/USD ou EUR USD.';
    }

    try {
      // Essayer d'abord avec la base currency
      let exchangeData = await this.exchangeRateService.getExchangeRates(pair.base);
      let rate = exchangeData.rates[pair.quote];
      let isInverted = false;

      // Si le taux n'existe pas, essayer avec la quote currency comme base
      if (!rate) {
        exchangeData = await this.exchangeRateService.getExchangeRates(pair.quote);
        const invertedRate = exchangeData.rates[pair.base];
        
        if (invertedRate) {
          // Inverser le taux (1 / taux inversé)
          rate = 1 / invertedRate;
          isInverted = true;
        }
      }

      if (!rate || isNaN(rate)) {
        return `❌ Désolé, je n'ai pas pu trouver le taux pour ${pair.base}/${pair.quote}. Vérifiez que la paire est correcte.`;
      }

      const date = new Date(exchangeData.time_last_updated * 1000).toLocaleString('fr-FR');
      const formattedRate = this.formatRate(rate);

      return `✅ **Spot ${pair.base}/${pair.quote}**: ${formattedRate}\n\n📅 Dernière mise à jour: ${date}`;
    } catch (error) {
      console.error('Error fetching spot rate:', error);
      return `❌ Erreur lors de la récupération du taux ${pair.base}/${pair.quote}. Veuillez réessayer plus tard.`;
    }
  }

  /**
   * Formate le taux selon sa valeur
   */
  private formatRate(rate: number): string {
    if (rate < 0.01) {
      return rate.toFixed(6);
    } else if (rate < 1) {
      return rate.toFixed(4);
    } else if (rate < 100) {
      return rate.toFixed(4);
    } else {
      return rate.toFixed(2);
    }
  }

  /**
   * Vérifie si le message demande un calcul de prix d'option
   */
  private isOptionPriceRequest(message: string): boolean {
    const optionKeywords = ['call', 'put', 'option', 'prix option', 'price option', 'calcule', 'calculer'];
    const hasOptionKeyword = optionKeywords.some(keyword => message.includes(keyword));
    
    // Détecte la présence d'un strike
    const hasStrike = /\bstrike\b|\bk\s*=\s*|\bà\s*\d+|\b@\s*\d+/i.test(message);
    
    return hasOptionKeyword || hasStrike;
  }

  /**
   * Extrait les paramètres d'une option depuis le message
   */
  private extractOptionParams(message: string): {
    type: 'call' | 'put' | null;
    currencyPair: { base: string; quote: string } | null;
    strike: number | null;
    maturityMonths: number | null;
    volatility: number | null;
  } {
    const result = {
      type: null as 'call' | 'put' | null,
      currencyPair: null as { base: string; quote: string } | null,
      strike: null as number | null,
      maturityMonths: null as number | null,
      volatility: null as number | null
    };

    // Détecter le type (call ou put)
    if (/call|achat/i.test(message)) {
      result.type = 'call';
    } else if (/put|vente/i.test(message)) {
      result.type = 'put';
    }

    // Extraire la paire de devises
    result.currencyPair = this.extractCurrencyPair(message);

    // Extraire le strike
    const strikePatterns = [
      /\bstrike\s*[=:]\s*(\d+\.?\d*)/i,
      /\bk\s*[=:]\s*(\d+\.?\d*)/i,
      /\bà\s*(\d+\.?\d*)/i,
      /\b@\s*(\d+\.?\d*)/i,
      /\bstrike\s+(\d+\.?\d*)/i
    ];
    
    for (const pattern of strikePatterns) {
      const match = message.match(pattern);
      if (match) {
        result.strike = parseFloat(match[1]);
        break;
      }
    }

    // Extraire la maturité (en mois)
    const maturityPatterns = [
      /\b(\d+)\s*mois/i,
      /\b(\d+)\s*m\b/i,
      /\b(\d+)\s*month/i,
      /\b(\d+)\s*jours/i,
      /\b(\d+)\s*d\b/i,
      /\b(\d+)\s*day/i,
      /\b(\d+)\s*semaines/i,
      /\b(\d+)\s*w\b/i,
      /\b(\d+)\s*week/i
    ];

    for (const pattern of maturityPatterns) {
      const match = message.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        const unit = match[0].toLowerCase();
        
        if (unit.includes('jour') || unit.includes('d') || unit.includes('day')) {
          result.maturityMonths = value / 30;
        } else if (unit.includes('semaine') || unit.includes('w') || unit.includes('week')) {
          result.maturityMonths = value / 4.33;
        } else {
          result.maturityMonths = value;
        }
        break;
      }
    }

    // Extraire la volatilité (optionnelle)
    const volPatterns = [
      /\bvol\s*[=:]\s*(\d+\.?\d*)\s*%/i,
      /\bvolatility\s*[=:]\s*(\d+\.?\d*)\s*%/i,
      /\bvol\s*(\d+\.?\d*)\s*%/i,
      /\bvol\s*[=:]\s*(\d+\.?\d*)/i
    ];

    for (const pattern of volPatterns) {
      const match = message.match(pattern);
      if (match) {
        result.volatility = parseFloat(match[1]) / 100; // Convertir en décimal
        break;
      }
    }

    return result;
  }

  /**
   * Gère la demande de calcul de prix d'option
   */
  private async handleOptionPriceRequest(message: string): Promise<string> {
    const params = this.extractOptionParams(message);

    // Vérifications
    if (!params.type) {
      return '❓ Veuillez spécifier le type d\'option: "call" ou "put".\n\n💡 Exemple: "Calcule un call EUR/USD strike 1.10 à 3 mois"';
    }

    if (!params.currencyPair) {
      return '❓ Je n\'ai pas pu identifier la paire de devises. Veuillez spécifier une paire au format EUR/USD.';
    }

    if (!params.strike) {
      return '❓ Veuillez spécifier le strike de l\'option.\n\n💡 Exemple: "Calcule un call EUR/USD strike 1.10 à 3 mois"';
    }

    if (!params.maturityMonths) {
      return '❓ Veuillez spécifier la maturité de l\'option.\n\n💡 Exemple: "Calcule un call EUR/USD strike 1.10 à 3 mois"';
    }

    try {
      // Récupérer le spot rate
      const exchangeData = await this.exchangeRateService.getExchangeRates(params.currencyPair.base);
      let spotPrice = exchangeData.rates[params.currencyPair.quote];

      if (!spotPrice) {
        // Essayer avec la quote currency comme base
        const invertedData = await this.exchangeRateService.getExchangeRates(params.currencyPair.quote);
        const invertedRate = invertedData.rates[params.currencyPair.base];
        if (invertedRate) {
          spotPrice = 1 / invertedRate;
        } else {
          return `❌ Impossible de récupérer le spot pour ${params.currencyPair.base}/${params.currencyPair.quote}.`;
        }
      }

      // Récupérer les taux d'intérêt
      const domesticRate = (this.defaultRates[params.currencyPair.quote] || 5.0) / 100;
      const foreignRate = (this.defaultRates[params.currencyPair.base] || 4.0) / 100;

      // Maturité en années
      const timeToMaturity = params.maturityMonths / 12;

      // Volatilité (en pourcentage)
      const volatility = params.volatility ? params.volatility : (this.defaultVolatility * 100);

      // Créer la structure pour Strategy Builder au lieu de calculer directement
      const currencyPair = {
        symbol: `${params.currencyPair.base}/${params.currencyPair.quote}`,
        name: `${params.currencyPair.base}/${params.currencyPair.quote}`,
        base: params.currencyPair.base,
        quote: params.currencyPair.quote,
        category: 'majors' as const,
        defaultSpotRate: spotPrice
      };

      const calculatorState = {
        params: {
          startDate: new Date().toISOString().split('T')[0],
          strategyStartDate: new Date().toISOString().split('T')[0],
          monthsToHedge: params.maturityMonths,
          domesticRate: domesticRate,
          foreignRate: foreignRate,
          baseVolume: 10000000, // Volume par défaut
          quoteVolume: 10000000 * spotPrice,
          spotPrice: spotPrice,
          currencyPair: currencyPair,
          useCustomPeriods: false,
          customPeriods: [],
          volumeType: 'receivable' as const
        },
        strategy: [{
          type: params.type,
          optionType: params.type,
          strike: params.strike,
          strikeType: 'absolute' as const,
          quantity: 100,
          volatility: volatility
        }],
        results: null,
        payoffData: [],
        manualForwards: {},
        realPrices: {},
        realPriceParams: {
          useSimulation: false,
          volatility: this.defaultVolatility,
          drift: 0.01,
          numSimulations: 1000
        },
        barrierOptionSimulations: 1000,
        useClosedFormBarrier: false,
        activeTab: 'parameters',
        customScenario: null,
        stressTestScenarios: {},
        useImpliedVol: false,
        impliedVolatilities: {},
        customOptionPrices: {}
      };

      // Sauvegarder dans localStorage
      localStorage.setItem('calculatorState', JSON.stringify(calculatorState));

      // Déclencher un événement personnalisé pour notifier Strategy Builder
      window.dispatchEvent(new CustomEvent('calculatorStateUpdated', {
        detail: { source: 'chat' }
      }));

      const volDisplay = volatility.toFixed(1);

      return `✅ **Option ${params.type.toUpperCase()} créée dans Strategy Builder**\n\n` +
        `📊 **Paramètres:**\n` +
        `• Paire: ${params.currencyPair.base}/${params.currencyPair.quote}\n` +
        `• Spot: ${spotPrice.toFixed(4)}\n` +
        `• Strike: ${params.strike.toFixed(4)}\n` +
        `• Maturité: ${params.maturityMonths} mois\n` +
        `• Volatilité: ${volDisplay}%\n\n` +
        `🚀 **Prochaines étapes:**\n` +
        `1. Allez sur **Strategy Builder**\n` +
        `2. Cliquez sur **"Calculate Strategy Results"**\n` +
        `3. Les résultats apparaîtront automatiquement ici une fois calculés\n\n` +
        `💡 La stratégie a été chargée dans Strategy Builder!`;
    } catch (error) {
      console.error('Error calculating option price:', error);
      return `❌ Erreur lors du calcul du prix de l'option. Veuillez réessayer.`;
    }
  }

  /**
   * Vérifie si le message demande un calcul de forward
   */
  private isForwardRequest(message: string): boolean {
    const forwardKeywords = ['forward', 'futur', 'future', 'taux forward'];
    return forwardKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Gère la demande de calcul de forward
   */
  private async handleForwardRequest(message: string): Promise<string> {
    const pair = this.extractCurrencyPair(message);
    
    if (!pair) {
      return '❓ Je n\'ai pas pu identifier la paire de devises. Veuillez spécifier une paire au format EUR/USD.';
    }

    // Extraire la maturité
    const maturityPatterns = [
      /\b(\d+)\s*mois/i,
      /\b(\d+)\s*m\b/i,
      /\b(\d+)\s*month/i
    ];

    let maturityMonths = 6; // Par défaut 6 mois
    for (const pattern of maturityPatterns) {
      const match = message.match(pattern);
      if (match) {
        maturityMonths = parseFloat(match[1]);
        break;
      }
    }

    try {
      // Récupérer le spot rate
      const exchangeData = await this.exchangeRateService.getExchangeRates(pair.base);
      let spotPrice = exchangeData.rates[pair.quote];

      if (!spotPrice) {
        const invertedData = await this.exchangeRateService.getExchangeRates(pair.quote);
        const invertedRate = invertedData.rates[pair.base];
        if (invertedRate) {
          spotPrice = 1 / invertedRate;
        } else {
          return `❌ Impossible de récupérer le spot pour ${pair.base}/${pair.quote}.`;
        }
      }

      // Récupérer les taux d'intérêt
      const domesticRate = (this.defaultRates[pair.quote] || 5.0) / 100;
      const foreignRate = (this.defaultRates[pair.base] || 4.0) / 100;

      // Extraire le strike si fourni
      const strikePatterns = [
        /\bstrike\s*[=:]\s*(\d+\.?\d*)/i,
        /\bk\s*[=:]\s*(\d+\.?\d*)/i,
        /\bstrike\s+(\d+\.?\d*)/i
      ];

      let strike: number | undefined;
      for (const pattern of strikePatterns) {
        const match = message.match(pattern);
        if (match) {
          strike = parseFloat(match[1]);
          break;
        }
      }

      // Créer la structure pour Strategy Builder au lieu de calculer directement
      const currencyPair = {
        symbol: `${pair.base}/${pair.quote}`,
        name: `${pair.base}/${pair.quote}`,
        base: pair.base,
        quote: pair.quote,
        category: 'majors' as const,
        defaultSpotRate: spotPrice
      };

      const calculatorState = {
        params: {
          startDate: new Date().toISOString().split('T')[0],
          strategyStartDate: new Date().toISOString().split('T')[0],
          monthsToHedge: maturityMonths,
          domesticRate: domesticRate,
          foreignRate: foreignRate,
          baseVolume: 10000000, // Volume par défaut
          quoteVolume: 10000000 * spotPrice,
          spotPrice: spotPrice,
          currencyPair: currencyPair,
          useCustomPeriods: false,
          customPeriods: [],
          volumeType: 'receivable' as const
        },
        strategy: [{
          type: 'forward',
          strike: strike || spotPrice, // Utiliser le strike fourni ou le spot par défaut
          quantity: 100
        }],
        results: null,
        payoffData: [],
        manualForwards: {},
        realPrices: {},
        realPriceParams: {
          useSimulation: false,
          volatility: this.defaultVolatility,
          drift: 0.01,
          numSimulations: 1000
        },
        barrierOptionSimulations: 1000,
        useClosedFormBarrier: false,
        activeTab: 'parameters',
        customScenario: null,
        stressTestScenarios: {},
        useImpliedVol: false,
        impliedVolatilities: {},
        customOptionPrices: {}
      };

      // Sauvegarder dans localStorage
      localStorage.setItem('calculatorState', JSON.stringify(calculatorState));

      // Déclencher un événement personnalisé pour notifier Strategy Builder
      window.dispatchEvent(new CustomEvent('calculatorStateUpdated', {
        detail: { source: 'chat' }
      }));

      return `✅ **Forward créé dans Strategy Builder**\n\n` +
        `📊 **Paramètres:**\n` +
        `• Paire: ${pair.base}/${pair.quote}\n` +
        `• Spot: ${spotPrice.toFixed(4)}\n` +
        `${strike ? `• Strike: ${strike.toFixed(4)}\n` : ''}` +
        `• Maturité: ${maturityMonths} mois\n\n` +
        `🚀 **Prochaines étapes:**\n` +
        `1. Allez sur **Strategy Builder**\n` +
        `2. Cliquez sur **"Calculate Strategy Results"**\n` +
        `3. Les résultats apparaîtront automatiquement ici une fois calculés\n\n` +
        `💡 La stratégie a été chargée dans Strategy Builder!`;
    } catch (error) {
      console.error('Error calculating forward:', error);
      return `❌ Erreur lors du calcul du forward. Veuillez réessayer.`;
    }
  }

  /**
   * Détecte si l'utilisateur demande une simulation de stratégie
   * Tolérant aux fautes d'orthographe et variations
   */
  private isStrategySimulationRequest(message: string): boolean {
    // Normaliser le message pour la recherche (enlever accents, variations)
    const normalized = message
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Enlever accents
      .replace(/[-\s]/g, ' ') // Normaliser espaces
      .replace(/\s+/g, ' ')
      .trim();
    
    const keywords = [
      'simule', 'simuler', 'simulation', 'strategie', 'strategy', 
      'creer strategie', 'nouvelle strategie', 'elaborer', 'elaborer une strategie',
      'me proteger', 'protection', 'hedging', 'couverture',
      'creer une strategie', 'creer un strategie', 'faire une strategie',
      'je veux me proteger', 'je veux proteger', 'je veux elaborer',
      'je veux elaborer une strategie', 'besoin de protection', 'besoin de couverture',
      'elaborer une strategie pour', 'elaborer une strategie de', 'elaborer strategie',
      'proteger', 'protege', 'protegie', 'protege moi', 'protege moi de',
      'operation', 'transaction', 'montant', 'volume', 'hedger', 'hedge'
    ];
    
    // Vérifier si le message contient au moins un mot-clé
    const hasKeyword = keywords.some(keyword => normalized.includes(keyword));
    
    // Vérifier aussi les patterns contextuels (pays + montant + protection)
    // Plus flexible pour détecter même avec des fautes d'orthographe
    const hasCountry = /\b(maroc|mexique|france|allemagne|usa|royaume-uni|japon|suisse|australie|canada|espagne|italie)\b/i.test(message);
    const hasAmount = /\b(million|millions|m\s*drhams|m\s*euros|m\s*usd|montant|volume|operation|transaction|mt\s*total|total)\b/i.test(message);
    const hasProtection = /\b(proteger|protege|protegie|protection|hedging|couverture|elaborer|strategie|strategy)\b/i.test(message);
    
    const hasContextualPattern = hasCountry && hasAmount && hasProtection;
    
    // Aussi détecter si le message contient "elaborer" + "strategie" même sans pays/montant explicite
    const hasElaborateStrategy = /\belaborer\b.*\bstrategie\b/i.test(normalized) || 
                                  /\bstrategie\b.*\belaborer\b/i.test(normalized);
    
    return hasKeyword || hasContextualPattern || hasElaborateStrategy;
  }

  /**
   * Détecte si l'utilisateur demande les résultats
   */
  private isResultsRequest(message: string): boolean {
    const keywords = ['résultats', 'results', 'résultat', 'resultat', 'résumé', 'resume', 'résume'];
    return keywords.some(keyword => message.includes(keyword));
  }

  /**
   * Démarre une nouvelle simulation de stratégie
   */
  private async startStrategySimulation(sessionId: string): Promise<string> {
    const session: StrategySession = {
      step: 'currency',
      components: []
    };
    this.strategySessions.set(sessionId, session);
    this.sessionManager.saveSession(sessionId, session);

    return `🚀 **Simulation de stratégie FX**\n\n` +
      `Je vais vous guider pour créer votre stratégie de hedging.\n\n` +
      `**Étape 1/4**: Quelle paire de devises souhaitez-vous hedger?\n` +
      `💡 Exemple: "EUR/USD" ou "GBP/USD"`;
  }

  /**
   * Démarre une simulation de stratégie avec des paramètres pré-extraits par Gemini
   */
  private async startStrategySimulationWithParams(sessionId: string, extractedParams: any): Promise<string> {
    const session: StrategySession = {
      step: 'currency',
      components: []
    };

    // Si Gemini a extrait une paire de devises, la proposer pour confirmation
    if (extractedParams?.currencyPair?.base && extractedParams?.currencyPair?.quote) {
      try {
        const pair = {
          base: extractedParams.currencyPair.base,
          quote: extractedParams.currencyPair.quote
        };

        // Stocker la paire proposée dans la session pour la confirmation
        session.currencyPair = pair; // Temporaire, sera confirmé ou changé
        
        // Construire le message de proposition avec contexte
        let response = `🚀 **Simulation de stratégie FX**\n\n`;
        
        // Ajouter le contexte si disponible
        if (extractedParams?.countries?.from || extractedParams?.countries?.to) {
          const fromCountry = extractedParams.countries.from || '';
          const toCountry = extractedParams.countries.to || '';
          response += `📍 D'après votre message, vous résidez au **${fromCountry}** et souhaitez effectuer une opération au **${toCountry}**.\n\n`;
        }
        
        if (extractedParams?.amount?.value && extractedParams?.amount?.currency) {
          const amountValue = extractedParams.amount.value;
          const amountCurrency = extractedParams.amount.currency.toUpperCase();
          response += `💰 Montant détecté: **${this.formatAmount(amountValue)} ${amountCurrency}**\n\n`;
        }
        
        response += `**Étape 1/4**: J'ai déduit la paire de devises **${pair.base}/${pair.quote}**.\n\n`;
        response += `✅ Confirmez avec "Oui", "OK", "Confirmer" ou "C'est correct"\n`;
        response += `🔄 Ou indiquez une autre paire si vous souhaitez la changer\n\n`;
        response += `💡 Exemple: "Oui" ou "EUR/USD" pour changer`;

        this.strategySessions.set(sessionId, session);
        this.sessionManager.saveSession(sessionId, session);
        return response;
      } catch (error) {
        this.logger.error('Erreur lors de l\'initialisation avec paramètres extraits', error);
        // En cas d'erreur, continuer avec le processus normal
      }
    }

    // Si on n'a pas pu utiliser les paramètres, démarrer normalement
    this.strategySessions.set(sessionId, session);
    this.sessionManager.saveSession(sessionId, session);

    return `🚀 **Simulation de stratégie FX**\n\n` +
      `Je vais vous guider pour créer votre stratégie de hedging.\n\n` +
      `**Étape 1/4**: Quelle paire de devises souhaitez-vous hedger?\n` +
      `💡 Exemple: "EUR/USD" ou "GBP/USD"`;
  }

  /**
   * Formate un montant pour l'affichage
   */
  private formatAmount(amount: number): string {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(2)} millions`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(2)} milles`;
    }
    return amount.toLocaleString('fr-FR');
  }

  /**
   * Extrait les paramètres depuis le message utilisateur (extraction locale sans Gemini)
   * Utilisé comme fallback si Gemini n'est pas disponible ou ne retourne pas de paramètres
   */
  private extractParamsFromMessage(message: string): any {
    const normalized = message.toLowerCase();
    const params: any = {};
    
    // Mapping pays → devises (avec variantes françaises et anglaises)
    const countryToCurrency: Record<string, string> = {
      'maroc': 'MAD',
      'morocco': 'MAD',
      'mexique': 'MXN',
      'mexico': 'MXN',
      'france': 'EUR',
      'france': 'EUR',
      'allemagne': 'EUR',
      'germany': 'EUR',
      'espagne': 'EUR',
      'spain': 'EUR',
      'italie': 'EUR',
      'italy': 'EUR',
      'portugal': 'EUR',
      'belgique': 'EUR',
      'belgium': 'EUR',
      'pays-bas': 'EUR',
      'netherlands': 'EUR',
      'usa': 'USD',
      'états-unis': 'USD',
      'etats-unis': 'USD',
      'united states': 'USD',
      'royaume-uni': 'GBP',
      'uk': 'GBP',
      'united kingdom': 'GBP',
      'japon': 'JPY',
      'japan': 'JPY',
      'suisse': 'CHF',
      'switzerland': 'CHF',
      'australie': 'AUD',
      'australia': 'AUD',
      'canada': 'CAD',
      'nouvelle-zélande': 'NZD',
      'nouvelle zelande': 'NZD',
      'new zealand': 'NZD'
    };
    
    // Détecter les pays mentionnés (tolérant aux fautes d'orthographe comme "ou" au lieu de "au")
    const countries: string[] = [];
    for (const [country, currency] of Object.entries(countryToCurrency)) {
      // Recherche directe
      if (normalized.includes(country)) {
        countries.push(country);
      } else {
        // Recherche avec variations (ex: "ou maroc" au lieu de "au maroc")
        // Normaliser "ou" et "au" pour la détection
        const normalizedForCountry = normalized.replace(/\bou\b/g, 'au');
        if (normalizedForCountry.includes(country)) {
          countries.push(country);
        }
      }
    }
    
    // Si on a trouvé au moins 2 pays, créer une paire de devises
    if (countries.length >= 2) {
      const fromCountry = countries[0];
      const toCountry = countries[1];
      const fromCurrency = countryToCurrency[fromCountry];
      const toCurrency = countryToCurrency[toCountry];
      
      if (fromCurrency && toCurrency) {
        params.currencyPair = {
          base: fromCurrency,
          quote: toCurrency
        };
        params.countries = {
          from: fromCountry.charAt(0).toUpperCase() + fromCountry.slice(1),
          to: toCountry.charAt(0).toUpperCase() + toCountry.slice(1)
        };
      }
    } else if (countries.length === 1) {
      // Si un seul pays, essayer de déduire depuis le contexte
      const country = countries[0];
      const currency = countryToCurrency[country];
      
      // Si le message mentionne "dirhams" ou "dirham", c'est probablement MAD
      if (normalized.includes('dirham') && currency === 'MAD') {
        // Chercher un autre pays ou devise
        if (normalized.includes('mexique')) {
          params.currencyPair = {
            base: 'MAD',
            quote: 'MXN'
          };
          params.countries = {
            from: 'Maroc',
            to: 'Mexique'
          };
        }
      }
    }
    
    // Extraire le montant
    const amountPatterns = [
      /(\d+(?:\.\d+)?)\s*millions?\s*(?:de\s*)?(dirhams?|euros?|usd|dollars?|gbp|livres?|yen|jpy|chf|aud|cad)/i,
      /(\d+(?:\.\d+)?)\s*M\s*(dirhams?|euros?|usd|dollars?|gbp|livres?|yen|jpy|chf|aud|cad)/i,
      /(\d+(?:\.\d+)?)\s*m\s*(dirhams?|euros?|usd|dollars?|gbp|livres?|yen|jpy|chf|aud|cad)/i,
      /mt\s*total\s*(?:de\s*l'?operation\s*)?(?:est\s*)?(\d+(?:\.\d+)?)\s*m\s*(dirhams?|euros?|usd|dollars?|gbp|livres?|yen|jpy|chf|aud|cad)/i
    ];
    
    for (const pattern of amountPatterns) {
      const match = message.match(pattern);
      if (match) {
        let value = parseFloat(match[1]);
        const currencyText = match[2]?.toLowerCase() || '';
        
        // Convertir en nombre complet
        if (normalized.includes('million') || normalized.includes(' M ') || normalized.match(/\d+\s*M\s*[a-z]/i)) {
          value = value * 1000000;
        }
        
        // Déterminer la devise
        let currency = '';
        if (currencyText.includes('dirham')) {
          currency = 'MAD';
        } else if (currencyText.includes('euro')) {
          currency = 'EUR';
        } else if (currencyText.includes('usd') || currencyText.includes('dollar')) {
          currency = 'USD';
        } else if (currencyText.includes('gbp') || currencyText.includes('livre')) {
          currency = 'GBP';
        } else if (currencyText.includes('yen') || currencyText.includes('jpy')) {
          currency = 'JPY';
        } else if (currencyText.includes('chf')) {
          currency = 'CHF';
        } else if (currencyText.includes('aud')) {
          currency = 'AUD';
        } else if (currencyText.includes('cad')) {
          currency = 'CAD';
        }
        
        if (currency && value > 0) {
          params.amount = {
            value: value,
            currency: currency
          };
        }
        break;
      }
    }
    
    return Object.keys(params).length > 0 ? params : null;
  }

  /**
   * Gère la construction de stratégie étape par étape
   */
  private async handleStrategyBuilding(message: string, sessionId: string): Promise<string> {
    const session = this.strategySessions.get(sessionId);
    if (!session) {
      return '❌ Session de stratégie introuvable. Veuillez recommencer.';
    }

    switch (session.step) {
      case 'currency':
        return await this.handleCurrencyStep(message, sessionId);
      case 'volume':
        return await this.handleVolumeStep(message, sessionId);
      case 'maturity':
        return await this.handleMaturityStep(message, sessionId);
      case 'components':
        return await this.handleComponentsStep(message, sessionId);
      default:
        return '❌ Étape inconnue.';
    }
  }

  /**
   * Étape 1: Collecte de la paire de devises
   */
  private async handleCurrencyStep(message: string, sessionId: string): Promise<string> {
    const session = this.strategySessions.get(sessionId);
    if (!session) return '❌ Session introuvable.';

    const normalizedMessage = message.toLowerCase().trim();
    
    // Vérifier si c'est une confirmation (si une paire est déjà proposée)
    if (session.currencyPair) {
      const confirmationKeywords = ['oui', 'ok', 'confirmer', 'confirme', 'c\'est correct', 'c\'est bon', 'correct', 'valider', 'valide', 'yes', 'confirm'];
      if (confirmationKeywords.some(keyword => normalizedMessage.includes(keyword))) {
        // Confirmation : utiliser la paire proposée
        try {
          const pair = session.currencyPair;
          
          // Récupérer le spot
          const exchangeData = await this.exchangeRateService.getExchangeRates(pair.base);
          let spotPrice = exchangeData.rates[pair.quote];

          if (!spotPrice) {
            const invertedData = await this.exchangeRateService.getExchangeRates(pair.quote);
            const invertedRate = invertedData.rates[pair.base];
            if (invertedRate) {
              spotPrice = 1 / invertedRate;
            } else {
              return `❌ Impossible de récupérer le spot pour ${pair.base}/${pair.quote}.`;
            }
          }

          session.spotPrice = spotPrice;
          session.step = 'volume';

          return `✅ Paire de devises confirmée: **${pair.base}/${pair.quote}**\n` +
            `📊 Spot actuel: **${spotPrice.toFixed(4)}**\n\n` +
            `**Étape 2/4**: Quel volume souhaitez-vous hedger?\n` +
            `💡 Exemple: "10 millions ${pair.base}" ou "15M ${pair.quote}"`;
        } catch (error) {
          return '❌ Erreur lors de la récupération du spot. Veuillez réessayer.';
        }
      }
    }

    // Si ce n'est pas une confirmation, essayer d'extraire une nouvelle paire
    const pair = this.extractCurrencyPair(message);
    if (!pair) {
      if (session.currencyPair) {
        // Si une paire était proposée mais la réponse n'est pas claire
        return `❓ Je n'ai pas compris votre réponse.\n\n` +
          `✅ Pour confirmer **${session.currencyPair.base}/${session.currencyPair.quote}**, dites "Oui" ou "OK"\n` +
          `🔄 Pour changer, indiquez une autre paire (ex: "EUR/USD")`;
      }
      return '❓ Je n\'ai pas pu identifier la paire de devises.\n\n💡 Veuillez spécifier une paire au format EUR/USD ou GBP/USD.';
    }

    try {
      // Récupérer le spot
      const exchangeData = await this.exchangeRateService.getExchangeRates(pair.base);
      let spotPrice = exchangeData.rates[pair.quote];

      if (!spotPrice) {
        const invertedData = await this.exchangeRateService.getExchangeRates(pair.quote);
        const invertedRate = invertedData.rates[pair.base];
        if (invertedRate) {
          spotPrice = 1 / invertedRate;
        } else {
          return `❌ Impossible de récupérer le spot pour ${pair.base}/${pair.quote}.`;
        }
      }

      session.currencyPair = pair;
      session.spotPrice = spotPrice;
      session.step = 'volume';

      return `✅ Paire de devises: **${pair.base}/${pair.quote}**\n` +
        `📊 Spot actuel: **${spotPrice.toFixed(4)}**\n\n` +
        `**Étape 2/4**: Quel volume souhaitez-vous hedger?\n` +
        `💡 Exemple: "10 millions ${pair.base}" ou "15M ${pair.quote}"`;
    } catch (error) {
      return '❌ Erreur lors de la récupération du spot. Veuillez réessayer.';
    }
  }

  /**
   * Étape 2: Collecte du volume
   */
  private handleVolumeStep(message: string, sessionId: string): string {
    const session = this.strategySessions.get(sessionId);
    if (!session || !session.currencyPair) return '❌ Session introuvable.';

    // Extraire le volume avec patterns améliorés
    // Utiliser [A-Za-z]{3} pour accepter majuscules et minuscules
    const volumePatterns = [
      /(\d+(?:\.\d+)?)\s*millions?\s*([A-Za-z]{3})/i,
      /(\d+(?:\.\d+)?)\s*M\s*([A-Za-z]{3})/i,
      /(\d+(?:\.\d+)?)\s*milles?\s*([A-Za-z]{3})/i, // Pour "milles" (mille/thousand)
      /(\d+(?:\.\d+)?)\s*K\s*([A-Za-z]{3})/i, // Pour "K" (thousand)
      /(\d+(?:\.\d+)?)\s*milliards?\s*([A-Za-z]{3})/i, // Pour "milliards" (billion)
      /(\d+(?:\.\d+)?)\s*B\s*([A-Za-z]{3})/i, // Pour "B" (billion)
      /(\d+(?:\.\d+)?)\s*([A-Za-z]{3})/i, // Format simple
      /(\d+(?:,\d+)?)\s*([A-Za-z]{3})/i // Avec virgule
    ];

    let volume = 0;
    let currency = '';

    for (const pattern of volumePatterns) {
      const match = message.match(pattern);
      if (match) {
        volume = parseFloat(match[1].replace(/,/g, '').replace(/\s/g, ''));
        currency = match[2].toUpperCase();
        
        // Convertir selon le multiplicateur
        const messageLower = message.toLowerCase();
        if (messageLower.includes('million') || messageLower.includes(' M ') || messageLower.match(/\d+\s*M\s*[a-z]{3}/i)) {
          volume = volume * 1000000;
        } else if (messageLower.includes('mille') || messageLower.includes('milles') || messageLower.includes(' K ') || messageLower.match(/\d+\s*K\s*[a-z]{3}/i)) {
          volume = volume * 1000;
        } else if (messageLower.includes('milliard') || messageLower.includes('milliards') || messageLower.includes(' B ') || messageLower.match(/\d+\s*B\s*[a-z]{3}/i)) {
          volume = volume * 1000000000;
        }
        break;
      }
    }

    if (volume === 0 || !currency) {
      return '❓ Je n\'ai pas pu identifier le volume.\n\n💡 Veuillez spécifier un volume, par exemple: "10 millions EUR" ou "15M USD" ou "10 milles EUR".';
    }

    // Vérifier que la devise correspond à la paire
    if (currency === session.currencyPair.base) {
      session.baseVolume = volume;
      session.quoteVolume = volume * (session.spotPrice || 1);
    } else if (currency === session.currencyPair.quote) {
      session.quoteVolume = volume;
      session.baseVolume = volume / (session.spotPrice || 1);
    } else {
      return `❓ La devise du volume (${currency}) ne correspond pas à la paire ${session.currencyPair.base}/${session.currencyPair.quote}.\n\n` +
        `💡 Veuillez utiliser ${session.currencyPair.base} ou ${session.currencyPair.quote}.`;
    }

    session.step = 'maturity';
    this.sessionManager.saveSession(sessionId, session);

    return `✅ Volume: **${this.formatVolume(session.baseVolume)} ${session.currencyPair.base}**\n` +
      `   (${this.formatVolume(session.quoteVolume)} ${session.currencyPair.quote})\n\n` +
      `**Étape 3/4**: Quelle est la maturité de votre hedging?\n` +
      `💡 Exemple: "12 mois" ou "6 mois" ou "1 an"`;
  }

  /**
   * Étape 3: Collecte de la maturité
   */
  private handleMaturityStep(message: string, sessionId: string): string {
    const session = this.strategySessions.get(sessionId);
    if (!session) return '❌ Session introuvable.';

    const maturityPatterns = [
      /\b(\d+)\s*mois/i,
      /\b(\d+)\s*m\b/i,
      /\b(\d+)\s*month/i,
      /\b(\d+)\s*an/i,
      /\b(\d+)\s*année/i
    ];

    let months = 0;
    for (const pattern of maturityPatterns) {
      const match = message.match(pattern);
      if (match) {
        months = parseFloat(match[1]);
        if (message.toLowerCase().includes('an') || message.toLowerCase().includes('année')) {
          months = months * 12;
        }
        break;
      }
    }

    if (months === 0) {
      return '❓ Je n\'ai pas pu identifier la maturité.\n\n💡 Veuillez spécifier une maturité, par exemple: "12 mois" ou "6 mois".';
    }

    session.monthsToHedge = months;
    session.step = 'components';
    this.sessionManager.saveSession(sessionId, session);

    return `✅ Maturité: **${months} mois**\n\n` +
      `**Étape 4/4**: Quels composants souhaitez-vous ajouter à votre stratégie?\n\n` +
      `💡 **Types disponibles:**\n` +
      `• Options vanilles: "call strike 1.10" ou "put strike 1.05"\n` +
      `• Options barrière: "call knockout strike 1.10 barrière 1.15" ou "put knockin strike 1.05 barrière 1.00"\n` +
      `• Options digitales: "one-touch barrière 1.15 rebate 5%" ou "double-touch barrière 1.10 / 1.20"\n` +
      `• Autres: "forward strike 1.10" ou "swap"\n\n` +
      `💡 Le chat vous guidera pour collecter tous les paramètres nécessaires!\n` +
      `💡 Dites "Terminer" ou "C'est tout" une fois tous les composants ajoutés.`;
  }

  /**
   * Détecte le type d'option avancé depuis le message
   */
  private detectOptionType(message: string): { type: string; optionType: 'call' | 'put' | null } {
    const normalized = message.toLowerCase();
    
    // Options digitales
    if (normalized.includes('one-touch') || normalized.includes('one touch')) {
      return { type: 'one-touch', optionType: null };
    }
    if (normalized.includes('no-touch') || normalized.includes('no touch')) {
      return { type: 'no-touch', optionType: null };
    }
    if (normalized.includes('double-touch') || normalized.includes('double touch')) {
      return { type: 'double-touch', optionType: null };
    }
    if (normalized.includes('double-no-touch') || normalized.includes('double no touch')) {
      return { type: 'double-no-touch', optionType: null };
    }
    if (normalized.includes('range-binary') || normalized.includes('range binary')) {
      return { type: 'range-binary', optionType: null };
    }
    if (normalized.includes('outside-binary') || normalized.includes('outside binary')) {
      return { type: 'outside-binary', optionType: null };
    }
    
    // Options barrière knockout
    if (normalized.includes('knockout') || normalized.includes('knock-out') || normalized.includes('ko')) {
      if (normalized.includes('call')) {
        if (normalized.includes('reverse') || normalized.includes('rev')) {
          return { type: 'call-reverse-knockout', optionType: 'call' };
        }
        if (normalized.includes('double') || normalized.includes('dbl')) {
          return { type: 'call-double-knockout', optionType: 'call' };
        }
        return { type: 'call-knockout', optionType: 'call' };
      }
      if (normalized.includes('put')) {
        if (normalized.includes('reverse') || normalized.includes('rev')) {
          return { type: 'put-reverse-knockout', optionType: 'put' };
        }
        if (normalized.includes('double') || normalized.includes('dbl')) {
          return { type: 'put-double-knockout', optionType: 'put' };
        }
        return { type: 'put-knockout', optionType: 'put' };
      }
    }
    
    // Options barrière knockin
    if (normalized.includes('knockin') || normalized.includes('knock-in') || normalized.includes('ki')) {
      if (normalized.includes('call')) {
        if (normalized.includes('reverse') || normalized.includes('rev')) {
          return { type: 'call-reverse-knockin', optionType: 'call' };
        }
        if (normalized.includes('double') || normalized.includes('dbl')) {
          return { type: 'call-double-knockin', optionType: 'call' };
        }
        return { type: 'call-knockin', optionType: 'call' };
      }
      if (normalized.includes('put')) {
        if (normalized.includes('reverse') || normalized.includes('rev')) {
          return { type: 'put-reverse-knockin', optionType: 'put' };
        }
        if (normalized.includes('double') || normalized.includes('dbl')) {
          return { type: 'put-double-knockin', optionType: 'put' };
        }
        return { type: 'put-knockin', optionType: 'put' };
      }
    }
    
    // Options vanilles
    if (normalized.includes('call') || normalized.includes('achat')) {
      return { type: 'call', optionType: 'call' };
    }
    if (normalized.includes('put') || normalized.includes('vente')) {
      return { type: 'put', optionType: 'put' };
    }
    
    return { type: '', optionType: null };
  }

  /**
   * Détermine les paramètres requis pour un type d'option
   */
  private getRequiredParams(optionType: string): string[] {
    const params: string[] = [];
    
    // Toutes les options nécessitent un strike
    if (optionType !== 'swap' && optionType !== 'forward') {
      params.push('strike');
    }
    
    // Options vanilles nécessitent volatilité
    if (optionType === 'call' || optionType === 'put') {
      params.push('volatility');
    }
    
    // Options barrière nécessitent barrière et volatilité
    if (optionType.includes('knockout') || optionType.includes('knockin')) {
      params.push('barrier');
      params.push('volatility');
      
      // Options double barrière nécessitent aussi secondBarrier
      if (optionType.includes('double')) {
        params.push('secondBarrier');
      }
    }
    
    // Options digitales nécessitent barrière, rebate et volatilité
    if (optionType.includes('touch') || optionType.includes('binary')) {
      params.push('barrier');
      params.push('rebate');
      params.push('volatility');
      
      // Options double nécessitent secondBarrier
      if (optionType.includes('double')) {
        params.push('secondBarrier');
      }
    }
    
    // Forwards nécessitent strike
    if (optionType === 'forward') {
      params.push('strike');
    }
    
    return params;
  }

  /**
   * Étape 4: Collecte des composants avec gestion intelligente des paramètres
   */
  private handleComponentsStep(message: string, sessionId: string): string {
    const session = this.strategySessions.get(sessionId);
    if (!session || !session.currencyPair) return '❌ Session introuvable.';

    const normalized = message.toLowerCase();

    // Vérifier si l'utilisateur veut terminer
    if (normalized.includes('terminer') || normalized.includes('terminé') || 
        normalized.includes('c\'est tout') || normalized.includes('fini') ||
        normalized.includes('done')) {
      // Si on est en train de construire un composant, l'annuler
      if (session.currentComponent) {
        session.currentComponent = undefined;
        return '✅ Composant annulé.\n\n💡 Ajoutez un nouveau composant ou dites "Terminer" pour finaliser la stratégie.';
      }
      return this.finalizeStrategy(sessionId);
    }

    // Si on est en train de collecter les paramètres d'un composant
    if (session.currentComponent) {
      return this.collectComponentParams(message, sessionId);
    }

    // Détecter le type de composant
    let componentType: string | null = null;
    let optionType: 'call' | 'put' | null = null;

    if (normalized.includes('forward')) {
      componentType = 'forward';
    } else if (normalized.includes('swap')) {
      componentType = 'swap';
    } else {
      const detected = this.detectOptionType(message);
      if (detected.type) {
        componentType = detected.type;
        optionType = detected.optionType;
      }
    }

    if (!componentType) {
      return '❓ Type de composant non reconnu.\n\n💡 Types disponibles:\n' +
        `• Options vanilles: "call", "put"\n` +
        `• Options barrière: "call knockout", "put knockin", "call reverse knockout"\n` +
        `• Options digitales: "one-touch", "no-touch", "double-touch", "range-binary"\n` +
        `• Autres: "forward", "swap"\n\n` +
        `💡 Exemple: "Ajoute un call knockout strike 1.10"`;
    }

    // Initialiser le composant en cours
    session.currentComponent = {
      type: componentType,
      optionType: optionType || undefined,
      missingParams: this.getRequiredParams(componentType)
    };

    // Extraire les paramètres déjà fournis dans le message
    this.extractParamsFromMessage(message, session.currentComponent, session.spotPrice || 1.0);

    // Si tous les paramètres sont fournis, ajouter directement
    if (session.currentComponent.missingParams!.length === 0) {
      return this.addComponent(sessionId);
    }

    // Sinon, demander les paramètres manquants
    return this.askForMissingParams(sessionId);
  }

  /**
   * Extrait les paramètres depuis le message utilisateur
   */
  private extractParamsFromMessage(message: string, component: any, spotPrice: number): void {
    // Déterminer quel paramètre est prioritaire (le premier dans missingParams)
    const priorityParam = component.missingParams && component.missingParams.length > 0 
      ? component.missingParams[0] 
      : null;

    // Extraire le strike
    // D'abord, vérifier les pourcentages relatifs au spot
    const strikePercentPatterns = [
      /\b(\d+\.?\d*)\s*%\s*(?:du\s*)?spot/i, // "100% du spot" ou "100% spot"
      /\bstrike\s*(?:à|à\s*)?(\d+\.?\d*)\s*%\s*(?:du\s*)?spot/i, // "strike à 100% du spot"
      /\bstrike\s*(\d+\.?\d*)\s*%/i, // "strike 100%"
      /\b(\d+\.?\d*)\s*%\s*(?:du\s*)?spot\s*actuel/i, // "100% du spot actuel"
      /\bstrike\s*(?:à|à\s*)?(\d+\.?\d*)\s*%/i, // "strike à 100%"
    ];

    let strikeFound = false;
    for (const pattern of strikePercentPatterns) {
      const match = message.match(pattern);
      if (match) {
        const percentValue = parseFloat(match[1]);
        if (percentValue > 0 && percentValue <= 200) { // Limite raisonnable
          // Calculer le strike en fonction du pourcentage du spot
          component.strike = spotPrice * (percentValue / 100);
          component.strikeType = 'absolute'; // On convertit en valeur absolue
          if (component.missingParams) {
            component.missingParams = component.missingParams.filter((p: string) => p !== 'strike');
          }
          strikeFound = true;
          break;
        }
      }
    }

    // Si pas de pourcentage trouvé, chercher les valeurs absolues
    if (!strikeFound) {
      const strikePatterns = [
        /\bstrike\s*[=:]\s*(\d+\.?\d*)/i,
        /\bk\s*[=:]\s*(\d+\.?\d*)/i,
        /\bstrike\s+(\d+\.?\d*)/i,
        /\bà\s*(\d+\.?\d*)/i,
        /\b(\d+\.\d{2,4})\b/ // Format simple comme "1.10"
      ];

      for (const pattern of strikePatterns) {
        const match = message.match(pattern);
        if (match) {
          const value = parseFloat(match[1]);
          if (value > 0) {
            component.strike = value;
            component.strikeType = 'absolute';
            if (component.missingParams) {
              component.missingParams = component.missingParams.filter((p: string) => p !== 'strike');
            }
            strikeFound = true;
            break;
          }
        }
      }
    }

    // Si le paramètre manquant est le strike et qu'on a un pourcentage simple sans contexte
    // (ex: "100%" quand on demande le strike), l'interpréter comme pourcentage du spot
    if (!strikeFound && priorityParam === 'strike') {
      const simplePercentPattern = /\b(\d+\.?\d*)\s*%/i;
      const simpleMatch = message.match(simplePercentPattern);
      if (simpleMatch && 
          !message.toLowerCase().includes('vol') && 
          !message.toLowerCase().includes('volatilité') &&
          !message.toLowerCase().includes('quantité') &&
          !message.toLowerCase().includes('qty') &&
          !message.toLowerCase().includes('rebate') &&
          !message.toLowerCase().includes('barrière') &&
          !message.toLowerCase().includes('barrier')) {
        const percentValue = parseFloat(simpleMatch[1]);
        if (percentValue > 0 && percentValue <= 200) {
          component.strike = spotPrice * (percentValue / 100);
          component.strikeType = 'absolute';
          if (component.missingParams) {
            component.missingParams = component.missingParams.filter((p: string) => p !== 'strike');
          }
        }
      }
    }

    // Extraire la volatilité (prioritaire si c'est le paramètre manquant)
    const volPatterns = [
      /\bvol(?:atilit[ée])?\s*[=:]\s*(\d+\.?\d*)\s*%/i,
      /\bvol(?:atilit[ée])?\s+(\d+\.?\d*)\s*%/i,
      /\bvol\s*[=:]\s*(\d+\.?\d*)/i,
      /\bvol\s+(\d+\.?\d*)/i,
      /\b(\d+\.?\d*)\s*%\s*vol(?:atilit[ée])?/i,
      /\b(\d+\.?\d*)\s*%\s*vol/i
    ];

    let volatilityFound = false;
    for (const pattern of volPatterns) {
      const match = message.match(pattern);
      if (match) {
        const volValue = parseFloat(match[1]);
        if (volValue > 0 && volValue <= 100) {
          component.volatility = volValue;
          if (component.missingParams) {
            component.missingParams = component.missingParams.filter((p: string) => p !== 'volatility');
          }
          volatilityFound = true;
          break; // Sortir de la boucle après avoir trouvé la volatilité
        }
      }
    }

    // Si aucun pattern explicite ne correspond mais que le message contient juste un nombre avec %, 
    // et que la volatilité est le paramètre manquant prioritaire, l'utiliser
    if (!volatilityFound && priorityParam === 'volatility') {
      const simplePercentPattern = /\b(\d+\.?\d*)\s*%/i;
      const simpleMatch = message.match(simplePercentPattern);
      if (simpleMatch) {
        const volValue = parseFloat(simpleMatch[1]);
        // Vérifier que ce n'est pas une quantité (qui serait aussi un pourcentage)
        // Si le message ne contient pas "quantité" ou "qty", c'est probablement la volatilité
        if (volValue > 0 && volValue <= 100 && 
            !message.toLowerCase().includes('quantité') && 
            !message.toLowerCase().includes('qty') &&
            !message.toLowerCase().includes('quantity') &&
            !message.toLowerCase().includes('barrière') &&
            !message.toLowerCase().includes('barrier') &&
            !message.toLowerCase().includes('rebate')) {
          component.volatility = volValue;
          if (component.missingParams) {
            component.missingParams = component.missingParams.filter((p: string) => p !== 'volatility');
          }
        }
      }
    }

    // Extraire la barrière
    const barrierPatterns = [
      /\bbarri[èe]re\s*[=:]\s*(\d+\.?\d*)/i,
      /\bbarrier\s*[=:]\s*(\d+\.?\d*)/i,
      /\bbarri[èe]re\s+(\d+\.?\d*)/i
    ];

    for (const pattern of barrierPatterns) {
      const match = message.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        if (value > 0) {
          if (!component.barrier) {
            component.barrier = value;
            component.barrierType = 'absolute';
            if (component.missingParams) {
              component.missingParams = component.missingParams.filter((p: string) => p !== 'barrier');
            }
          } else if (!component.secondBarrier) {
            component.secondBarrier = value;
            if (component.missingParams) {
              component.missingParams = component.missingParams.filter((p: string) => p !== 'secondBarrier');
            }
          }
        }
      }
    }

    // Extraire le rebate (pour options digitales)
    const rebatePatterns = [
      /\brebate\s*[=:]\s*(\d+\.?\d*)\s*%/i,
      /\brebate\s*[=:]\s*(\d+\.?\d*)/i
    ];

    for (const pattern of rebatePatterns) {
      const match = message.match(pattern);
      if (match) {
        component.rebate = parseFloat(match[1]);
        if (component.missingParams) {
          component.missingParams = component.missingParams.filter((p: string) => p !== 'rebate');
        }
      }
    }

    // Extraire la quantité (seulement si ce n'est pas la volatilité qui est demandée)
    // Pour éviter les conflits avec les pourcentages simples
    if (priorityParam !== 'volatility') {
      const quantityPatterns = [
        /\bquantit[ée]\s*[=:]\s*(\d+\.?\d*)\s*%/i,
        /\bqty\s*[=:]\s*(\d+\.?\d*)/i
      ];

      for (const pattern of quantityPatterns) {
        const match = message.match(pattern);
        if (match) {
          component.quantity = parseFloat(match[1]);
          if (component.missingParams) {
            component.missingParams = component.missingParams.filter((p: string) => p !== 'quantity');
          }
        }
      }
      
      // Si la quantité est le paramètre manquant et qu'on a un simple pourcentage, l'utiliser
      if (priorityParam === 'quantity') {
        const simplePercentPattern = /\b(\d+\.?\d*)\s*%/i;
        const simpleMatch = message.match(simplePercentPattern);
        if (simpleMatch && !component.quantity) {
          const qtyValue = parseFloat(simpleMatch[1]);
          if (qtyValue > 0 && qtyValue <= 100) {
            component.quantity = qtyValue;
            if (component.missingParams) {
              component.missingParams = component.missingParams.filter((p: string) => p !== 'quantity');
            }
          }
        }
      }
    }
  }

  /**
   * Collecte les paramètres manquants étape par étape
   */
  private collectComponentParams(message: string, sessionId: string): string {
    const session = this.strategySessions.get(sessionId);
    if (!session || !session.currentComponent) return '❌ Erreur de session.';

    const component = session.currentComponent;
    const spotPrice = session.spotPrice || 1.0;

    // Extraire les paramètres du message
    this.extractParamsFromMessage(message, component, spotPrice);

    // Vérifier si tous les paramètres sont maintenant fournis
    if (component.missingParams && component.missingParams.length === 0) {
      return this.addComponent(sessionId);
    }

    // Sinon, continuer à demander
    return this.askForMissingParams(sessionId);
  }

  /**
   * Demande les paramètres manquants de manière intelligente
   */
  private askForMissingParams(sessionId: string): string {
    const session = this.strategySessions.get(sessionId);
    if (!session || !session.currentComponent) return '❌ Erreur de session.';

    const component = session.currentComponent;
    const missing = component.missingParams || [];
    const spotPrice = session.spotPrice || 1.0;

    if (missing.length === 0) {
      return this.addComponent(sessionId);
    }

    const nextParam = missing[0];
    let question = `📝 **Ajout d'un ${component.type.toUpperCase()}**\n\n`;

    // Afficher les paramètres déjà collectés
    const collected: string[] = [];
    if (component.strike) collected.push(`✅ Strike: ${component.strike}`);
    if (component.volatility) collected.push(`✅ Volatilité: ${component.volatility}%`);
    if (component.barrier) collected.push(`✅ Barrière: ${component.barrier}`);
    if (component.secondBarrier) collected.push(`✅ Seconde barrière: ${component.secondBarrier}`);
    if (component.rebate) collected.push(`✅ Rebate: ${component.rebate}%`);
    if (component.quantity) collected.push(`✅ Quantité: ${component.quantity}%`);

    if (collected.length > 0) {
      question += collected.join('\n') + '\n\n';
    }

    // Demander le paramètre suivant
    switch (nextParam) {
      case 'strike':
        question += `❓ **Quel est le strike?**\n` +
          `💡 Exemples:\n` +
          `• Valeur absolue: "1.10" ou "strike 1.10"\n` +
          `• Pourcentage du spot: "100% du spot" ou "110%" (spot actuel: ${spotPrice.toFixed(4)})\n` +
          `• 100% = ${spotPrice.toFixed(4)}, 110% = ${(spotPrice * 1.1).toFixed(4)}`;
        break;
      case 'volatility':
        question += `❓ **Quelle est la volatilité?**\n` +
          `💡 Exemple: "12%" ou "vol 15" (par défaut: ${(this.defaultVolatility * 100).toFixed(1)}%)`;
        break;
      case 'barrier':
        question += `❓ **Quelle est la barrière?**\n` +
          `💡 Exemple: "1.15" ou "barrière 1.15" (spot actuel: ${spotPrice.toFixed(4)})`;
        break;
      case 'secondBarrier':
        question += `❓ **Quelle est la seconde barrière?**\n` +
          `💡 Exemple: "1.20" ou "seconde barrière 1.20"`;
        break;
      case 'rebate':
        question += `❓ **Quel est le rebate (paiement)?**\n` +
          `💡 Exemple: "5%" ou "rebate 10" (par défaut: 5%)`;
        break;
      default:
        question += `❓ Veuillez fournir: ${nextParam}`;
    }

    return question;
  }

  /**
   * Ajoute le composant à la stratégie
   */
  private addComponent(sessionId: string): string {
    const session = this.strategySessions.get(sessionId);
    if (!session || !session.currentComponent) return '❌ Erreur de session.';

    const component = session.currentComponent;
    const spotPrice = session.spotPrice || 1.0;

    // Appliquer les valeurs par défaut
    const finalComponent: any = {
      type: component.type,
      quantity: component.quantity || 100,
      strikeType: component.strikeType || 'absolute'
    };

    if (component.optionType) {
      finalComponent.optionType = component.optionType;
    }

    if (component.strike) {
      finalComponent.strike = component.strike;
    } else if (component.type !== 'swap' && component.type !== 'forward') {
      // Strike par défaut pour les options
      finalComponent.strike = spotPrice;
      finalComponent.strikeType = 'absolute';
    }

    if (component.volatility !== undefined) {
      finalComponent.volatility = component.volatility;
    } else if (component.type === 'call' || component.type === 'put' || 
               component.type.includes('knockout') || component.type.includes('knockin') ||
               component.type.includes('touch') || component.type.includes('binary')) {
      finalComponent.volatility = this.defaultVolatility * 100;
    }

    if (component.barrier) {
      finalComponent.barrier = component.barrier;
      finalComponent.barrierType = component.barrierType || 'absolute';
    }

    if (component.secondBarrier) {
      finalComponent.secondBarrier = component.secondBarrier;
    }

    if (component.rebate !== undefined) {
      finalComponent.rebate = component.rebate;
    } else if (component.type.includes('touch') || component.type.includes('binary')) {
      finalComponent.rebate = 5; // Par défaut 5%
    }

    session.components.push(finalComponent);
    const componentDesc = this.formatComponentDescription(finalComponent);

    // Réinitialiser le composant en cours
    session.currentComponent = undefined;

    return `✅ **Composant ajouté:** ${componentDesc}\n\n` +
      `📊 Total composants: ${session.components.length}\n\n` +
      `💡 Ajoutez d'autres composants ou dites "Terminer" pour finaliser la stratégie.`;
  }

  /**
   * Formate la description d'un composant
   */
  private formatComponentDescription(component: any): string {
    let desc = component.type.toUpperCase();
    
    if (component.strike) {
      desc += ` Strike ${component.strike}`;
    }
    if (component.barrier) {
      desc += ` Barrière ${component.barrier}`;
    }
    if (component.secondBarrier) {
      desc += ` / ${component.secondBarrier}`;
    }
    if (component.volatility) {
      desc += ` Vol ${component.volatility}%`;
    }
    if (component.rebate) {
      desc += ` Rebate ${component.rebate}%`;
    }
    if (component.quantity) {
      desc += ` Qty ${component.quantity}%`;
    }
    
    return desc;
  }

  /**
   * Finalise la stratégie et l'exporte vers Strategy Builder
   */
  private finalizeStrategy(sessionId: string): string {
    const session = this.strategySessions.get(sessionId);
    if (!session || !session.currencyPair || !session.baseVolume || !session.monthsToHedge) {
      return '❌ Paramètres manquants. Veuillez recommencer la simulation.';
    }

    try {
      // Construire la structure pour Strategy Builder
      const currencyPair = {
        symbol: `${session.currencyPair.base}/${session.currencyPair.quote}`,
        name: `${session.currencyPair.base}/${session.currencyPair.quote}`,
        base: session.currencyPair.base,
        quote: session.currencyPair.quote,
        category: 'majors' as const,
        defaultSpotRate: session.spotPrice || 1.0
      };

      const calculatorState = {
        params: {
          startDate: new Date().toISOString().split('T')[0],
          strategyStartDate: new Date().toISOString().split('T')[0],
          monthsToHedge: session.monthsToHedge,
          domesticRate: (this.defaultRates[session.currencyPair.quote] || 5.0) / 100,
          foreignRate: (this.defaultRates[session.currencyPair.base] || 4.0) / 100,
          baseVolume: session.baseVolume,
          quoteVolume: session.quoteVolume,
          spotPrice: session.spotPrice || 1.0,
          currencyPair: currencyPair,
          useCustomPeriods: false,
          customPeriods: [],
          volumeType: 'receivable' as const
        },
        strategy: session.components.map(comp => ({
          type: comp.type,
          optionType: comp.optionType,
          strike: comp.strike,
          strikeType: comp.strikeType || 'absolute',
          quantity: comp.quantity || 100,
          volatility: comp.volatility || this.defaultVolatility * 100,
          barrier: comp.barrier,
          barrierType: comp.barrierType || 'absolute',
          secondBarrier: comp.secondBarrier,
          rebate: comp.rebate
        })),
        results: null,
        payoffData: [],
        manualForwards: {},
        realPrices: {},
        realPriceParams: {
          useSimulation: false,
          volatility: this.defaultVolatility,
          drift: 0.01,
          numSimulations: 1000
        },
        barrierOptionSimulations: 1000,
        useClosedFormBarrier: false,
        activeTab: 'parameters',
        customScenario: null,
        stressTestScenarios: {},
        useImpliedVol: false,
        impliedVolatilities: {},
        customOptionPrices: {}
      };

      // Sauvegarder dans localStorage
      localStorage.setItem('calculatorState', JSON.stringify(calculatorState));

      // Déclencher un événement personnalisé pour notifier Strategy Builder
      window.dispatchEvent(new CustomEvent('calculatorStateUpdated', {
        detail: { source: 'chat' }
      }));

      // Marquer la session comme complète
      session.step = 'complete';
      this.sessionManager.saveSession(sessionId, session);

      return `✅ **Stratégie créée avec succès!**\n\n` +
        `📊 **Résumé:**\n` +
        `• Paire: ${session.currencyPair.base}/${session.currencyPair.quote}\n` +
        `• Volume: ${this.formatVolume(session.baseVolume)} ${session.currencyPair.base}\n` +
        `• Maturité: ${session.monthsToHedge} mois\n` +
        `• Composants: ${session.components.length}\n\n` +
        `🚀 **Prochaines étapes:**\n` +
        `1. Allez sur **Strategy Builder**\n` +
        `2. Cliquez sur **"Calculate Strategy Results"**\n` +
        `3. Les résultats apparaîtront automatiquement ici une fois calculés\n\n` +
        `💡 La stratégie a été chargée dans Strategy Builder!\n` +
        `📊 Le chat surveille automatiquement les résultats et vous notifiera dès qu'ils seront disponibles.`;
    } catch (error) {
      console.error('Error finalizing strategy:', error);
      return '❌ Erreur lors de la création de la stratégie. Veuillez réessayer.';
    }
  }

  /**
   * Récupère et affiche les résultats de la stratégie
   */
  private handleResultsRequest(): string {
    try {
      // Utiliser ChatSyncService pour récupérer les résultats
      const syncService = ChatSyncService.getInstance();
      const results = syncService.getResults();

      if (!results || !Array.isArray(results) || results.length === 0) {
        return '⏳ **Aucun résultat calculé pour le moment.**\n\n' +
          `💡 Veuillez:\n` +
          `1. Aller sur **Strategy Builder**\n` +
          `2. Cliquer sur **"Calculate Strategy Results"**\n` +
          `3. Les résultats apparaîtront automatiquement ici une fois calculés`;
      }

      const savedState = localStorage.getItem('calculatorState');
      if (!savedState) {
        return '❌ Aucune stratégie trouvée. Veuillez d\'abord créer une stratégie.';
      }

      const state = JSON.parse(savedState);

      // Calculer les totaux
      const totals = results.reduce((acc: any, result: any) => {
        acc.hedgedCost += result.hedgedCost || 0;
        acc.unhedgedCost += result.unhedgedCost || 0;
        acc.deltaPnL += result.deltaPnL || 0;
        acc.totalVolume += result.monthlyVolume || 0;
        acc.strategyPremium += (result.strategyPrice || 0) * (result.monthlyVolume || 0);
        return acc;
      }, {
        hedgedCost: 0,
        unhedgedCost: 0,
        deltaPnL: 0,
        totalVolume: 0,
        strategyPremium: 0
      });

      // Calculer par année
      const yearlyResults: Record<string, any> = {};
      results.forEach((result: any) => {
        const year = result.date.split('-')[0];
        if (!yearlyResults[year]) {
          yearlyResults[year] = {
            hedgedCost: 0,
            unhedgedCost: 0,
            deltaPnL: 0,
            volume: 0
          };
        }
        yearlyResults[year].hedgedCost += result.hedgedCost || 0;
        yearlyResults[year].unhedgedCost += result.unhedgedCost || 0;
        yearlyResults[year].deltaPnL += result.deltaPnL || 0;
        yearlyResults[year].volume += result.monthlyVolume || 0;
      });

      const currencyPair = state.params?.currencyPair;
      const currency = currencyPair?.quote || 'USD';

      let response = `📊 **Résultats de la stratégie**\n\n`;
      response += `**Résumé global:**\n`;
      response += `• Coût hedgé: ${this.formatCurrency(totals.hedgedCost, currency)}\n`;
      response += `• Coût non-hedgé: ${this.formatCurrency(totals.unhedgedCost, currency)}\n`;
      response += `• P&L Delta: ${this.formatCurrency(totals.deltaPnL, currency)}\n`;
      response += `• Premium stratégie: ${this.formatCurrency(totals.strategyPremium, currency)}\n`;
      response += `• Volume total: ${this.formatVolume(totals.totalVolume)}\n\n`;

      if (Object.keys(yearlyResults).length > 0) {
        response += `**Par année:**\n`;
        Object.entries(yearlyResults).sort().forEach(([year, data]: [string, any]) => {
          response += `\n**${year}:**\n`;
          response += `  • P&L: ${this.formatCurrency(data.deltaPnL, currency)}\n`;
          response += `  • Volume: ${this.formatVolume(data.volume)}\n`;
        });
      }

      return response;
    } catch (error) {
      this.logger.error('Erreur lors de la lecture des résultats', error);
      return '❌ Erreur lors de la lecture des résultats.';
    }
  }

  /**
   * Formate un montant en devise
   */
  private formatCurrency(amount: number, currency: string = 'USD'): string {
    if (isNaN(amount)) return 'N/A';
    const absAmount = Math.abs(amount);
    if (absAmount >= 1000000) {
      return `${(amount / 1000000).toFixed(2)}M ${currency}`;
    } else if (absAmount >= 1000) {
      return `${(amount / 1000).toFixed(2)}K ${currency}`;
    }
    return `${amount.toFixed(2)} ${currency}`;
  }

  /**
   * Formate un volume
   */
  private formatVolume(volume: number): string {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(2)}M`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(2)}K`;
    }
    return volume.toFixed(0);
  }

  /**
   * Réponse par défaut avec toutes les fonctionnalités disponibles
   */
  private getDefaultResponse(): string {
    return `Je peux vous aider avec plusieurs fonctionnalités:\n\n` +
      `📊 **Taux de change spot**\n` +
      `• "Quel est le spot EUR/USD?"\n` +
      `• "Donne-moi le taux GBP/USD"\n\n` +
      `💰 **Calcul de prix d'options**\n` +
      `• "Calcule un call EUR/USD strike 1.10 à 3 mois"\n` +
      `• "Prix d'un put GBP/USD strike 1.25 à 6 mois vol 12%"\n\n` +
      `📈 **Calcul de forward FX**\n` +
      `• "Quel est le forward EUR/USD à 6 mois?"\n` +
      `• "Forward USD/JPY à 3 mois"\n\n` +
      `💡 Posez votre question en langage naturel!`;
  }
}

export default ChatService;

