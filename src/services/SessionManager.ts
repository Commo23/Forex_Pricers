/**
 * Gestionnaire de sessions avec persistance et expiration
 */

import LoggerService from './LoggerService';
import type { StrategySession } from './ChatService';

interface SessionData {
  session: StrategySession;
  expiresAt: number;
  createdAt: number;
  lastAccessed: number;
}

class SessionManager {
  private static instance: SessionManager;
  private static readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private static readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private static readonly MAX_SESSIONS = 50;
  
  private cleanupInterval: NodeJS.Timeout | null = null;
  private logger = LoggerService.getInstance();

  private constructor() {
    this.startCleanupInterval();
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Démarre l'intervalle de nettoyage automatique
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) return;
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, SessionManager.CLEANUP_INTERVAL);
    
    // Nettoyer au démarrage
    this.cleanupExpiredSessions();
  }

  /**
   * Arrête l'intervalle de nettoyage
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Sauvegarde une session
   */
  saveSession(sessionId: string, session: StrategySession): void {
    try {
      const sessionData: SessionData = {
        session,
        expiresAt: Date.now() + SessionManager.SESSION_TIMEOUT,
        createdAt: Date.now(),
        lastAccessed: Date.now()
      };

      const key = `chatSession_${sessionId}`;
      localStorage.setItem(key, JSON.stringify(sessionData));
      
      this.logger.debug(`Session sauvegardée: ${sessionId}`, { step: session.step });
      
      // Vérifier le nombre de sessions
      this.enforceMaxSessions();
    } catch (error) {
      this.logger.error('Erreur lors de la sauvegarde de session', error, { sessionId });
    }
  }

  /**
   * Récupère une session
   */
  getSession(sessionId: string): StrategySession | null {
    try {
      const key = `chatSession_${sessionId}`;
      const data = localStorage.getItem(key);
      
      if (!data) {
        return null;
      }

      const sessionData: SessionData = JSON.parse(data);
      
      // Vérifier l'expiration
      if (sessionData.expiresAt < Date.now()) {
        this.deleteSession(sessionId);
        this.logger.debug(`Session expirée supprimée: ${sessionId}`);
        return null;
      }

      // Mettre à jour lastAccessed
      sessionData.lastAccessed = Date.now();
      localStorage.setItem(key, JSON.stringify(sessionData));

      return sessionData.session;
    } catch (error) {
      this.logger.error('Erreur lors de la récupération de session', error, { sessionId });
      return null;
    }
  }

  /**
   * Supprime une session
   */
  deleteSession(sessionId: string): void {
    try {
      const key = `chatSession_${sessionId}`;
      localStorage.removeItem(key);
      this.logger.debug(`Session supprimée: ${sessionId}`);
    } catch (error) {
      this.logger.error('Erreur lors de la suppression de session', error, { sessionId });
    }
  }

  /**
   * Supprime toutes les sessions (pour le refresh du chat)
   */
  clearAllSessions(): void {
    try {
      const keys: string[] = [];
      
      // Collecter toutes les clés de sessions
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('chatSession_')) {
          keys.push(key);
        }
      }
      
      // Supprimer toutes les sessions
      keys.forEach(key => {
        localStorage.removeItem(key);
      });
      
      this.logger.debug(`Toutes les sessions supprimées (${keys.length} sessions)`);
    } catch (error) {
      this.logger.error('Erreur lors de la suppression de toutes les sessions', error);
    }
  }

  /**
   * Vérifie si une session existe
   */
  hasSession(sessionId: string): boolean {
    const session = this.getSession(sessionId);
    return session !== null;
  }

  /**
   * Nettoie les sessions expirées
   */
  cleanupExpiredSessions(): void {
    try {
      const keys: string[] = [];
      
      // Parcourir tous les éléments de localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('chatSession_')) {
          keys.push(key);
        }
      }

      let cleaned = 0;
      for (const key of keys) {
        try {
          const data = localStorage.getItem(key);
          if (!data) continue;

          const sessionData: SessionData = JSON.parse(data);
          
          if (sessionData.expiresAt < Date.now()) {
            localStorage.removeItem(key);
            cleaned++;
          }
        } catch (error) {
          // Si erreur de parsing, supprimer la clé corrompue
          localStorage.removeItem(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.logger.debug(`Nettoyage: ${cleaned} session(s) expirée(s) supprimée(s)`);
      }
    } catch (error) {
      this.logger.error('Erreur lors du nettoyage des sessions', error);
    }
  }

  /**
   * Limite le nombre de sessions (supprime les plus anciennes)
   */
  private enforceMaxSessions(): void {
    try {
      const sessions: Array<{ key: string; lastAccessed: number }> = [];
      
      // Collecter toutes les sessions
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('chatSession_')) {
          try {
            const data = localStorage.getItem(key);
            if (!data) continue;

            const sessionData: SessionData = JSON.parse(data);
            sessions.push({
              key,
              lastAccessed: sessionData.lastAccessed
            });
          } catch {
            // Ignorer les sessions corrompues
          }
        }
      }

      // Si on dépasse le maximum, supprimer les plus anciennes
      if (sessions.length > SessionManager.MAX_SESSIONS) {
        sessions.sort((a, b) => a.lastAccessed - b.lastAccessed);
        const toDelete = sessions.slice(0, sessions.length - SessionManager.MAX_SESSIONS);
        
        for (const session of toDelete) {
          localStorage.removeItem(session.key);
        }
        
        this.logger.debug(`Limite de sessions atteinte: ${toDelete.length} session(s) supprimée(s)`);
      }
    } catch (error) {
      this.logger.error('Erreur lors de l\'application de la limite de sessions', error);
    }
  }

  /**
   * Récupère toutes les sessions actives
   */
  getAllActiveSessions(): Array<{ sessionId: string; session: StrategySession; expiresAt: number }> {
    const activeSessions: Array<{ sessionId: string; session: StrategySession; expiresAt: number }> = [];
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('chatSession_')) {
          const sessionId = key.replace('chatSession_', '');
          const session = this.getSession(sessionId);
          
          if (session) {
            const data = localStorage.getItem(key);
            if (data) {
              const sessionData: SessionData = JSON.parse(data);
              activeSessions.push({
                sessionId,
                session,
                expiresAt: sessionData.expiresAt
              });
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Erreur lors de la récupération des sessions actives', error);
    }
    
    return activeSessions;
  }

  /**
   * Supprime toutes les sessions
   */
  clearAllSessions(): void {
    try {
      const keys: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('chatSession_')) {
          keys.push(key);
        }
      }

      for (const key of keys) {
        localStorage.removeItem(key);
      }
      
      this.logger.info(`${keys.length} session(s) supprimée(s)`);
    } catch (error) {
      this.logger.error('Erreur lors de la suppression de toutes les sessions', error);
    }
  }
}

export default SessionManager;

