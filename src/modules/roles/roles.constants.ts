/** The four baseline business roles (seeded in the Phase 1 migration). */
export const BASELINE_ROLES = [
  { name: 'MEMBER', description: 'Applies for and manages HRSJM membership' },
  { name: 'DONOR', description: 'Makes donations' },
  {
    name: 'DONATION_SEEKER',
    description: 'Submits and tracks assistance requests',
  },
  { name: 'ADMIN', description: 'HRSJM administrator' },
] as const;

/** Baseline roles are protected from rename and delete. */
export const PROTECTED_ROLE_NAMES: string[] = BASELINE_ROLES.map((r) => r.name);

/**
 * Roles a public (unauthenticated) registrant may self-select. ADMIN is
 * deliberately excluded — admin accounts are provisioned manually.
 */
export const PUBLIC_REGISTER_ROLE_NAMES: string[] = ['MEMBER', 'DONOR', 'DONATION_SEEKER'];
