import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

const mainSource = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

function functionSource(start, next) {
    const begin = mainSource.indexOf(start);
    const end = mainSource.indexOf(next, begin);
    assert.ok(begin >= 0 && end > begin, `Cannot locate ${start}`);
    return mainSource.slice(begin, end);
}

const submitSource = functionSource('async function submitMySupportCase(event) {', '\nasync function submitSupportNote');
const listSource = functionSource('function renderMySupportPage() {', '\nfunction retryMySupportCaseListener');

function submitHarness({ create, reset, close } = {}) {
    const toasts = [];
    const errors = [];
    const button = { disabled: false };
    const inputs = {
        'user-support-subject': { value: 'Account issue' },
        'user-support-category': { value: 'account' },
        'user-support-description': { value: 'Please help' },
        'btn-submit-user-support': button,
        'modal-user-support-create': {}
    };
    let writes = 0;
    let resets = 0;
    let closes = 0;
    const form = {
        reset() {
            resets++;
            if (reset) reset();
            for (const id of ['user-support-subject', 'user-support-description']) inputs[id].value = '';
        }
    };
    const event = { currentTarget: form, preventDefault() {} };
    const context = createContext({
        mySupportSubmitting: false,
        currentUser: { uid: 'user-a' },
        isUser: () => true,
        validateSupportText: value => String(value || '').trim(),
        SUPPORT_CATEGORIES: ['account'],
        document: { getElementById: id => inputs[id] },
        createOwnSupportCase(payload) {
            writes++;
            return create
                ? create(payload, event)
                : Promise.resolve().then(() => { event.currentTarget = null; return 'case-1'; });
        },
        closeModal(modal) {
            closes++;
            assert.equal(modal, inputs['modal-user-support-create']);
            if (close) close();
        },
        showToast: (message, type) => toasts.push({ message, type }),
        console: { error: (...parts) => errors.push(parts) }
    });
    new Script(submitSource).runInContext(context);
    return {
        run: () => context.submitMySupportCase(event),
        context, event, inputs, button, toasts, errors,
        get writes() { return writes; },
        get resets() { return resets; },
        get closes() { return closes; }
    };
}

test('successful commit resets and closes with one success toast even after currentTarget clears', async () => {
    const h = submitHarness();
    await h.run();
    assert.equal(h.writes, 1);
    assert.equal(h.resets, 1);
    assert.equal(h.closes, 1);
    assert.deepEqual(h.toasts, [{ message: 'ส่งเรื่องให้เจ้าหน้าที่เรียบร้อยแล้ว', type: 'success' }]);
    assert.equal(h.inputs['user-support-subject'].value, '');
    assert.equal(h.button.disabled, false);
    assert.equal(h.context.mySupportSubmitting, false);
});

test('Firestore rejection preserves the form and shows only a failure toast', async () => {
    const h = submitHarness({
        create: (_payload, event) => Promise.resolve().then(() => {
            event.currentTarget = null;
            throw new Error('permission-denied');
        })
    });
    await h.run();
    assert.equal(h.writes, 1);
    assert.equal(h.resets, 0);
    assert.equal(h.closes, 0);
    assert.equal(h.inputs['user-support-description'].value, 'Please help');
    assert.deepEqual(h.toasts, [{ message: 'ไม่สามารถส่งเรื่องให้เจ้าหน้าที่ได้ กรุณาลองใหม่อีกครั้ง', type: 'error' }]);
    assert.equal(h.button.disabled, false);
});

test('post-commit cleanup failure never retries or reports a write failure', async () => {
    const h = submitHarness({
        reset: () => { throw new Error('reset failed'); },
        close: () => { throw new Error('close failed'); }
    });
    await h.run();
    assert.equal(h.writes, 1);
    assert.equal(h.resets, 1);
    assert.equal(h.closes, 1);
    assert.equal(h.errors.length, 2);
    assert.deepEqual(h.toasts, [{ message: 'ส่งเรื่องให้เจ้าหน้าที่เรียบร้อยแล้ว', type: 'success' }]);
    assert.equal(h.button.disabled, false);
});

test('double submit while commit is pending writes only once', async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const h = submitHarness({ create: () => pending });
    const first = h.run();
    assert.equal(h.button.disabled, true);
    const second = h.run();
    assert.equal(h.writes, 1);
    release('case-1');
    await Promise.all([first, second]);
    assert.equal(h.writes, 1);
    assert.equal(h.toasts.length, 1);
    assert.equal(h.button.disabled, false);
});

test('existing owner listener binds once and replaces, rather than appends, rendered cases', () => {
    const elements = new Map();
    let subscriptions = 0;
    let callback;
    const context = createContext({
        currentUser: { uid: 'user-a' },
        isUser: () => true,
        mySupportCases: [],
        mySupportLoading: false,
        mySupportError: null,
        mySupportListenerUid: null,
        mySupportDetailCaseId: null,
        unsubscribeMySupportCases: null,
        document: {
            getElementById(id) {
                if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '' });
                return elements.get(id);
            }
        },
        listenMySupportCases(listener) {
            subscriptions++;
            callback = listener;
            return () => {};
        },
        SUPPORT_STATUS_META: { open: { className: '', label: 'เปิด' } },
        USER_SUPPORT_CATEGORY_LABELS: { account: 'บัญชี' },
        userSupportStatusLabel: () => 'เปิด',
        escapeHTML: value => String(value),
        formatJoinedDate: () => '-',
        dateValue: () => 0,
        renderMySupportDetailMeta: () => {}
    });
    new Script(listSource).runInContext(context);
    context.ensureMySupportCaseListener();
    context.ensureMySupportCaseListener();
    assert.equal(subscriptions, 1);
    const oneCase = [{ id: 'case-1', userId: 'user-a', subject: 'Account issue', category: 'account', status: 'open' }];
    callback(oneCase, null);
    callback(oneCase, null);
    assert.equal((elements.get('user-support-list').innerHTML.match(/<article/g) || []).length, 1);
    assert.equal(elements.get('user-support-total').textContent, '1');
});
