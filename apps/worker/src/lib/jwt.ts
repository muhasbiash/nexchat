import { SignJWT, jwtVerify } from 'jose';

export interface TokenPayload {
  sub: string;
  email: string;
}

function getSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function createToken(userId: string, email: string, secret: string): Promise<string> {
  return new SignJWT({
    email,
  })
    .setProtectedHeader({
      alg: 'HS256',
      typ: 'JWT',
    })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret(secret));
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload> {
  console.log('[JWT] verifyToken: start');

  const secretKey = getSecret(secret);

  console.log('[JWT] secret length:', secretKey.length);

  console.log('[JWT] calling jwtVerify');

  const { payload } = await jwtVerify(token, secretKey);

  console.log('[JWT] jwtVerify completed');

  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new Error('Invalid token payload');
  }

  console.log('[JWT] payload valid:', payload.sub);

  return {
    sub: payload.sub,
    email: payload.email,
  };
}
