/**
 * Service de logging structuré pour le chatbot
 * Supporte différents niveaux de log et peut être désactivé en production
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: any;
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
}

class LoggerService {
  private static instance: LoggerService;
  private logLevel: LogLevel;
  private isProduction: boolean;
  private logs: LogEntry[] = [];
  private maxLogsInMemory = 100;

  private constructor() {
    // Déterminer l'environnement
    this.isProduction = import.meta.env.PROD || process.env.NODE_ENV === 'production';
    
    // Niveau de log selon l'environnement
    this.logLevel = this.isProduction ? 'warn' : 'debug';
    
    // Charger depuis localStorage si disponible
    const savedLevel = localStorage.getItem('chatLogLevel');
    if (savedLevel && ['debug', 'info', 'warn', 'error'].includes(savedLevel)) {
      this.logLevel = savedLevel as LogLevel;
    }
  }

  static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  /**
   * Définit le niveau de log
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    localStorage.setItem('chatLogLevel', level);
  }

  /**
   * Vérifie si un niveau doit être loggé
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  /**
   * Ajoute une entrée de log
   */
  private addLog(entry: LogEntry): void {
    this.logs.push(entry);
    
    // Limiter la taille du tableau en mémoire
    if (this.logs.length > this.maxLogsInMemory) {
      this.logs.shift();
    }
  }

  /**
   * Log de debug (développement uniquement)
   */
  debug(message: string, context?: any): void {
    if (!this.shouldLog('debug')) return;
    
    const entry: LogEntry = {
      level: 'debug',
      message,
      timestamp: new Date(),
      context
    };
    
    this.addLog(entry);
    console.log(`[DEBUG] ${message}`, context || '');
  }

  /**
   * Log d'information
   */
  info(message: string, context?: any): void {
    if (!this.shouldLog('info')) return;
    
    const entry: LogEntry = {
      level: 'info',
      message,
      timestamp: new Date(),
      context
    };
    
    this.addLog(entry);
    console.log(`[INFO] ${message}`, context || '');
  }

  /**
   * Log d'avertissement
   */
  warn(message: string, context?: any): void {
    if (!this.shouldLog('warn')) return;
    
    const entry: LogEntry = {
      level: 'warn',
      message,
      timestamp: new Date(),
      context
    };
    
    this.addLog(entry);
    console.warn(`[WARN] ${message}`, context || '');
  }

  /**
   * Log d'erreur
   */
  error(message: string, error?: Error | unknown, context?: any): void {
    if (!this.shouldLog('error')) return;
    
    let errorData: LogEntry['error'] | undefined;
    
    if (error instanceof Error) {
      errorData = {
        message: error.message,
        stack: error.stack,
        name: error.name
      };
    } else if (error) {
      errorData = {
        message: String(error)
      };
    }
    
    const entry: LogEntry = {
      level: 'error',
      message,
      timestamp: new Date(),
      context,
      error: errorData
    };
    
    this.addLog(entry);
    console.error(`[ERROR] ${message}`, error || '', context || '');
    
    // En production, on pourrait envoyer à un service de logging externe
    if (this.isProduction && errorData) {
      // Exemple: envoyer à Sentry, LogRocket, etc.
      // this.sendToExternalService(entry);
    }
  }

  /**
   * Récupère les logs récents
   */
  getRecentLogs(level?: LogLevel, limit: number = 50): LogEntry[] {
    let filtered = this.logs;
    
    if (level) {
      filtered = this.logs.filter(log => log.level === level);
    }
    
    return filtered.slice(-limit);
  }

  /**
   * Exporte les logs pour debugging
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Vide les logs
   */
  clearLogs(): void {
    this.logs = [];
  }
}

export default LoggerService;

