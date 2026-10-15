/** The baseline business roles (seeded in migrations). */
export const BASELINE_ROLES = [
  { name: 'USER', description: 'General user / public portal access' },
  { name: 'MEMBER', description: 'Applies for and manages HRSJM membership' },
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
export const PUBLIC_REGISTER_ROLE_NAMES: string[] = [
  'USER',
  'MEMBER',
  'DONATION_SEEKER',
];
