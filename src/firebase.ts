/**
 * Local PostgreSQL Engine DB Stub.
 * Firebase cloud services are completely disconnected in favor of the local PostgreSQL system.
 */

export const db = {} as unknown;
export const auth = {} as unknown;

export function isFirebaseConfigured(): boolean {
  return false;
}
