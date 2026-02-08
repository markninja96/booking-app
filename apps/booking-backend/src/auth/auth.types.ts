export const USER_ROLES = ['admin', 'provider', 'customer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type AuthUser = {
  userId: string;
  roles: UserRole[];
  activeRole: UserRole | null;
  actorUserId: string | null;
  subjectUserId: string | null;
};

export type JwtPayload = {
  sub: string;
  roles: UserRole[];
  activeRole: UserRole | null;
  actorUserId: string | null;
  subjectUserId: string | null;
};
