import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// TODO: Replace with your actual Firebase config object
const firebaseConfig = {
  apiKey: "AIzaSyBE-JSG1nLqRuaQK7Yz-e5jcXeBzs8wdoY",
  authDomain: "sub-web-by-babybomb.firebaseapp.com",
  projectId: "sub-web-by-babybomb",
  storageBucket: "sub-web-by-babybomb.firebasestorage.app",
  messagingSenderId: "592120481082",
  appId: "1:592120481082:web:88ae19526b6f86baed3c03"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export { app, auth, db, provider };
