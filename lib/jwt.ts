export const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

export function generateToken(payload: object, expiresIn: string = '7d'): string {
  const jwt = require('jsonwebtoken');
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string): any {
  const jwt = require('jsonwebtoken');
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}
