/**
 * js/services/auth.js
 * Handles Firebase Authentication
 */
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged,
    updateProfile 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, provider } from "../../firebase-config.js";

export function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
}

export async function register(name, email, password) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    // Update profile with name
    await updateProfile(userCredential.user, {
        displayName: name
    });
    return userCredential;
}

export function loginWithGoogle() {
    return signInWithPopup(auth, provider);
}

export function logout() {
    return signOut(auth);
}

// Callback is triggered whenever auth state changes (login/logout)
export function initAuthListener(callback) {
    onAuthStateChanged(auth, (user) => {
        callback(user);
    });
}

export async function updateUserProfile(user, data) {
    return await updateProfile(user, data);
}
