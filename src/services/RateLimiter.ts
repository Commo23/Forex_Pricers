/**
 * Service de rate limiting pour limiter les appels API et les messages
 */

import LoggerService from './LoggerService';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

class RateLimiter {
  private static instance: RateLimiter;
  private requests: Map<string, number[]> = new Map();
  private logger = LoggerService.getInstance();
  
  // Configuration par défaut
  private defaultConfig: RateLimitConfig = {
    maxRequests: 10, // 10 requêtes
    windowMs: 60000  // par minute
  };

  private constructor() {
    // Nettoyer les anciennes requêtes périodiquement
    setInterval(() => {
      this.cleanup();
    }, 60000); // Toutes les minutes
  }

  static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  /**
   * Vérifie si une requête peut être effectuée
   */
  canMakeRequest(
    userId: string, 
    config?: Partial<RateLimitConfig>
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const finalConfig = { ...this.defaultConfig, ...config };
    const now = Date.now();
    
    // Récupérer les requêtes de l'utilisateur
    const userRequests = this.requests.get(userId) || [];
    
    // Nettoyer les requêtes anciennes (hors de la fenêtre)
    const recentRequests = userRequests.filter(
      time => now - time < finalConfig.windowMs
    );
    
    // Mettre à jour le cache
    this.requests.set(userId, recentRequests);
    
    // Vérifier si on peut faire une nouvelle requête
    const allowed = recentRequests.length < finalConfig.maxRequests;
    const remaining = Math.max(0, finalConfig.maxRequests - recentRequests.length);
    const resetAt = recentRequests.length > 0 
      ? recentRequests[0] + finalConfig.windowMs 
      : now;
    
    if (!allowed) {
      this.logger.warn(`Rate limit atteint pour ${userId}`, {
        requests: recentRequests.length,
        max: finalConfig.maxRequests,
        windowMs: finalConfig.windowMs
      });
    }
    
    return { allowed, remaining, resetAt };
  }

  /**
   * Enregistre une requête
   */
  recordRequest(userId: string): void {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];
    userRequests.push(now);
    this.requests.set(userId, userRequests);
  }

  /**
   * Vérifie et enregistre une requête en une seule opération
   */
  checkAndRecord(
    userId: string,
    config?: Partial<RateLimitConfig>
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const result = this.canMakeRequest(userId, config);
    
    if (result.allowed) {
      this.recordRequest(userId);
    }
    
    return result;
  }

  /**
   * Réinitialise le rate limit pour un utilisateur
   */
  reset(userId: string): void {
    this.requests.delete(userId);
    this.logger.debug(`Rate limit réinitialisé pour ${userId}`);
  }

  /**
   * Nettoie les anciennes entrées
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = 60000 * 10; // 10 minutes
    
    for (const [userId, requests] of this.requests.entries()) {
      const recentRequests = requests.filter(
        time => now - time < maxAge
      );
      
      if (recentRequests.length === 0) {
        this.requests.delete(userId);
      } else {
        this.requests.set(userId, recentRequests);
      }
    }
  }

  /**
   * Récupère les statistiques pour un utilisateur
   */
  getStats(userId: string, config?: Partial<RateLimitConfig>): {
    requests: number;
    maxRequests: number;
    remaining: number;
    resetAt: number;
  } {
    const finalConfig = { ...this.defaultConfig, ...config };
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];
    
    const recentRequests = userRequests.filter(
      time => now - time < finalConfig.windowMs
    );
    
    const resetAt = recentRequests.length > 0 
      ? recentRequests[0] + finalConfig.windowMs 
      : now;
    
    return {
      requests: recentRequests.length,
      maxRequests: finalConfig.maxRequests,
      remaining: Math.max(0, finalConfig.maxRequests - recentRequests.length),
      resetAt
    };
  }
}

export default RateLimiter;

