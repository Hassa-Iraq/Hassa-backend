/**
 * Phone number normalization and validation utilities
 */

/**
 * Normalize phone number to E.164 format
 * E.164 format: +[country code][number] (e.g., +1234567890)
 */
export function normalizePhone(countryCode: string, phone: string): string {
  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, '');
  
  // Remove leading zeros
  const cleanedPhone = digitsOnly.replace(/^0+/, '');
  
  // Combine country code and phone number
  const countryCodeDigits = countryCode.replace(/\D/g, '');
  
  // Ensure country code starts with +
  const normalizedCountryCode = countryCodeDigits.startsWith('+') 
    ? countryCodeDigits 
    : `+${countryCodeDigits}`;
  
  // Combine and ensure single + prefix
  const fullNumber = `${normalizedCountryCode}${cleanedPhone}`;
  
  // Remove duplicate + signs
  return fullNumber.replace(/\+{2,}/g, '+');
}

/**
 * Validate phone number format (basic E.164 check)
 * E.164: starts with +, followed by 1-15 digits
 */
export function validatePhoneFormat(phone: string): boolean {
  // E.164 format: + followed by 1-15 digits
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phone);
}

/**
 * Format phone number to E.164 (if not already)
 * Attempts to convert various formats to E.164
 */
export function formatE164(phone: string): string {
  // Remove all whitespace and special characters except +
  let cleaned = phone.replace(/[\s\-()]/g, '');
  
  // If doesn't start with +, try to add it
  if (!cleaned.startsWith('+')) {
    // If starts with 00 (international format), replace with +
    if (cleaned.startsWith('00')) {
      cleaned = '+' + cleaned.substring(2);
    } else {
      // Assume it needs a + prefix (but this is risky without country code)
      cleaned = '+' + cleaned;
    }
  }
  
  // Remove duplicate + signs
  cleaned = cleaned.replace(/\+{2,}/g, '+');
  
  return cleaned;
}

/**
 * Combine country code and phone number into E.164 format
 * This is the recommended way for mobile apps that send country code separately
 */
export function combineCountryCodeAndPhone(countryCode: string, phone: string): string {
  return normalizePhone(countryCode, phone);
}

export default {
  normalizePhone,
  validatePhoneFormat,
  formatE164,
  combineCountryCodeAndPhone,
};
