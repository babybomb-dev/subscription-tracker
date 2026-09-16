export const VALID_ROLES = Object.freeze(['user', 'staff', 'admin']);
export const VALID_PLANS = Object.freeze(['free', 'premium']);
export const VALID_PREMIUM_PLANS = Object.freeze(['monthly', 'yearly', 'lifetime']);
const STAFF_VIEWS = Object.freeze(['staff-overview', 'staff-users', 'staff-subscriptions', 'staff-premium', 'staff-reports', 'staff-settings']);
const ADMIN_VIEWS = Object.freeze(['admin-overview', 'admin-users', 'admin-subscriptions', 'admin-premium', 'admin-reports', 'admin-settings']);
const VALID_VIEWS = Object.freeze(['dashboard', 'list', 'history', 'analytics', 'calendar', 'settings', ...STAFF_VIEWS, ...ADMIN_VIEWS]);

function cleanIdentityValue(value) {
    return typeof value === 'string' ? value.trim() : '';
}

export function resolveUserIdentity(userData = {}) {
    const canonicalName = cleanIdentityValue(userData.displayName);
    const legacyName = cleanIdentityValue(userData.name);
    const displayName = canonicalName || legacyName;
    const email = cleanIdentityValue(userData.email);
    const uid = cleanIdentityValue(userData.id) || cleanIdentityValue(userData.uid);
    const uidLabel = uid ? `UID ${uid.slice(0, 8)}${uid.length > 8 ? '…' : ''}` : '';

    return {
        primary: displayName || email || 'ผู้ใช้',
        secondary: displayName && email ? email : uidLabel,
        displayName,
        email,
        uid,
        source: canonicalName ? 'displayName' : legacyName ? 'name' : email ? 'email' : 'fallback'
    };
}

export function firestoreValueToDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value.toDate === 'function') {
        const date = value.toDate();
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function calculatePremiumUntil(premiumPlan, purchasedAt = new Date()) {
    if (premiumPlan === 'lifetime') return null;
    if (premiumPlan !== 'monthly' && premiumPlan !== 'yearly') throw new Error('Invalid Premium plan');
    const result = new Date(purchasedAt);
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + (premiumPlan === 'monthly' ? 1 : 12));
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
    return result;
}

export function resolveUserAccess(userData = {}, now = new Date()) {
    const legacyPremiumRole = userData.role === 'premium';
    const role = VALID_ROLES.includes(userData.role) ? userData.role : 'user';
    const plan = legacyPremiumRole || userData.plan === 'premium' ? 'premium' : 'free';
    const explicitPremiumPlan = VALID_PREMIUM_PLANS.includes(userData.premiumPlan) ? userData.premiumPlan : null;
    const legacyLifetime = plan === 'premium' && !explicitPremiumPlan;
    const premiumPlan = plan === 'premium' ? (explicitPremiumPlan || 'lifetime') : null;
    const premiumUntil = firestoreValueToDate(userData.premiumUntil);
    const nowDate = firestoreValueToDate(now) || new Date();
    const isPremiumActive = plan === 'premium' && (
        premiumPlan === 'lifetime' ||
        ((premiumPlan === 'monthly' || premiumPlan === 'yearly') && premiumUntil !== null && premiumUntil.getTime() > nowDate.getTime())
    );

    return {
        role,
        plan,
        premiumPlan,
        premiumUntil,
        isPremiumActive,
        isPremiumExpired: plan === 'premium' && !isPremiumActive,
        legacyPremium: legacyPremiumRole || legacyLifetime,
        legacyPremiumRole,
        legacyLifetime
    };
}

export function canAccessView(viewId, role) {
    if (!VALID_VIEWS.includes(viewId)) return false;
    if (role === 'staff') return STAFF_VIEWS.includes(viewId);
    if (role === 'admin') return ADMIN_VIEWS.includes(viewId);
    if (STAFF_VIEWS.includes(viewId)) return role === 'staff';
    if (ADMIN_VIEWS.includes(viewId)) return role === 'admin';
    return true;
}

export function hasPremiumPlan(plan, role, isPremiumActive = plan === 'premium') {
    // Admins had Premium access before this refactor, so retain that behavior.
    return role === 'admin' || (plan === 'premium' && isPremiumActive);
}
