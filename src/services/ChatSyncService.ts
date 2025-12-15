/**
 * Service de synchronisation entre le chat et l'application
 * Détecte les changements dans Strategy Builder et notifie le chat
 */
class ChatSyncService {
  private static instance: ChatSyncService;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private lastResultsHash: string = '';
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;

  private constructor() {
    this.setupStorageListener();
  }

  static getInstance(): ChatSyncService {
    if (!ChatSyncService.instance) {
      ChatSyncService.instance = new ChatSyncService();
    }
    return ChatSyncService.instance;
  }

  /**
   * Écoute les changements dans localStorage
   */
  private setupStorageListener() {
    // Écouter les événements de stockage (pour les onglets multiples)
    window.addEventListener('storage', (event) => {
      if (event.key === 'calculatorState') {
        this.checkForResults();
      }
    });

    // Détecter les changements dans le même onglet en interceptant setItem
    const originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key: string, value: string) => {
      originalSetItem(key, value);
      if (key === 'calculatorState') {
        // Délai pour laisser le temps à l'application de sauvegarder
        setTimeout(() => this.checkForResults(), 100);
      }
    };
  }

  /**
   * Démarre le polling pour détecter les résultats
   */
  startPolling(intervalMs: number = 2000) {
    if (this.isPolling) return;
    
    this.isPolling = true;
    this.pollingInterval = setInterval(() => {
      this.checkForResults();
    }, intervalMs);
  }

  /**
   * Arrête le polling
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      this.isPolling = false;
    }
  }

  /**
   * Vérifie si de nouveaux résultats sont disponibles
   */
  private checkForResults() {
    try {
      const savedState = localStorage.getItem('calculatorState');
      if (!savedState) {
        this.lastResultsHash = '';
        return;
      }

      const state = JSON.parse(savedState);
      const results = state.results;

      // Créer un hash des résultats pour détecter les changements
      const resultsHash = results 
        ? JSON.stringify(results).substring(0, 100) + results.length.toString()
        : '';

      // Si les résultats ont changé
      if (resultsHash !== this.lastResultsHash && results && Array.isArray(results) && results.length > 0) {
        const hadResults = this.lastResultsHash !== '';
        this.lastResultsHash = resultsHash;
        
        // Notifier seulement si on avait déjà des résultats avant (pour éviter la notification initiale)
        if (hadResults) {
          this.notifyListeners('resultsUpdated', {
            results,
            params: state.params,
            strategy: state.strategy
          });
        } else {
          // Première fois qu'on détecte des résultats
          this.notifyListeners('resultsCalculated', {
            results,
            params: state.params,
            strategy: state.strategy
          });
        }
      }

      // Détecter les changements de stratégie
      const strategyHash = state.strategy 
        ? JSON.stringify(state.strategy).substring(0, 50) + state.strategy.length.toString()
        : '';
      
      if (strategyHash !== this.getLastStrategyHash()) {
        this.setLastStrategyHash(strategyHash);
        this.notifyListeners('strategyUpdated', {
          strategy: state.strategy,
          params: state.params
        });
      }
    } catch (error) {
      console.error('Error checking for results:', error);
    }
  }

  /**
   * Enregistre un listener pour un type d'événement
   */
  on(event: 'resultsCalculated' | 'resultsUpdated' | 'strategyUpdated', callback: (data: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Retourner une fonction pour se désabonner
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /**
   * Notifie tous les listeners d'un événement
   */
  private notifyListeners(event: string, data: any) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Récupère le hash de la stratégie précédente
   */
  private getLastStrategyHash(): string {
    return sessionStorage.getItem('chatLastStrategyHash') || '';
  }

  /**
   * Sauvegarde le hash de la stratégie
   */
  private setLastStrategyHash(hash: string) {
    sessionStorage.setItem('chatLastStrategyHash', hash);
  }

  /**
   * Vérifie si des résultats sont disponibles
   */
  hasResults(): boolean {
    try {
      const savedState = localStorage.getItem('calculatorState');
      if (!savedState) return false;
      
      const state = JSON.parse(savedState);
      return state.results && Array.isArray(state.results) && state.results.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Récupère les résultats actuels
   */
  getResults(): any {
    try {
      const savedState = localStorage.getItem('calculatorState');
      if (!savedState) return null;
      
      const state = JSON.parse(savedState);
      return state.results || null;
    } catch {
      return null;
    }
  }
}

export default ChatSyncService;

