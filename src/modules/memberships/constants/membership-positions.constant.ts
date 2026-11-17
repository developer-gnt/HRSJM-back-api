export interface MembershipPositionItem {
  id: number;
  name: string;
  note?: string;
}

export const MEMBERSHIP_POSITIONS_DATA: readonly MembershipPositionItem[] = [
  { id: 1, name: 'President' },
  { id: 2, name: 'Executive President' },
  { id: 3, name: 'Deputy Executive President' },
  { id: 4, name: 'Vice President' },
  { id: 5, name: 'Deputy Vice President' },
  { id: 6, name: 'Chief Secretary' },
  { id: 7, name: 'Deputy Chief Secretary' },
  { id: 8, name: 'Joint Secretary' },
  { id: 9, name: 'Chief Observer' },
  { id: 10, name: 'Deputy Chief Observer' },
  { id: 11, name: 'Chief Reporting Officer' },
  { id: 12, name: 'Deputy Reporting Officer' },
  { id: 13, name: 'Chief Coordinator' },
  { id: 14, name: 'Deputy Chief Coordinator' },
  {
    id: 15,
    name: 'Minority Welfare Secretary',
    note: 'Reserved for a minority-community representative',
  },
  {
    id: 16,
    name: 'Women Empowerment Secretary',
    note: 'Reserved for a female candidate',
  },
  { id: 17, name: 'Social Welfare Secretary' },
  { id: 18, name: 'Consumer Welfare Secretary' },
  { id: 19, name: 'Human Welfare Secretary' },
  { id: 20, name: 'Administrative Secretary' },
  { id: 21, name: 'Deputy Administrative Secretary' },
  { id: 22, name: 'Information Secretary' },
  { id: 23, name: 'Organising Secretary' },
  {
    id: 24,
    name: 'Legal Advisor',
    note: 'Reserved for a qualified Advocate',
  },
  { id: 25, name: 'Deputy Legal Advisor' },
] as const;

export const MEMBERSHIP_POSITIONS: readonly string[] = MEMBERSHIP_POSITIONS_DATA.map(
  (item) => item.name,
);

export function isValidMembershipPosition(position?: string | null): boolean {
  if (!position || typeof position !== 'string') return false;
  const trimmed = position.trim();
  return MEMBERSHIP_POSITIONS.some(
    (p) => p.toLowerCase() === trimmed.toLowerCase(),
  );
}

export function normalizeMembershipPosition(
  position?: string | null,
): string | null {
  if (!position || typeof position !== 'string') return null;
  const trimmed = position.trim();
  const matched = MEMBERSHIP_POSITIONS.find(
    (p) => p.toLowerCase() === trimmed.toLowerCase(),
  );
  return matched || null;
}
