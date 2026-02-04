export type AuthUser = {
  userId: string;
  roles: string[];
  activeRole: string | null;
  actorUserId: string | null;
  subjectUserId: string | null;
};

export type JwtPayload = {
  sub: string;
  roles: string[];
  activeRole: string | null;
  actorUserId: string | null;
  subjectUserId: string | null;
};
