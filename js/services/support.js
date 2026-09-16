/**
 * Shared Support data access. Staff/Admin use the system-wide listeners;
 * Users use only owner-scoped queries and can read their own initial description.
 */
import {
    addDoc,
    collection,
    doc,
    getDoc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { auth, db } from '../../firebase-config.js';

export const SUPPORT_STATUSES = Object.freeze(['open', 'in_progress', 'resolved']);
export const SUPPORT_PRIORITIES = Object.freeze(['low', 'normal', 'high']);
export const SUPPORT_CATEGORIES = Object.freeze(['account', 'subscription', 'premium', 'billing', 'other']);

export function listenSupportCases(callback) {
    const supportQuery = query(collection(db, 'support_cases'), orderBy('updatedAt', 'desc'));
    return onSnapshot(supportQuery, snapshot => {
        callback(snapshot.docs.map(caseDoc => ({ id: caseDoc.id, ...caseDoc.data() })), null);
    }, error => {
        console.error('Support case listener failed:', error);
        callback([], error);
    });
}

export function listenMySupportCases(callback) {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('Authentication required');
    const ownCases = query(collection(db, 'support_cases'), where('userId', '==', userId));
    return onSnapshot(ownCases, snapshot => {
        callback(snapshot.docs.map(caseDoc => ({ id: caseDoc.id, ...caseDoc.data() })), null);
    }, error => {
        console.error('User Support listener failed:', error);
        callback([], error);
    });
}

export async function getMySupportDescription(caseId) {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('Authentication required');
    const caseSnapshot = await getDoc(doc(db, 'support_cases', caseId));
    if (!caseSnapshot.exists() || caseSnapshot.data().userId !== userId) return '';
    if (caseSnapshot.data().createdByRole !== 'user') return '';
    const initialNote = await getDoc(doc(db, 'support_cases', caseId, 'notes', 'initial'));
    return initialNote.exists() ? initialNote.data().message || '' : '';
}

export function createOwnSupportCase({ subject, category, description }) {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('Authentication required');
    const initialNote = typeof description === 'string' ? description.trim() : '';
    if (!initialNote) throw new Error('Support description is required');
    return createSupportCase({
        userId,
        subject,
        category,
        priority: 'normal',
        createdBy: userId,
        createdByRole: 'user',
        initialNote
    });
}

export function listenSupportCaseNotes(caseId, callback) {
    const notesQuery = query(collection(db, 'support_cases', caseId, 'notes'), orderBy('createdAt', 'asc'));
    return onSnapshot(notesQuery, snapshot => {
        callback(snapshot.docs.map(noteDoc => ({ id: noteDoc.id, ...noteDoc.data() })), null);
    }, error => {
        console.error('Support note listener failed:', error);
        callback([], error);
    });
}

export async function createSupportCase({ userId, subject, category, priority, createdBy, createdByRole, initialNote = '' }) {
    const batch = writeBatch(db);
    const caseRef = doc(collection(db, 'support_cases'));
    const timestamp = serverTimestamp();
    batch.set(caseRef, {
        userId,
        subject,
        category,
        status: 'open',
        priority,
        createdBy,
        createdByRole,
        assignedTo: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        resolvedAt: null
    });
    if (initialNote) {
        const noteRef = createdByRole === 'user'
            ? doc(db, 'support_cases', caseRef.id, 'notes', 'initial')
            : doc(collection(db, 'support_cases', caseRef.id, 'notes'));
        batch.set(noteRef, {
            authorId: createdBy,
            authorRole: createdByRole,
            message: initialNote,
            createdAt: timestamp
        });
    }
    await batch.commit();
    return caseRef.id;
}

export function startSupportCase(caseId, actorId) {
    return updateDoc(doc(db, 'support_cases', caseId), {
        status: 'in_progress',
        assignedTo: actorId,
        updatedAt: serverTimestamp(),
        resolvedAt: null
    });
}

export function resolveSupportCase(caseId) {
    return updateDoc(doc(db, 'support_cases', caseId), {
        status: 'resolved',
        updatedAt: serverTimestamp(),
        resolvedAt: serverTimestamp()
    });
}

export function reopenSupportCase(caseId) {
    return updateDoc(doc(db, 'support_cases', caseId), {
        status: 'open',
        assignedTo: null,
        updatedAt: serverTimestamp(),
        resolvedAt: null
    });
}

export function addSupportCaseNote(caseId, { authorId, authorRole, message }) {
    return addDoc(collection(db, 'support_cases', caseId, 'notes'), {
        authorId,
        authorRole,
        message,
        createdAt: serverTimestamp()
    });
}
