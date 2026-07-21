/**
 * js/services/database.js
 * Handles Firestore CRUD operations
 */
import { 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    onSnapshot, 
    query, 
    where, 
    setDoc,
    getDoc,
    orderBy 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../firebase-config.js";

const COLLECTION_NAME = "subscriptions";

// Listen to subscriptions for a specific user
export function listenSubscriptions(userId, callback) {
    const q = query(
        collection(db, COLLECTION_NAME),
        where("userId", "==", userId)
    );

    // Returns an unsubscribe function
    return onSnapshot(q, (querySnapshot) => {
        const subs = [];
        querySnapshot.forEach((doc) => {
            subs.push({ id: doc.id, ...doc.data() });
        });
        callback(subs);
    }, (error) => {
        console.error("Error listening to subscriptions: ", error);
        callback([], error);
    });
}

export async function addSubscription(userId, subData) {
    return await addDoc(collection(db, COLLECTION_NAME), {
        ...subData,
        userId: userId,
        createdAt: new Date()
    });
}

export async function updateSubscription(docId, subData) {
    const docRef = doc(db, COLLECTION_NAME, docId);
    return await updateDoc(docRef, subData);
}

export async function deleteSubscription(docId) {
    const docRef = doc(db, COLLECTION_NAME, docId);
    return await deleteDoc(docRef);
}

export async function archiveSubscription(userId, subData, docId) {
    // Save to canceled_subs collection first
    await addDoc(collection(db, 'canceled_subs'), {
        ...subData,
        userId: userId,
        canceledAt: new Date().toISOString(),
        originalDocId: docId
    });
    // Then delete from active subs
    return await deleteSubscription(docId);
}

export function listenCanceledSubscriptions(userId, callback) {
    const q = query(
        collection(db, 'canceled_subs'),
        where("userId", "==", userId)
    );

    return onSnapshot(q, (querySnapshot) => {
        const subs = [];
        querySnapshot.forEach((doc) => {
            subs.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort by canceledAt descending
        subs.sort((a, b) => new Date(b.canceledAt) - new Date(a.canceledAt));
        
        callback(subs);
    }, (error) => {
        console.error("Error listening to canceled subscriptions: ", error);
        callback([], error);
    });
}

export async function hardDeleteCanceledSubscription(docId) {
    const docRef = doc(db, 'canceled_subs', docId);
    return await deleteDoc(docRef);
}

// User Settings
export async function saveUserSettings(userId, settings) {
    const docRef = doc(db, 'users', userId);
    return await setDoc(docRef, settings, { merge: true });
}

export async function getUserSettings(userId) {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.data();
    }
    return null;
}

// Payment History
export async function addPaymentHistory(userId, paymentData) {
    return await addDoc(collection(db, 'payment_history'), {
        ...paymentData,
        userId: userId,
        paidAt: new Date().toISOString()
    });
}

export function listenPaymentHistory(userId, callback) {
    const q = query(
        collection(db, 'payment_history'),
        where("userId", "==", userId)
    );

    return onSnapshot(q, (querySnapshot) => {
        const history = [];
        querySnapshot.forEach((doc) => {
            history.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort in JavaScript instead of Firebase to avoid composite index requirement
        history.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
        
        callback(history);
    }, (error) => {
        console.error("Error listening to payment history: ", error);
        callback([], error);
    });
}
