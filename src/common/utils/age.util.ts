/**
 * Backend Age and Date of Birth validation utility for HRSJM platform.
 * Enforces 18+ minimum age requirement across General Users, Members, and Donation Seekers.
 */

export interface AgeValidationResult {
  isValid: boolean;
  isEligible: boolean;
  age: number | null;
  error: string | null;
  errorCode?: 'DOB_REQUIRED' | 'INVALID_DOB' | 'FUTURE_DOB' | 'AGE_NOT_ELIGIBLE';
}

/**
 * Parses dates formatted as DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, or ISO strings.
 * Accurately validates days per month (including leap year Feb 29).
 */
export function parseDateOfBirth(dob: string | Date | null | undefined): Date | null {
  if (!dob) return null;
  if (dob instanceof Date) {
    return isNaN(dob.getTime()) ? null : dob;
  }
  const str = String(dob).trim();
  if (!str) return null;

  // 1. DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(str);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    return date;
  }

  // 2. YYYY-MM-DD or YYYY/MM/DD or ISO string
  const ymdMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(str);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    return date;
  }

  const parsed = new Date(str);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * Validates whether the user satisfies the 18+ minimum age eligibility requirement.
 * Correctly accounts for leap years, birth month/day comparisons, and future dates.
 */
export function validateAgeEligibility(
  dob: string | Date | null | undefined,
  minimumAge = 18,
  referenceDate = new Date(),
): AgeValidationResult {
  if (!dob || (typeof dob === 'string' && !dob.trim())) {
    return {
      isValid: false,
      isEligible: false,
      age: null,
      error: 'Date of birth is required for registration.',
      errorCode: 'DOB_REQUIRED',
    };
  }

  const birthDate = parseDateOfBirth(dob);
  if (!birthDate) {
    return {
      isValid: false,
      isEligible: false,
      age: null,
      error: 'Please enter a valid date of birth.',
      errorCode: 'INVALID_DOB',
    };
  }

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();
  const refDay = referenceDate.getDate();
  const todayAtMidnight = new Date(refYear, refMonth, refDay);

  const bYear = birthDate.getFullYear();
  const bMonth = birthDate.getMonth();
  const bDay = birthDate.getDate();
  const birthAtMidnight = new Date(bYear, bMonth, bDay);

  if (birthAtMidnight > todayAtMidnight) {
    return {
      isValid: false,
      isEligible: false,
      age: null,
      error: 'Date of birth cannot be in the future.',
      errorCode: 'FUTURE_DOB',
    };
  }

  let age = refYear - bYear;
  const monthDiff = refMonth - bMonth;
  if (monthDiff < 0 || (monthDiff === 0 && refDay < bDay)) {
    age--;
  }

  if (age < minimumAge) {
    return {
      isValid: true,
      isEligible: false,
      age,
      error: 'You must be at least 18 years old to register.',
      errorCode: 'AGE_NOT_ELIGIBLE',
    };
  }

  return {
    isValid: true,
    isEligible: true,
    age,
    error: null,
  };
}

