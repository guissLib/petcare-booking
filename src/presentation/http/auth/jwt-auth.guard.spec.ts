import type { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('Booking JwtAuthGuard', () => {
  const originalSecret = process.env.API_GATEWAY_SECRET;

  beforeEach(() => {
    process.env.API_GATEWAY_SECRET = 'gateway-test-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.API_GATEWAY_SECRET;
    } else {
      process.env.API_GATEWAY_SECRET = originalSecret;
    }
  });

  it('accepts claims issued by the gateway', () => {
    const request = {
      headers: {
        'x-api-gateway-secret': 'gateway-test-secret',
        'x-gateway-user-id': 'user-1',
        'x-gateway-user-email': 'owner@example.com',
        'x-gateway-user-role': 'pet-owner',
      },
    };
    const guard = new JwtAuthGuard(reflector(false));

    expect(guard.canActivate(context(request))).toBe(true);
    expect(request).toHaveProperty('user', {
      sub: 'user-1',
      email: 'owner@example.com',
      role: 'pet-owner',
      city: undefined,
      providerId: undefined,
    });
  });

  it('rejects requests without gateway trust headers', () => {
    const guard = new JwtAuthGuard(reflector(false));

    expect(() => guard.canActivate(context({ headers: {} }))).toThrow(
      'La solicitud debe provenir del API Gateway',
    );
  });
});

function reflector(isPublic: boolean) {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as never;
}

function context(request: object) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}
