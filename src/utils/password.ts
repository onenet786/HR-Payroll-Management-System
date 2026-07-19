import { compare, hash } from 'bcryptjs';

const BCRYPT_COST = 12;

export const createPasswordCredential = async (password: string) => {
  if (password.length < 12) throw new Error('Password must be at least 12 characters.');
  return { passwordHash: await hash(password, BCRYPT_COST) };
};

export const verifyPassword = async (password: string, expectedHash: string) =>
  expectedHash.startsWith('$2') && compare(password, expectedHash);
