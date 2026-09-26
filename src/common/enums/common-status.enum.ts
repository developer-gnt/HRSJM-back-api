export const CommonStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export type CommonStatus = (typeof CommonStatus)[keyof typeof CommonStatus];
