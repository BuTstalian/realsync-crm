// Centralized error handling for Calibration Services CRM

import { PostgrestError } from '@supabase/supabase-js';
import { toast } from 'sonner';

// Error types
export interface AppError {
  code: string;
  message: string;
  details?: string;
  hint?: string;
}

// Convert Supabase errors to AppError
export function fromSupabaseError(error: PostgrestError | null): AppError | null {
  if (!error) return null;
  
  return {
    code: error.code || 'UNKNOWN',
    message: getErrorMessage(error),
    details: error.details || undefined,
    hint: error.hint || undefined,
  };
}

// Get user-friendly error message
function getErrorMessage(error: PostgrestError): string {
  // Map common error codes to friendly messages
  const errorMap: Record<string, string> = {
    // Auth errors
    'PGRST301': 'You must be logged in to perform this action.',
    'PGRST302': 'Your session has expired. Please log in again.',
    
    // Permission errors
    'P0001': 'You do not have permission to perform this action.',
    '42501': 'Access denied. Insufficient permissions.',
    
    // Validation errors
    '23505': 'This record already exists.',
    '23503': 'Cannot delete - this record is referenced by other data.',
    '23502': 'Required field is missing.',
    '23514': 'Invalid data format.',
    
    // Connection errors
    'PGRST000': 'Unable to connect to the server. Please try again.',
    'PGRST503': 'Service temporarily unavailable. Please try again.',
    
    // Rate limiting
    '429': 'Too many requests. Please wait a moment.',
  };

  return errorMap[error.code] || error.message || 'An unexpected error occurred.';
}

// Handle error with toast notification
export function handleError(
  error: PostgrestError | Error | null,
  context?: string
): void {
  if (!error) return;

  const message = 'code' in (error as any)
    ? getErrorMessage(error as PostgrestError)
    : error.message;

  const fullMessage = context ? `${context}: ${message}` : message;
  
  console.error('[Error]', context, error);
  toast.error(fullMessage);
}

// Handle success with toast notification
export function handleSuccess(message: string): void {
  toast.success(message);
}

// Async wrapper with error handling
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  options?: {
    context?: string;
    successMessage?: string;
    showError?: boolean;
  }
): Promise<T | null> {
  const { context, successMessage, showError = true } = options || {};
  
  try {
    const result = await fn();
    if (successMessage) {
      handleSuccess(successMessage);
    }
    return result;
  } catch (error) {
    if (showError) {
      handleError(error as Error, context);
    }
    return null;
  }
}

// Type guard for Supabase response
export function isSupabaseError(
  response: { data: any; error: PostgrestError | null }
): response is { data: null; error: PostgrestError } {
  return response.error !== null;
}

// Utility for handling Supabase responses
export function handleSupabaseResponse<T>(
  response: { data: T | null; error: PostgrestError | null },
  context?: string
): T | null {
  if (response.error) {
    handleError(response.error, context);
    return null;
  }
  return response.data;
}

// Validation errors
export class ValidationError extends Error {
  field: string;
  
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
    this.name = 'ValidationError';
  }
}

// Validate required fields
export function validateRequired(
  data: Record<string, any>,
  requiredFields: string[]
): ValidationError | null {
  for (const field of requiredFields) {
    if (!data[field] || (typeof data[field] === 'string' && !data[field].trim())) {
      return new ValidationError(field, `${field} is required`);
    }
  }
  return null;
}

// Format validation errors for forms
export function formatValidationErrors(
  errors: ValidationError[]
): Record<string, string> {
  return errors.reduce((acc, error) => {
    acc[error.field] = error.message;
    return acc;
  }, {} as Record<string, string>);
}
