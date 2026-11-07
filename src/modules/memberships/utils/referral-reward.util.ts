/**
 * Free Renewal Referral Rules and Tier Mapping for HRSJM
 *
 * Rules:
 * 1 person in District Unit (10th)                            -> 1 Year Free Renewal
 * 1 person in State Unit (10th)                               -> 2 Years Free Renewal
 * 1 person in Lion, Counselor or Ambassador of State (12th)    -> 3 Years Free Renewal
 * 1 person in Hon'ble State Director (Graduates)              -> 4 Years Free Renewal
 * 1 person in National Council Cell (Lawyers, Women, Minority)-> 5 Years Free Renewal
 */

export interface ReferralTierReward {
  rewardYears: number;
  qualification: string;
  tierName: string;
}

export function getReferralRewardYears(
  categoryName?: string | null,
  categoryCode?: string | null,
): ReferralTierReward {
  const normName = (categoryName || '').toLowerCase().trim();
  const normCode = (categoryCode || '').toLowerCase().trim();

  // 1. National Council Cell (Lawyers, Women or Minority) -> 5 Years
  if (
    normCode === 'national_council_cell' ||
    normCode === 'national_legal_council_cell' ||
    normCode === 'national_minority_council_cell' ||
    normCode === 'national_woman_council_cell' ||
    normCode === 'national_political_council_cell' ||
    normName.includes('national council') ||
    normName.includes('legal council') ||
    normName.includes('minority council') ||
    normName.includes('woman council') ||
    normName.includes('women council') ||
    normName.includes('political council') ||
    (normName.includes('national') && normName.includes('council'))
  ) {
    return {
      rewardYears: 5,
      qualification: 'Graduates',
      tierName: 'National Council Cell (Lawyers, Women or Minority)',
    };
  }

  // 2. Hon'ble State Director -> 4 Years
  if (
    normCode === 'state_director' ||
    normName.includes('state director') ||
    normName.includes("hon'ble state director") ||
    normName.includes('honble state director')
  ) {
    return {
      rewardYears: 4,
      qualification: 'Graduates',
      tierName: "Hon'ble State Director",
    };
  }

  // 3. Lion, Counselor or Ambassador of State -> 3 Years
  if (
    normCode === 'lion_counselor_ambassador' ||
    normCode === 'lion_of_state' ||
    normCode === 'counsellor_of_state' ||
    normCode === 'counselor_of_state' ||
    normCode === 'ambassador_of_state' ||
    normName.includes('lion') ||
    normName.includes('counselor') ||
    normName.includes('counsellor') ||
    normName.includes('ambassador')
  ) {
    return {
      rewardYears: 3,
      qualification: '12th Pass (12 TH)',
      tierName: 'Lion, Counselor or Ambassador of State',
    };
  }

  // 4. State Unit -> 2 Years
  if (
    normCode === 'state_unit' ||
    normCode === 'state_unit_post' ||
    normCode === 'state_active_member' ||
    normName.includes('state unit')
  ) {
    return {
      rewardYears: 2,
      qualification: '10th Pass (10 TH)',
      tierName: 'State Unit',
    };
  }

  // 5. District Unit -> 1 Year
  if (
    normCode === 'district_unit' ||
    normCode === 'district_unit_post' ||
    normCode === 'district_active_member' ||
    normName.includes('district unit') ||
    normName.includes('district')
  ) {
    return {
      rewardYears: 1,
      qualification: '10th Pass (10 TH)',
      tierName: 'District Unit',
    };
  }

  // Default fallback for any other valid category
  return {
    rewardYears: 1,
    qualification: 'Eligible Applicant',
    tierName: categoryName || 'Standard Membership',
  };
}

/**
 * Returns the official list of referral reward tiers for display & API
 */
export const OFFICIAL_REFERRAL_TIERS = [
  {
    tier: 'District Unit',
    personsRequired: 1,
    qualification: '10th Pass (10 TH)',
    freeRenewalPeriod: '1 Year',
    rewardYears: 1,
    icon: 'district',
  },
  {
    tier: 'State Unit',
    personsRequired: 1,
    qualification: '10th Pass (10 TH)',
    freeRenewalPeriod: '2 Years',
    rewardYears: 2,
    icon: 'state',
  },
  {
    tier: 'Lion, Counselor or Ambassador of State',
    personsRequired: 1,
    qualification: '12th Pass (12 TH)',
    freeRenewalPeriod: '3 Years',
    rewardYears: 3,
    icon: 'lion',
  },
  {
    tier: "Hon'ble State Director",
    personsRequired: 1,
    qualification: 'Graduates',
    freeRenewalPeriod: '4 Years',
    rewardYears: 4,
    icon: 'director',
  },
  {
    tier: 'National Council Cell (Lawyers, Women or Minority)',
    personsRequired: 1,
    qualification: 'Graduates',
    freeRenewalPeriod: '5 Years',
    rewardYears: 5,
    icon: 'national',
  },
];

