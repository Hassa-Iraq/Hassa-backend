import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult, ValidationChain } from 'express-validator';
import { ValidationError } from '../error-handler/index';

/**
 * Validates request using express-validator results
 */
export function validateRequest(req: Request, _res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.type === 'field' ? err.path : (err as any).param,
      message: err.msg,
      value: (err as any).value,
    }));

    throw new ValidationError('Validation failed', errorMessages);
  }

  next();
}

/**
 * Common validation rules
 */
export const commonValidators = {
  uuid: (field: string = 'id'): ValidationChain => 
    param(field).isUUID().withMessage(`${field} must be a valid UUID`),
  
  email: (field: string = 'email'): ValidationChain => 
    body(field)
      .isEmail()
      .normalizeEmail()
      .withMessage(`${field} must be a valid email address`),
  
  password: (field: string = 'password', minLength: number = 8): ValidationChain => 
    body(field)
      .isLength({ min: minLength })
      .withMessage(`${field} must be at least ${minLength} characters`)
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage(`${field} must contain at least one uppercase letter, one lowercase letter, and one number`),
  
  requiredString: (field: string, minLength: number = 1, maxLength: number = 255): ValidationChain => 
    body(field)
      .trim()
      .notEmpty()
      .withMessage(`${field} is required`)
      .isLength({ min: minLength, max: maxLength })
      .withMessage(`${field} must be between ${minLength} and ${maxLength} characters`),
  
  optionalString: (field: string, maxLength: number = 255): ValidationChain => 
    body(field)
      .optional()
      .trim()
      .isLength({ max: maxLength })
      .withMessage(`${field} must not exceed ${maxLength} characters`),
  
  positiveInteger: (field: string): ValidationChain => 
    body(field)
      .optional()
      .isInt({ min: 1 })
      .withMessage(`${field} must be a positive integer`),
  
  decimal: (field: string, min: number = 0): ValidationChain => 
    body(field)
      .optional()
      .isFloat({ min })
      .withMessage(`${field} must be a valid decimal number`),
  
  boolean: (field: string): ValidationChain => 
    body(field)
      .optional()
      .isBoolean()
      .withMessage(`${field} must be a boolean`),
  
  date: (field: string): ValidationChain => 
    body(field)
      .optional()
      .isISO8601()
      .withMessage(`${field} must be a valid ISO 8601 date`),
  
  enum: (field: string, values: string[]): ValidationChain => 
    body(field)
      .optional()
      .isIn(values)
      .withMessage(`${field} must be one of: ${values.join(', ')}`),
};

// Re-export express-validator utilities for convenience
export { body, param, query, validationResult };
