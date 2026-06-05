import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorizeRoles: (
      roles: Array<'USER' | 'ADMIN' | 'SUPER_ADMIN'>,
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function jwtPluginFn(fastify: FastifyInstance) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET must be set');

  await fastify.register(fastifyJwt, {
    secret,
    sign: { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' },
  });

  fastify.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  fastify.decorate(
    'authorizeRoles',
    (roles: Array<'USER' | 'ADMIN' | 'SUPER_ADMIN'>) =>
      async (req: FastifyRequest, reply: FastifyReply) => {
        try {
          await req.jwtVerify();
        } catch {
          reply.code(401).send({ error: 'Unauthorized' });
          return;
        }
        if (!roles.includes(req.user.role)) {
          reply.code(403).send({ error: 'Forbidden' });
        }
      },
  );
}

export const jwtPlugin = fp(jwtPluginFn, { name: 'jwt' });
