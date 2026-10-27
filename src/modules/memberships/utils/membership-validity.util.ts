/**
 * Resolves the validity duration in days, years, and label based on
 * the official HRSJM membership plan / category specification:
 *
 * District Active Member: 1 Year (365 days)
 * State Active Member: 1 Year (365 days)
 * District Unit Post: 1 Year (365 days)
 * State Unit Post: 2 Years (730 days)
 * Lion of State: 5 Years (1825 days)
 * Counselor of State: 5 Years (1825 days)
 * Ambassador of State: 5 Years (1825 days)
 * Hon'ble State Director: 10 Years (3650 days)
 * National Legal Council Cell: 10 Years (3650 days)
 * National Minority Council Cell: 10 Years (3650 days)
 * National Women Council Cell: 10 Years (3650 days)
 * National Political Council Cell: 10 Years (3650 days)
 */
export interface MembershipValidityResolution {
  validityDays: number;
  durationYears: number;
  durationLabel: string;
}

export function resolveMembershipValidityDays(
  categoryName?: string | null,
  postName?: string | null,
  validityString?: string | null,
  fallbackDays = 365,
): MembershipValidityResolution {
  const combined = `${categoryName || ''} ${postName || ''} ${validityString || ''}`.toLowerCase();

  // 1. Direct validity string inspection (e.g., "5 Years", "2 Years", "1 Year")
  if (validityString) {
    const match = validityString.match(/(\d+)\s*year/i);
    if (match) {
      const yrs = parseInt(match[1], 10);
      return {
        validityDays: yrs * 365,
        durationYears: yrs,
        durationLabel: `${yrs} Year${yrs > 1 ? 's' : ''}`,
      };
    }
  }

  // 2. 10 Years Posts: State Director & National Council Cells
  if (
    combined.includes('10 year') ||
    combined.includes('director') ||
    combined.includes('legal council') ||
    combined.includes('minority council') ||
    combined.includes('women council') ||
    combined.includes('political council') ||
    combined.includes('national council') ||
    combined.includes('national_council') ||
    combined.includes('state_director')
  ) {
    return {
      validityDays: 3650,
      durationYears: 10,
      durationLabel: '10 Years',
    };
  }

  // 3. 5 Years Posts: Lion of State, Counselor of State, Ambassador of State
  if (
    combined.includes('5 year') ||
    combined.includes('lion') ||
    combined.includes('counselor') ||
    combined.includes('ambassador') ||
    combined.includes('lion_counselor_ambassador')
  ) {
    return {
      validityDays: 1825,
      durationYears: 5,
      durationLabel: '5 Years',
    };
  }

  // 4. 2 Years Posts: State Unit Post
  if (
    combined.includes('2 year') ||
    combined.includes('state unit') ||
    combined.includes('state_unit')
  ) {
    return {
      validityDays: 730,
      durationYears: 2,
      durationLabel: '2 Years',
    };
  }

  // 5. 1 Year Posts: District Active Member, State Active Member, District Unit Post
  if (
    combined.includes('1 year') ||
    combined.includes('district') ||
    combined.includes('active member') ||
    combined.includes('district_unit')
  ) {
    return {
      validityDays: 365,
      durationYears: 1,
      durationLabel: '1 Year',
    };
  }

  // 6. Fallback based on fallbackDays
  const derivedYears = Math.max(1, Math.round(fallbackDays / 365));
  return {
    validityDays: fallbackDays,
    durationYears: derivedYears,
    durationLabel: `${derivedYears} Year${derivedYears > 1 ? 's' : ''}`,
  };
}
