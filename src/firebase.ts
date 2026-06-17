/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Explicitly use configuration matching the provisioned Firebase environment
const firebaseConfig = {
  apiKey: "AIzaSyAA7uvWdIsP9CqFGJEk5SB0FvLFF97DNk4",
  authDomain: "gen-lang-client-0314098400.firebaseapp.com",
  projectId: "gen-lang-client-0314098400",
  storageBucket: "gen-lang-client-0314098400.firebasestorage.app",
  messagingSenderId: "279125201448",
  appId: "1:279125201448:web:60c148c137e9fd60a2db1d"
};

const app = initializeApp(firebaseConfig);

// Connect to the specific firestore database provisioned for this applet
export const db = getFirestore(app, "ai-studio-0ab7c3a1-e4ca-49b5-86f4-6883897b9163");

export function isFirebaseConfigured(): boolean {
  return !!firebaseConfig.apiKey;
}
