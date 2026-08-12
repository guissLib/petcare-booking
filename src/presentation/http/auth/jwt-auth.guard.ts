import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  role: 'pet-owner' | 'provider' | 'administrator';
  city?: string;
  providerId?: string;
}

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = gatewayUser(request);
    if (!user) {
      throw new UnauthorizedException(
        'La solicitud debe provenir del API Gateway',
      );
    }
    request.user = user;
    return true;
  }
}

function gatewayUser(request: Request): AuthenticatedUser | undefined {
  const expected =
    process.env.API_GATEWAY_SECRET ??
    (process.env.NODE_ENV === 'production'
      ? ''
      : 'petcare-api-gateway-local-development-secret-change-me');
  if (!expected || header(request, 'x-api-gateway-secret') !== expected) {
    return undefined;
  }

  const sub = header(request, 'x-gateway-user-id');
  const email = header(request, 'x-gateway-user-email');
  const role = header(request, 'x-gateway-user-role');
  if (
    !sub ||
    !email ||
    !role ||
    !['pet-owner', 'provider', 'administrator'].includes(role)
  ) {
    return undefined;
  }
  return {
    sub,
    email,
    role: role as AuthenticatedUser['role'],
    city: header(request, 'x-gateway-user-city'),
    providerId: header(request, 'x-gateway-user-provider-id'),
  };
}

function header(request: Request, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function actorFromRequest(request: AuthenticatedRequest) {
  const user = request.user;
  if (!user) {
    throw new UnauthorizedException('Token de acceso requerido');
  }
  return {
    id: user.sub,
    role: user.role,
    providerId: user.providerId,
    city: user.city,
  };
}
