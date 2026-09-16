import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  addDoc, collection, doc, getDoc, getDocs, orderBy, query,
  serverTimestamp, setDoc, Timestamp, updateDoc, deleteDoc, where, writeBatch
} from 'firebase/firestore';
import {
  assertFails, assertSucceeds, initializeTestEnvironment
} from '@firebase/rules-unit-testing';

const projectId = 'demo-subscription-tracker-rules-test';
const rulesPath = fileURLToPath(new URL('../../firestore.rules', import.meta.url));
let environment;
let sequence = 0;

const db = uid => environment.authenticatedContext(uid).firestore();
const caseRef = (firestore, id) => doc(firestore, 'support_cases', id);
const noteRef = (firestore, id, noteId = 'initial') =>
  doc(firestore, 'support_cases', id, 'notes', noteId);

function casePayload(userId = 'user-a', createdBy = 'user-a', createdByRole = 'user') {
  return {
    userId, subject: 'Need account help', category: 'account', status: 'open',
    priority: 'normal', createdBy, createdByRole, assignedTo: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), resolvedAt: null
  };
}

function notePayload(authorId = 'user-a', authorRole = 'user') {
  return { authorId, authorRole, message: 'Please help with my account', createdAt: serverTimestamp() };
}

async function seedCase(id, owner = 'user-a', overrides = {}) {
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(caseRef(context.firestore(), id), {
      userId: owner, subject: 'Existing case', category: 'account',
      status: 'open', priority: 'normal', createdBy: owner, createdByRole: 'user',
      assignedTo: null, createdAt: Timestamp.fromDate(new Date('2024-01-01')),
      updatedAt: Timestamp.fromDate(new Date('2024-01-01')), resolvedAt: null,
      ...overrides
    });
  });
}

async function seedNote(id, noteId, authorId, authorRole) {
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(noteRef(context.firestore(), id, noteId), {
      authorId, authorRole, message: 'Existing note',
      createdAt: Timestamp.fromDate(new Date('2024-01-01'))
    });
  });
}

function userBatch({ caseChanges = {}, noteChanges = {}, noteId = 'initial',
  includeNote = true, secondNote = false } = {}) {
  const firestore = db('user-a');
  const id = `user-case-${++sequence}`;
  const batch = writeBatch(firestore);
  batch.set(caseRef(firestore, id), { ...casePayload(), ...caseChanges });
  if (includeNote) batch.set(noteRef(firestore, id, noteId), { ...notePayload(), ...noteChanges });
  if (secondNote) batch.set(noteRef(firestore, id, 'second'), notePayload());
  return { id, batch };
}

async function denyAtomic(options) {
  const { id, batch } = userBatch(options);
  await assertFails(batch.commit());
  await environment.withSecurityRulesDisabled(async context => {
    const firestore = context.firestore();
    assert.equal((await getDoc(caseRef(firestore, id))).exists(), false);
    assert.equal((await getDoc(noteRef(firestore, id))).exists(), false);
  });
}

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator is required');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync(rulesPath, 'utf8') }
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const firestore = context.firestore();
    await Promise.all([
      setDoc(doc(firestore, 'users', 'user-a'), { role: 'user' }),
      setDoc(doc(firestore, 'users', 'user-b'), { role: 'user' }),
      setDoc(doc(firestore, 'users', 'staff-a'), { role: 'staff' }),
      setDoc(doc(firestore, 'users', 'staff-b'), { role: 'staff' }),
      setDoc(doc(firestore, 'users', 'admin-a'), { role: 'admin' })
    ]);
  });
});

after(async () => { if (environment) await environment.cleanup(); });

test('User A creates case and notes/initial atomically', async () => {
  const { id, batch } = userBatch();
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(caseRef(db('user-a'), id))).exists(), true);
  assert.equal((await getDoc(noteRef(db('user-a'), id))).data().authorRole, 'user');
});

