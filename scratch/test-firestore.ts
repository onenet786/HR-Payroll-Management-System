import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAA7uvWdIsP9CqFGJEk5SB0FvLFF97DNk4",
  authDomain: "gen-lang-client-0314098400.firebaseapp.com",
  projectId: "gen-lang-client-0314098400",
  storageBucket: "gen-lang-client-0314098400.firebasestorage.app",
  messagingSenderId: "279125201448",
  appId: "1:279125201448:web:60c148c137e9fd60a2db1d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, "ai-studio-0ab7c3a1-e4ca-49b5-86f4-6883897b9163");

async function runTest() {
  console.log('Attempting to connect to Firestore database: ai-studio-0ab7c3a1-e4ca-49b5-86f4-6883897b9163...');
  try {
    const querySnapshot = await getDocs(collection(db, 'employees'));
    console.log('Query successful! Count of employees:', querySnapshot.size);
    querySnapshot.forEach((doc) => {
      console.log(`${doc.id} =>`, doc.data());
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
  }
}

runTest();
