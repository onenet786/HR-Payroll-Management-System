/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, deleteUser, getAuth, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missingFirebaseConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => !value?.trim() || /replace_with|replace-with/i.test(value))
  .map(([name]) => name);
if (missingFirebaseConfig.length || !import.meta.env.VITE_FIRESTORE_DATABASE_ID?.trim()) {
  throw new Error('Application configuration is incomplete. Contact the deployment administrator.');
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
// Connect to the specific firestore database provisioned for this applet
export const db = getFirestore(app, import.meta.env.VITE_FIRESTORE_DATABASE_ID);

export async function provisionFirebaseUser<T>(
  email: string,
  password: string,
  createProfile: (uid: string) => Promise<T>,
): Promise<T> {
  const provisioningApp = initializeApp(
    firebaseConfig,
    `user-provisioning-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const provisioningAuth = getAuth(provisioningApp);
  let createdUser: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>['user'] | null = null;

  try {
    const credential = await createUserWithEmailAndPassword(
      provisioningAuth,
      email.trim().toLowerCase(),
      password,
    );
    createdUser = credential.user;
    return await createProfile(createdUser.uid);
  } catch (error) {
    if (createdUser) await deleteUser(createdUser).catch(() => undefined);
    throw error;
  } finally {
    await signOut(provisioningAuth).catch(() => undefined);
    await deleteApp(provisioningApp).catch(() => undefined);
  }
}

export function isFirebaseConfigured(): boolean {
  return !!firebaseConfig.apiKey;
}