const invalidCreates = [
  ['case without initial', { includeNote: false }],
  ['random note ID instead of initial', { noteId: 'random-id' }],
  ['initial plus second User note', { secondNote: true }],
  ['case userId is User B', { caseChanges: { userId: 'user-b' } }],
  ['case createdBy is User B', { caseChanges: { createdBy: 'user-b' } }],
  ['case createdByRole is staff', { caseChanges: { createdByRole: 'staff' } }],
  ['case createdByRole is admin', { caseChanges: { createdByRole: 'admin' } }],
  ['case status is in_progress', { caseChanges: { status: 'in_progress' } }],
  ['case status is resolved', { caseChanges: { status: 'resolved' } }],
  ['case priority is high', { caseChanges: { priority: 'high' } }],
  ['case assignedTo is staff-a', { caseChanges: { assignedTo: 'staff-a' } }],
  ['case resolvedAt is non-null', { caseChanges: { resolvedAt: serverTimestamp() } }],
  ['case has extra field', { caseChanges: { injected: true } }],
  ['initial authorId is User B', { noteChanges: { authorId: 'user-b' } }],
  ['initial authorRole is staff', { noteChanges: { authorRole: 'staff' } }],
  ['initial authorRole is admin', { noteChanges: { authorRole: 'admin' } }],
  ['initial message is empty', { noteChanges: { message: '' } }],
  ['initial message is whitespace', { noteChanges: { message: '   ' } }],
  ['initial message exceeds 2000', { noteChanges: { message: 'x'.repeat(2001) } }],
  ['initial note has extra field', { noteChanges: { injected: true } }],
  ['case timestamp is invalid', { caseChanges: { createdAt: Timestamp.fromDate(new Date('2024-01-01')) } }],
  ['note timestamp is invalid', { noteChanges: { createdAt: Timestamp.fromDate(new Date('2024-01-01')) } }]
];
for (const [name, options] of invalidCreates) {
  test(`User create DENY: ${name}`, async () => { await denyAtomic(options); });
}

const deniedMutations = [
  ['create notes/second', async (firestore, id) => setDoc(noteRef(firestore, id, 'second'), notePayload())],
  ['create notes/random-id', async (firestore, id) => setDoc(noteRef(firestore, id, 'random-id'), notePayload())],
  ['update notes/initial', async (firestore, id) => updateDoc(noteRef(firestore, id), { message: 'changed' })],
  ['delete notes/initial', async (firestore, id) => deleteDoc(noteRef(firestore, id))],
  ['change status', async (firestore, id) => updateDoc(caseRef(firestore, id), { status: 'resolved' })],
  ['change assignedTo', async (firestore, id) => updateDoc(caseRef(firestore, id), { assignedTo: 'staff-a' })],
  ['change priority', async (firestore, id) => updateDoc(caseRef(firestore, id), { priority: 'high' })],
  ['change subject', async (firestore, id) => updateDoc(caseRef(firestore, id), { subject: 'changed' })],
  ['change owner', async (firestore, id) => updateDoc(caseRef(firestore, id), { userId: 'user-b' })],
  ['delete case', async (firestore, id) => deleteDoc(caseRef(firestore, id))]
];
for (const [name, action] of deniedMutations) {
  test(`User mutation DENY: ${name}`, async () => {
    await seedCase('existing');
    await seedNote('existing', 'initial', 'user-a', 'user');
    await assertFails(action(db('user-a'), 'existing'));
  });
}

test('User case and note reads are owner-only; internal notes are denied', async () => {
  await seedCase('a-case');
  await seedCase('b-case', 'user-b');
  await seedNote('a-case', 'initial', 'user-a', 'user');
  await seedNote('b-case', 'initial', 'user-b', 'user');
  await seedNote('a-case', 'staff-note', 'staff-a', 'staff');
  await seedNote('a-case', 'admin-note', 'admin-a', 'admin');
  await assertSucceeds(getDoc(caseRef(db('user-a'), 'a-case')));
  await assertSucceeds(getDoc(noteRef(db('user-a'), 'a-case')));
  await assertFails(getDoc(caseRef(db('user-a'), 'b-case')));
  await assertFails(getDoc(noteRef(db('user-a'), 'b-case')));
  await assertFails(getDoc(caseRef(db('user-b'), 'a-case')));
  await assertFails(getDoc(noteRef(db('user-b'), 'a-case')));
  await assertFails(getDoc(noteRef(db('user-a'), 'a-case', 'staff-note')));
  await assertFails(getDoc(noteRef(db('user-a'), 'a-case', 'admin-note')));
});

test('User owner query succeeds and unscoped query fails', async () => {
  await seedCase('a-case');
  await seedCase('b-case', 'user-b');
  await assertSucceeds(getDocs(query(collection(db('user-a'), 'support_cases'), where('userId', '==', 'user-a'))));
  await assertFails(getDocs(collection(db('user-a'), 'support_cases')));
});

test('Staff creates on-behalf case plus generated-ID Staff note in one batch', async () => {
  const firestore = db('staff-a');
  const batch = writeBatch(firestore);
  batch.set(caseRef(firestore, 'staff-created'), casePayload('user-a', 'staff-a', 'staff'));
  batch.set(noteRef(firestore, 'staff-created', 'generated-note-id'), notePayload('staff-a', 'staff'));
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(noteRef(firestore, 'staff-created', 'generated-note-id'))).exists(), true);
});

