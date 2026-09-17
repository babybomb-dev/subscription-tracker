import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

const source = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

function between(start, end) {
    const first = source.indexOf(start);
    const last = source.indexOf(end, first);
    assert.ok(first >= 0 && last > first, `Cannot find ${start}`);
    return source.slice(first, last);
}

const userTableSource = between('function getSupportCaseSummariesByUser() {', '\nfunction getPopularServices');
const caseRowSource = between('function supportCaseRowMarkup(', '\nfunction renderSupportCaseList');
const openCasesSource = between('function openSupportUserCases(', '\nfunction openSupportCaseComposer');
const listenerSource = between('function ensureSupportCaseListener() {', '\nfunction retrySupportCaseListener');

function tableHarness() {
    const makeBody = () => ({
        rows: [],
        set innerHTML(value) { this.html = value; this.rows = []; },
        get innerHTML() { return this.html; },
        appendChild(row) { this.rows.push(row); }
    });
    const adminBody = makeBody();
    const staffBody = makeBody();
    const elements = new Map([
        ['admin-user-list', adminBody], ['staff-user-list', staffBody],
        ['admin-user-search', { value: '' }], ['admin-role-filter', { value: 'all' }],
        ['admin-plan-filter', { value: 'all' }]
    ]);
    const users = [
        { id: 'none', role: 'user', name: 'No Case' },
        { id: 'new', role: 'user', name: 'New Case' },
        { id: 'mixed', role: 'user', name: 'Mixed Cases' },
        { id: 'resolved', role: 'user', name: 'Resolved Case' },
        { id: 'admin-a', role: 'admin', name: 'Protected Admin' }
    ];
    const cases = [
        { userId: 'new', status: 'open', createdByRole: 'user' },
        { userId: 'mixed', status: 'in_progress', createdByRole: 'staff' },
        { userId: 'mixed', status: 'resolved', createdByRole: 'user' },
        { userId: 'resolved', status: 'resolved', createdByRole: 'user' }
    ];
    const context = createContext({
        managementUsers: users,
        supportCases: cases,
        supportCasesLoading: false,
        supportCasesError: null,
        currentUser: { uid: 'admin-a' },
        document: {
            getElementById(id) { return elements.get(id) || null; },
            createElement() { return { className: '', innerHTML: '' }; }
        },
        resolveUserAccess: user => ({
            role: user.role, plan: 'free', legacyPremium: false,
            isPremiumActive: false, premiumPlan: null
        }),
        resolveUserIdentity: user => ({
            primary: user.name, secondary: '', email: '', uid: user.id,
            qualityLabel: 'บัญชีพร้อมใช้งาน', reviewReasons: []
        }),
        getUserSubscriptionSummary: () => ({ count: 0, paused: 0, monthlyTHB: 0 }),
        getAccountReviewReasons: () => [],
        getUserCreatedAt: () => null,
        getPremiumPlanLabel: () => '-',
        formatJoinedDate: () => '-',
        escapeHTML: value => String(value)
    });
    new Script(userTableSource).runInContext(context);
    const row = (body, name) => body.rows.find(item => item.innerHTML.includes(name))?.innerHTML || '';
    return { context, users, cases, elements, adminBody, staffBody, row };
}

test('Admin Support actions reflect zero, one, and multiple real cases', () => {
    const h = tableHarness();
    h.context.renderManagementUsers('admin');
    assert.match(h.row(h.adminBody, 'No Case'), /data-create-support-case="none"/);
    assert.match(h.row(h.adminBody, 'No Case'), /เปิดเคส Support/);
    assert.match(h.row(h.adminBody, 'New Case'), /data-open-support-user-cases="new"/);
    assert.match(h.row(h.adminBody, 'New Case'), /Support · 1 เคส/);
    assert.match(h.row(h.adminBody, 'Mixed Cases'), /Support · 2 เคส/);
    assert.match(h.row(h.adminBody, 'Resolved Case'), /Support · 1 เคส/);
});

test('pending and user-created open indicators are status-specific', () => {
    const h = tableHarness();
    h.context.renderManagementUsers('admin');
    assert.match(h.row(h.adminBody, 'New Case'), /มีเรื่องแจ้งใหม่/);
    assert.match(h.row(h.adminBody, 'New Case'), /เคสที่ต้องดำเนินการ/);
    assert.doesNotMatch(h.row(h.adminBody, 'Mixed Cases'), /มีเรื่องแจ้งใหม่/);
    assert.match(h.row(h.adminBody, 'Mixed Cases'), /เคสที่ต้องดำเนินการ/);
    assert.doesNotMatch(h.row(h.adminBody, 'Resolved Case'), /มีเรื่องแจ้งใหม่|เคสที่ต้องดำเนินการ|bg-amber-500/);
});

