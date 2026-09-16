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
    orderBy,
    runTransaction,
    writeBatch,
    serverTimestamp,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "../../firebase-config.js";
import { calculatePremiumUntil } from "../utils/access.js";
import { calculateNextBillingDate } from "../utils/helpers.js";

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
    const batch = writeBatch(db);
    const archiveRef = doc(collection(db, 'canceled_subs'));
    const activeRef = doc(db, COLLECTION_NAME, docId);

    batch.set(archiveRef, {
        ...subData,
        userId: userId,
        canceledAt: new Date().toISOString(),
        originalDocId: docId
    });
    batch.delete(activeRef);

    await batch.commit();
    return archiveRef;
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
export async function createUserAccountDocument(userId, email, displayName = '') {
    const docRef = doc(db, 'users', userId);
    const normalizedDisplayName = typeof displayName === 'string' ? displayName.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim() : '';
    return await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(docRef);
        if (!snapshot.exists()) {
            const accountData = {
                role: 'user',
                plan: 'free',
                email: normalizedEmail || null,
                createdAt: serverTimestamp()
            };
            if (normalizedDisplayName) accountData.displayName = normalizedDisplayName;
            transaction.set(docRef, accountData);
            return true;
        }

        // Auth initialization and registration can race; never reset an existing account's createdAt/role/plan.
        const existing = snapshot.data();
        const updates = {};
        if (!String(existing.email || '').trim() && normalizedEmail) updates.email = normalizedEmail;
        if (!String(existing.displayName || '').trim() && !String(existing.name || '').trim() && normalizedDisplayName) {
            updates.displayName = normalizedDisplayName;
        }
        if (Object.keys(updates).length) transaction.update(docRef, updates);
        return false;
    });
}

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

export async function syncAuthenticatedUserEmailIfMissing() {
    const authenticatedUser = auth.currentUser;
    const normalizedEmail = typeof authenticatedUser?.email === 'string'
        ? authenticatedUser.email.trim()
        : '';
    if (!authenticatedUser || !normalizedEmail) return false;

    const docRef = doc(db, 'users', authenticatedUser.uid);
    return await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(docRef);
        if (!docSnap.exists()) return false;

        const storedEmail = docSnap.data().email;
        const isMissingOrEmpty = storedEmail == null
            || (typeof storedEmail === 'string' && storedEmail.trim() === '');
        if (!isMissingOrEmpty) return false;

        transaction.update(docRef, { email: normalizedEmail });
        return true;
    });
}

export async function syncAuthenticatedUserDisplayNameIfMissing() {
    const authenticatedUser = auth.currentUser;
    const displayName = typeof authenticatedUser?.displayName === 'string'
        ? authenticatedUser.displayName.trim()
        : '';
    if (!authenticatedUser || !displayName) return false;

    const docRef = doc(db, 'users', authenticatedUser.uid);
    return await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(docRef);
        if (!docSnap.exists()) return false;
        const storedName = docSnap.data().displayName;
        if ((typeof storedName === 'string' && storedName.trim())
            || (typeof docSnap.data().name === 'string' && docSnap.data().name.trim())) return false;
        transaction.update(docRef, { displayName });
        return true;
    });
}

// Payment History
export async function recordSubscriptionPayment(userId, subscriptionId, expectedBillingDate) {
    const subscriptionRef = doc(db, COLLECTION_NAME, subscriptionId);
    const paymentRef = doc(collection(db, 'payment_history'));
    const expectedDate = String(expectedBillingDate || '');

    return await runTransaction(db, async (transaction) => {
        const subscriptionSnapshot = await transaction.get(subscriptionRef);
        if (!subscriptionSnapshot.exists()) throw new Error('Subscription not found');

        const subscription = subscriptionSnapshot.data();
        if (subscription.userId !== userId) throw new Error('Subscription owner mismatch');
        if (String(subscription.date || '') !== expectedDate) throw new Error('Subscription billing date changed');

        const currentDueDate = calculateNextBillingDate(subscription.date, subscription.cycle);
        if (!currentDueDate) throw new Error('Subscription billing date is invalid');

        const afterCurrentDueDate = new Date(currentDueDate);
        afterCurrentDueDate.setDate(afterCurrentDueDate.getDate() + 1);
        const followingDueDate = calculateNextBillingDate(subscription.date, subscription.cycle, afterCurrentDueDate);
        if (!followingDueDate) throw new Error('Next subscription billing date is invalid');

        const timezoneOffset = followingDueDate.getTimezoneOffset() * 60000;
        const nextDate = new Date(followingDueDate.getTime() - timezoneOffset).toISOString().split('T')[0];

        transaction.update(subscriptionRef, { date: nextDate });
        transaction.set(paymentRef, {
            userId,
            subId: subscriptionId,
            name: subscription.name,
            price: subscription.price,
            currency: subscription.currency || 'THB',
            paidAt: new Date().toISOString()
        });

        return { nextDate, paymentId: paymentRef.id };
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

// Admin Functions
export async function getAllUsers() {
    const { getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const querySnapshot = await getDocs(collection(db, 'users'));
    const users = [];
    querySnapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() });
    });
    return users;
}

