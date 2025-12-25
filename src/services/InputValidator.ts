/**
 * Service de validation et sanitization des entrées utilisateur
 */

export interface ValidationResult {
  valid: boolean;
  sanitized?: string;
  error?: string;
  errors?: string[];
}

class InputValidator {
  private static readonly MAX_MESSAGE_LENGTH = 1000;
  private static readonly MIN_MESSAGE_LENGTH = 1;
  
  /**
   * Valide et sanitise un message utilisateur
   */
  static validateMessage(message: unknown): ValidationResult {
    // Vérifier que c'est une string
    if (typeof message !== 'string') {
      return {
        valid: false,
        error: 'Le message doit être une chaîne de caractères'
      };
    }

    // Vérifier que ce n'est pas null ou undefined
    if (message === null || message === undefined) {
      return {
        valid: false,
        error: 'Le message ne peut pas être vide'
      };
    }

    // Trim et vérifier la longueur minimale
    const trimmed = message.trim();
    if (trimmed.length < InputValidator.MIN_MESSAGE_LENGTH) {
      return {
        valid: false,
        error: 'Le message ne peut pas être vide'
      };
    }

    // Vérifier la longueur maximale
    if (trimmed.length > InputValidator.MAX_MESSAGE_LENGTH) {
      return {
        valid: false,
        error: `Le message est trop long (maximum ${InputValidator.MAX_MESSAGE_LENGTH} caractères)`
      };
    }

    // Sanitization basique (enlever les caractères de contrôle)
    const sanitized = trimmed
      .replace(/[\x00-\x1F\x7F]/g, '') // Enlever caractères de contrôle
      .slice(0, InputValidator.MAX_MESSAGE_LENGTH); // Limiter la longueur

    return {
      valid: true,
      sanitized
    };
  }

  /**
   * Valide un sessionId
   */
  static validateSessionId(sessionId: unknown): ValidationResult {
    if (typeof sessionId !== 'string') {
      return {
        valid: false,
        error: 'Le sessionId doit être une chaîne de caractères'
      };
    }

    // Vérifier le format (alphanumeric, tirets, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      return {
        valid: false,
        error: 'Format de sessionId invalide'
      };
    }

    // Limiter la longueur
    if (sessionId.length > 100) {
      return {
        valid: false,
        error: 'Le sessionId est trop long (maximum 100 caractères)'
      };
    }

    return {
      valid: true,
      sanitized: sessionId
    };
  }

  /**
   * Valide un nombre (pour volumes, strikes, etc.)
   */
  static validateNumber(value: unknown, min?: number, max?: number): ValidationResult {
    if (typeof value !== 'number' && typeof value !== 'string') {
      return {
        valid: false,
        error: 'La valeur doit être un nombre'
      };
    }

    const num = typeof value === 'string' ? parseFloat(value) : value;

    if (isNaN(num) || !isFinite(num)) {
      return {
        valid: false,
        error: 'La valeur doit être un nombre valide'
      };
    }

    if (min !== undefined && num < min) {
      return {
        valid: false,
        error: `La valeur doit être supérieure ou égale à ${min}`
      };
    }

    if (max !== undefined && num > max) {
      return {
        valid: false,
        error: `La valeur doit être inférieure ou égale à ${max}`
      };
    }

    return {
      valid: true,
      sanitized: String(num)
    };
  }

  /**
   * Valide une paire de devises
   */
  static validateCurrencyPair(pair: unknown): ValidationResult {
    if (typeof pair !== 'string') {
      return {
        valid: false,
        error: 'La paire de devises doit être une chaîne de caractères'
      };
    }

    // Format: XXX/YYY ou XXX-YYY
    const pattern = /^[A-Z]{3}\/[A-Z]{3}$/i;
    if (!pattern.test(pair)) {
      return {
        valid: false,
        error: 'Format de paire de devises invalide (attendu: EUR/USD)'
      };
    }

    return {
      valid: true,
      sanitized: pair.toUpperCase()
    };
  }
}

export default InputValidator;