test('Staff claim and resolve use the exact service update payloads', async () => {
  await seedCase('workflow');
  const firestore = db('staff-a');
  await assertSucceeds(updateDoc(caseRef(firestore, 'workflow'), {
    status: 'in_progress', assignedTo: 'staff-a',
    updatedAt: serverTimestamp(), resolvedAt: null
  }));
  await assertSucceeds(updateDoc(caseRef(firestore, 'workflow'), {
    status: 'resolved', updatedAt: serverTimestamp(), resolvedAt: serverTimestamp()
  }));
});

const deniedStaffActions = [
  ['priority-only', { priority: 'high', updatedAt: serverTimestamp() }],
  ['subject mutation', { subject: 'changed', updatedAt: serverTimestamp() }],
  ['ownership mutation', { userId: 'user-b', updatedAt: serverTimestamp() }],
  ['assign directly to Staff B', { status: 'in_progress', assignedTo: 'staff-b', updatedAt: serverTimestamp(), resolvedAt: null }],
  ['arbitrary resolvedAt', { resolvedAt: serverTimestamp(), updatedAt: serverTimestamp() }],
  ['unsupported open to resolved', { status: 'resolved', updatedAt: serverTimestamp(), resolvedAt: serverTimestamp() }]
];
for (const [name, changes] of deniedStaffActions) {
  test(`Staff update DENY: ${name}`, async () => {
    await seedCase('staff-target');
    await assertFails(updateDoc(caseRef(db('staff-a'), 'staff-target'), changes));
  });
}
test('Staff B cannot resolve Staff A case; Staff cannot reopen resolved case', async () => {
  await seedCase('assigned', 'user-a', { status: 'in_progress', assignedTo: 'staff-a' });
  await assertFails(updateDoc(caseRef(db('staff-b'), 'assigned'), {
    status: 'resolved', updatedAt: serverTimestamp(), resolvedAt: serverTimestamp()
  }));
  await seedCase('resolved', 'user-a', {
    status: 'resolved', assignedTo: 'staff-a', resolvedAt: Timestamp.now()
  });
  await assertFails(updateDoc(caseRef(db('staff-a'), 'resolved'), {
    status: 'open', assignedTo: null, updatedAt: serverTimestamp(), resolvedAt: null
  }));
});

test('Staff note succeeds; role, author, and extra-field spoofing fail', async () => {
  await seedCase('notes-target');
  const firestore = db('staff-a');
  await assertSucceeds(addDoc(collection(firestore, 'support_cases', 'notes-target', 'notes'), notePayload('staff-a', 'staff')));
  await assertFails(addDoc(collection(firestore, 'support_cases', 'notes-target', 'notes'), notePayload('staff-a', 'admin')));
  await assertFails(addDoc(collection(firestore, 'support_cases', 'notes-target', 'notes'), notePayload('staff-b', 'staff')));
  await assertFails(addDoc(collection(firestore, 'support_cases', 'notes-target', 'notes'), { ...notePayload('staff-a', 'staff'), injected: true }));
});

test('Admin Support create, read, claim, resolve, reopen, note remain available', async () => {
  const firestore = db('admin-a');
  const batch = writeBatch(firestore);
  batch.set(caseRef(firestore, 'admin-case'), casePayload('user-a', 'admin-a', 'admin'));
  batch.set(noteRef(firestore, 'admin-case', 'generated-admin-note'), notePayload('admin-a', 'admin'));
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(caseRef(firestore, 'admin-case')));
  await assertSucceeds(getDoc(noteRef(firestore, 'admin-case', 'generated-admin-note')));
  await assertSucceeds(updateDoc(caseRef(firestore, 'admin-case'), {
    status: 'in_progress', assignedTo: 'staff-a', updatedAt: serverTimestamp(), resolvedAt: null
  }));
  await assertSucceeds(updateDoc(caseRef(firestore, 'admin-case'), {
    status: 'resolved', updatedAt: serverTimestamp(), resolvedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(caseRef(firestore, 'admin-case'), {
    status: 'open', assignedTo: null, updatedAt: serverTimestamp(), resolvedAt: null
  }));
  await assertSucceeds(addDoc(collection(firestore, 'support_cases', 'admin-case', 'notes'), notePayload('admin-a', 'admin')));
});

test('Staff and Admin system-wide support queries are allowed', async () => {
  await seedCase('query-a');
  await seedCase('query-b', 'user-b');
  for (const uid of ['staff-a', 'admin-a']) {
    await assertSucceeds(getDocs(query(collection(db(uid), 'support_cases'), orderBy('updatedAt', 'desc'))));
  }
});