export async function getAllSubscriptionsForSupport() {
    const { getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const subscriptions = [];
    querySnapshot.forEach((subscriptionDoc) => {
        subscriptions.push({ id: subscriptionDoc.id, ...subscriptionDoc.data() });
    });
    return subscriptions;
}

export async function getAdminAuditLogs() {
    const { getDocs, limit } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const auditQuery = query(collection(db, 'admin_audit_logs'), orderBy('createdAt', 'desc'), limit(50));
    const querySnapshot = await getDocs(auditQuery);
    const logs = [];
    querySnapshot.forEach((auditDoc) => logs.push({ id: auditDoc.id, ...auditDoc.data() }));
    return logs.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
    });
}

export async function updateUserRole(userId, newRole, legacyPremium = false) {
    const docRef = doc(db, 'users', userId);
    const update = { role: newRole };
    if (legacyPremium) update.plan = 'premium';
    return await updateDoc(docRef, update);
}

export async function migrateLegacyPremiumUser(userId) {
    const docRef = doc(db, 'users', userId);
    return await updateDoc(docRef, {
        role: 'user',
        plan: 'premium',
        premiumPlan: 'lifetime',
        premiumUntil: null
    });
}

// Premium Purchase Simulation
const PREMIUM_PRICES = Object.freeze({ monthly: 29, yearly: 199, lifetime: 299 });

export async function purchasePremiumPlan(userId, premiumPlan) {
    if (!Object.hasOwn(PREMIUM_PRICES, premiumPlan)) throw new Error('Invalid Premium plan');

    const batch = writeBatch(db);
    const purchaseRef = doc(db, 'premium_purchases', userId);
    const userRef = doc(db, 'users', userId);
    const purchasedAt = serverTimestamp();
    const expiryDate = calculatePremiumUntil(premiumPlan);
    const premiumUntil = expiryDate ? Timestamp.fromDate(expiryDate) : null;

    batch.set(purchaseRef, {
        userId,
        plan: premiumPlan,
        amount: PREMIUM_PRICES[premiumPlan],
        currency: 'THB',
        status: 'approved',
        createdAt: purchasedAt,
        premiumUntil
    });

    batch.update(userRef, {
        plan: 'premium',
        premiumPlan,
        premiumSince: purchasedAt,
        premiumUntil
    });

    await batch.commit();
    return { premiumPlan, premiumUntil };
}

export async function overrideUserPremium(adminUserId, targetUserId, previousAccess, override, reason) {
    const cleanReason = String(reason || '').trim();
    if (!cleanReason) throw new Error('Override reason is required');
    if (adminUserId === targetUserId) throw new Error('Admin cannot override their own Premium access');
    if (override.plan !== 'free' && override.plan !== 'premium') throw new Error('Invalid target plan');

    let premiumPlan = null;
    let premiumUntil = null;
    if (override.plan === 'premium') {
        premiumPlan = override.premiumPlan;
        if (!['monthly', 'yearly', 'lifetime'].includes(premiumPlan)) throw new Error('Invalid Premium type');
        if (premiumPlan !== 'lifetime') {
            const expiryDate = override.premiumUntil instanceof Date ? override.premiumUntil : new Date(override.premiumUntil);
            if (Number.isNaN(expiryDate.getTime())) throw new Error('Premium expiry is required');
            premiumUntil = Timestamp.fromDate(expiryDate);
        }
    }

    const batch = writeBatch(db);
    const userRef = doc(db, 'users', targetUserId);
    const auditRef = doc(collection(db, 'admin_audit_logs'));
    const changedAt = serverTimestamp();

    batch.update(userRef, {
        plan: override.plan,
        premiumPlan,
        premiumSince: override.plan === 'premium' ? changedAt : null,
        premiumUntil,
        lastPremiumAuditId: auditRef.id
    });
    batch.set(auditRef, {
        action: 'premium_override',
        targetUserId,
        adminUserId,
        previousPlan: previousAccess.plan,
        previousPremiumPlan: previousAccess.premiumPlan,
        previousPremiumUntil: previousAccess.premiumUntil || null,
        newPlan: override.plan,
        newPremiumPlan: premiumPlan,
        newPremiumUntil: premiumUntil,
        reason: cleanReason,
        createdAt: changedAt
    });

    await batch.commit();
    return auditRef.id;
}
