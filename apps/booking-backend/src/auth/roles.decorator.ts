import { SetMetadata } from '@nestjs/common';
import type { UserRole } from './auth.types';

export const ROLES_KEY = 'roles';

export const roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
