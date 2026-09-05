export const VALID_ROLES = Object.freeze(['user', 'staff', 'admin']);
export const VALID_PLANS = Object.freeze(['free', 'premium']);
const VALID_VIEWS = Object.freeze(['dashboard', 'list', 'history', 'analytics', 'calendar', 'achievements', 'settings', 'staff', 'admin']);

export function resolveUserAccess(userData = {}) {
    const legacyPremium = userData.role === 'premium';
    const role = VALID_ROLES.includes(userData.role) ? userData.role : 'user';
    const plan = legacyPremium || userData.plan === 'premium' ? 'premium' : 'free';

    return { role, plan, legacyPremium };
}

export function canAccessView(viewId, role) {
    if (!VALID_VIEWS.includes(viewId)) return false;
    if (viewId === 'admin') return role === 'admin';
    if (viewId === 'staff') return role === 'staff';
    return true;
}

export function hasPremiumPlan(plan, role) {
    // Admins had Premium access before this refactor, so retain that behavior.
    return plan === 'premium' || role === 'admin';
}
