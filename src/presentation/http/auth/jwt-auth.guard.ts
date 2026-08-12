import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  role: 'pet-owner' | 'provider' | 'administrator';
  providerId?: string;
}

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de acceso requerido');
    }
    try {
      request.user = await this.jwt.verifyAsync<AuthenticatedUser>(
        authorization.slice('Bearer '.length).trim(),
      );
      return true;
    } catch {
      throw new UnauthorizedException('Token de acceso inválido o expirado');
    }
  }
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
  };
}
