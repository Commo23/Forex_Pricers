/**
 * Configuration centralisée pour le chatbot
 */

export const ChatConfig = {
  // Limites de messages
  maxMessageLength: 1000,
  minMessageLength: 1,
  
  // Sessions
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  maxSessions: 50,
  cleanupInterval: 5 * 60 * 1000, // 5 minutes
  
  // Polling
  pollingInterval: 2000, // 2 secondes
  pollingPauseWhenClosed: true,
  
  // Rate limiting
  rateLimit: {
    maxRequests: 10,
    windowMs: 60000, // 1 minute
  },
  
  // Retry
  maxRetries: 3,
  retryDelay: 1000, // 1 seconde
  
  // Timeouts
  apiTimeout: 30000, // 30 secondes
  
  // Logging
  logLevel: import.meta.env.DEV ? 'debug' : 'warn',
  
  // Validation
  validation: {
    maxStrikePercent: 200, // 200% du spot max
    minStrikePercent: 0.1, // 0.1% du spot min
    maxVolatility: 100, // 100% max
    minVolatility: 0.1, // 0.1% min
  }
} as const;

export type ChatConfigType = typeof ChatConfig;