test('loading state does not mislabel an unknown case count as zero', () => {
    const h = tableHarness();
    h.context.supportCasesLoading = true;
    h.context.renderManagementUsers('admin');
    const row = h.row(h.adminBody, 'New Case');
    assert.match(row, /Support · …/);
    assert.match(row, /disabled/);
    assert.doesNotMatch(row, /data-create-support-case|data-open-support-user-cases/);
});

test('Staff management button and identity remain unchanged', () => {
    const h = tableHarness();
    h.context.renderManagementUsers('staff');
    const row = h.row(h.staffBody, 'New Case');
    assert.match(row, /data-create-support-case="new"/);
    assert.match(row, /เปิดเคส Support/);
    assert.doesNotMatch(row, /มีเรื่องแจ้งใหม่|data-open-support-user-cases/);
});

test('existing role, Premium, protected Admin, and search/filter actions remain', () => {
    const h = tableHarness();
    h.context.renderManagementUsers('admin');
    const userRow = h.row(h.adminBody, 'No Case');
    assert.match(userRow, /data-change-role="staff"/);
    assert.match(userRow, /data-manage-premium="none"/);
    assert.match(userRow, /data-open-support-user="none"/);
    const adminRow = h.row(h.adminBody, 'Protected Admin');
    assert.match(adminRow, /ได้รับการป้องกัน/);
    assert.doesNotMatch(adminRow, /data-change-role|data-manage-premium|data-open-support-user-cases/);
    h.elements.get('admin-user-search').value = 'Mixed';
    h.context.renderManagementUsers('admin');
    assert.equal(h.adminBody.rows.length, 1);
    assert.match(h.adminBody.rows[0].innerHTML, /Mixed Cases/);
    h.elements.get('admin-role-filter').value = 'staff';
    h.context.renderManagementUsers('admin');
    assert.equal(h.adminBody.rows.length, 0);
});

test('Admin case row exposes subject, category, status, created date, and creator role', () => {
    const context = createContext({
        getSupportIdentity: () => ({ primary: 'User A' }),
        SUPPORT_STATUS_META: { open: { label: 'รอตรวจสอบ', className: '' } },
        SUPPORT_CATEGORY_LABELS: { account: 'บัญชี' },
        escapeHTML: value => String(value),
        formatJoinedDate: () => '17 ก.ย. 2569'
    });
    new Script(caseRowSource).runInContext(context);
    const item = { id: 'case-1', subject: 'Login issue', userId: 'new', category: 'account', status: 'open', createdByRole: 'user' };
    const adminMarkup = context.supportCaseRowMarkup(item, false, true);
    assert.match(adminMarkup, /Login issue/);
    assert.match(adminMarkup, /รอตรวจสอบ/);
    assert.match(adminMarkup, /บัญชี/);
    assert.match(adminMarkup, /17 ก.ย. 2569/);
    assert.match(adminMarkup, /โดย User/);
    assert.match(adminMarkup, /data-open-support-case="case-1"/);
    assert.doesNotMatch(context.supportCaseRowMarkup(item), /โดย User/);
});

test('case-count click reuses the existing user modal and scrolls to its case list', () => {
    const opened = [];
    let scrolled = false;
    const context = createContext({
        isAdmin: () => true,
        openSupportUserDetail: id => opened.push(id),
        requestAnimationFrame: callback => callback(),
        document: {
            getElementById: id => id === 'support-user-case-count'
                ? { scrollIntoView: () => { scrolled = true; } } : null
        }
    });
    new Script(openCasesSource).runInContext(context);
    context.openSupportUserCases('new');
    assert.deepEqual(opened, ['new']);
    assert.equal(scrolled, true);
});

test('one existing Support listener refreshes Admin rows from its snapshot', () => {
    let subscriptions = 0;
    let callback;
    const renderedPanels = [];
    const context = createContext({
        currentUser: { uid: 'admin-a' },
        isStaff: () => false,
        isAdmin: () => true,
        unsubscribeSupportCases: null,
        supportCases: [],
        supportCasesLoading: false,
        supportCasesError: null,
        renderSupportSurfaces: () => {},
        renderManagementUsers: panel => renderedPanels.push(panel),
        listenSupportCases(listener) {
            subscriptions++;
            callback = listener;
            return () => {};
        }
    });
    new Script(listenerSource).runInContext(context);
    context.ensureSupportCaseListener();
    context.ensureSupportCaseListener();
    assert.equal(subscriptions, 1);
    callback([{ userId: 'new', status: 'open' }], null);
    assert.equal(context.supportCasesLoading, false);
    assert.equal(context.supportCases.length, 1);
    assert.deepEqual(renderedPanels, ['admin']);
});
