/**
 * js/main.js
 * Entry Point for Subscription Tracker
 */
import { 
    initAuthListener, 
    login, 
    register, 
    loginWithGoogle, 
    logout,
    updateUserProfile
} from './services/auth.js';
import { 
    listenSubscriptions, 
    addSubscription, 
    updateSubscription, 
    deleteSubscription,
    archiveSubscription,
    createUserAccountDocument,
    saveUserSettings,
    getUserSettings,
    syncAuthenticatedUserEmailIfMissing,
    recordSubscriptionPayment,
    listenPaymentHistory,
    getAllUsers,
    getAllSubscriptionsForSupport,
    getAdminAuditLogs,
    updateUserRole,
    migrateLegacyPremiumUser,
    purchasePremiumPlan,
    overrideUserPremium
} from './services/database.js';
import { 
    initTheme, changeTheme, switchView, 
    openModal, 
    closeModal, 
    closeAllModals, 
    showToast,
    renderSubscriptionList,
    renderUpcomingList,
    renderActiveSubsList
} from './components/ui.js';
import { renderDonutChart } from './components/chart.js';
import { renderHistoryList, renderLatestTransactions } from './components/history.js';
import { renderMonthlyCalendar, renderFullCalendar, initFullCalendarControls } from './components/calendar.js';
import { renderAnalyticsChart, openYearInReview } from './components/analytics.js';
import { initSettings, refreshSettingsCategories } from './components/settings.js';
import { initSplitBill, openSplitBillModal } from './components/splitBill.js';
import { initNotifications, requestNotificationPermission, checkUpcomingNotifications } from './components/notifications.js';

import { subscriptionPresets } from './utils/presets.js';
import { initPWA } from './pwa.js';
import { calculateNextBillingDate, getCategoryName, updateCustomCategories } from './utils/helpers.js';
import { resolveUserAccess, canAccessView, hasPremiumPlan, calculatePremiumUntil } from './utils/access.js';

// --- Global State ---
export let currentUser = null;
export let currentUserRole = 'user'; // 'user', 'staff', 'admin'
export let currentUserPlan = 'free'; // 'free', 'premium'
export let currentPremiumAccess = resolveUserAccess({});
export let currentSubs = [];
export let currentHistory = [];
export let unsubscribeSubs = null;
export let unsubscribeHistory = null;

let premiumPurchaseInProgress = false;
let selectedPremiumPlan = 'yearly';
let premiumExpirationTimer = null;
let managementUsers = [];
let managementSubscriptions = [];
let managementAuditLogs = [];
let managementDataLoaded = false;
let authResolutionId = 0;
let adminPremiumTargetId = null;

// Role Helpers
export const isUser = () => currentUserRole === 'user';
export const isStaff = () => currentUserRole === 'staff';
export const isAdmin = () => currentUserRole === 'admin';
const getLivePremiumAccess = () => resolveUserAccess({
    role: currentUserRole,
    plan: currentUserPlan,
    premiumPlan: currentPremiumAccess.premiumPlan,
    premiumUntil: currentPremiumAccess.premiumUntil
});
export const isPremium = () => getLivePremiumAccess().isPremiumActive;
export const hasPremiumAccess = () => hasPremiumPlan(currentUserPlan, currentUserRole, getLivePremiumAccess().isPremiumActive);

function schedulePremiumExpirationRefresh() {
    if (premiumExpirationTimer) clearTimeout(premiumExpirationTimer);
    premiumExpirationTimer = null;
    const access = getLivePremiumAccess();
    if (!access.isPremiumActive || access.premiumPlan === 'lifetime' || !access.premiumUntil) return;
    const delay = Math.max(0, access.premiumUntil.getTime() - Date.now() + 250);
    premiumExpirationTimer = setTimeout(() => {
        currentPremiumAccess = getLivePremiumAccess();
        updateRoleBadges();
        updatePremiumUpgradeUI();
        schedulePremiumExpirationRefresh();
    }, Math.min(delay, 2147483647));
}

export let state = {
    exchangeRates: { usd: 0.028, eur: 0.025, gbp: 0.021, jpy: 4.3, sgd: 0.038 }, // Fallback values relative to 1 THB
    cycle: 'monthly', // 'monthly' or 'yearly'
    chartMode: 'app', // 'app' or 'cat'
    searchQuery: '',
    sortMethod: 'upcoming',
    filterCategory: 'all',
    budget: 0,
    editingSubId: null,
    customCategories: [],
    activeSubsTab: 'active'
};

function normalizeSubscriptionForRuntime(subscription = {}) {
    const normalizedName = typeof subscription.name === 'string' ? subscription.name.trim() : '';
    return {
        ...subscription,
        name: normalizedName || 'ไม่ระบุชื่อ'
    };
}

// --- Elements ---
const authScreen = document.getElementById('auth-screen');
const registerScreen = document.getElementById('register-screen');
const appScreen = document.getElementById('app-screen');
const appLoadingScreen = document.getElementById('app-loading-screen');

// Initialize everything on load
document.addEventListener('DOMContentLoaded', () => {
    // Set global font for Chart.js to match the app
    if (window.Chart) {
        Chart.defaults.font.family = "'Prompt', sans-serif";
    }

    initTheme();
    initSplitBill();
    initPWA();
    initNotifications();
    fetchExchangeRate();
    setupEventListeners();
    
    // Start listening to auth changes
    initAuthListener((user) => {
        void handleAuthStateChange(user).catch(error => {
            console.error('Unexpected authentication initialization failure', error);
            if (user && currentUser?.uid === user.uid) showRoleResolutionError();
            else showAuthScreen();
        });
    });
});

async function handleAuthStateChange(user) {
    const resolutionId = ++authResolutionId;
    showLoadingScreen();
    if (user) {
        currentUser = user;
        const workspaceReady = await showAppScreen(resolutionId, true);
        if (workspaceReady && !isStaff() && !isAdmin()) loadUserData();
        return;
    }

    currentUser = null;
    currentUserRole = 'user';
    currentUserPlan = 'free';
    currentPremiumAccess = resolveUserAccess({});
    if (premiumExpirationTimer) clearTimeout(premiumExpirationTimer);
    premiumExpirationTimer = null;
    managementUsers = [];
    managementSubscriptions = [];
    managementAuditLogs = [];
    managementDataLoaded = false;
    showAuthScreen();
    if (unsubscribeSubs) unsubscribeSubs();
    if (unsubscribeHistory) unsubscribeHistory();
}

// --- Exchange Rate API ---
async function fetchExchangeRate() {
    try {
        const cachedRates = localStorage.getItem('exchangeRates');
        const cacheDate = localStorage.getItem('exchangeRateDate');
        const today = new Date().toDateString();

        if (cachedRates && cacheDate === today) {
            state.exchangeRates = JSON.parse(cachedRates);
            return;
        }

        // Fetch live from public API (Base: THB)
        const response = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/thb.json');
        if (response.ok) {
            const data = await response.json();
            if (data.thb) {
                state.exchangeRates = {
                    usd: data.thb.usd,
                    eur: data.thb.eur,
                    gbp: data.thb.gbp,
                    jpy: data.thb.jpy,
                    sgd: data.thb.sgd
                };
                localStorage.setItem('exchangeRates', JSON.stringify(state.exchangeRates));
                localStorage.setItem('exchangeRateDate', today);
                if (currentUser) {
                    updateUI();
                }
            }
        }
    } catch (error) {
        console.warn('Failed to fetch exchange rates, using fallback.', error);
    }
}

// --- Screen Management ---
function showAuthScreen() {
    appScreen.classList.add('hidden', 'lg:hidden');
    registerScreen.classList.add('hidden');
    appLoadingScreen?.classList.add('hidden');
    authScreen.classList.remove('hidden');
}

function showRegisterScreen() {
    authScreen.classList.add('hidden');
    appScreen.classList.add('hidden', 'lg:hidden');
    appLoadingScreen?.classList.add('hidden');
    registerScreen.classList.remove('hidden');
}

function showLoadingScreen() {
    authScreen.classList.add('hidden');
    registerScreen.classList.add('hidden');
    appScreen.classList.add('hidden', 'lg:hidden');
    const loadingIcon = document.getElementById('app-loading-icon');
    const loadingMessage = document.getElementById('app-loading-message');
    if (loadingIcon) loadingIcon.className = 'fa-solid fa-circle-notch fa-spin text-indigo-500';
    if (loadingMessage) loadingMessage.textContent = 'กำลังโหลดข้อมูล...';
    appLoadingScreen?.classList.remove('hidden');
}

function showRoleResolutionError() {
    showLoadingScreen();
    const loadingIcon = document.getElementById('app-loading-icon');
    const loadingMessage = document.getElementById('app-loading-message');
    if (loadingIcon) loadingIcon.className = 'fa-solid fa-triangle-exclamation text-amber-500';
    if (loadingMessage) loadingMessage.textContent = 'ไม่สามารถโหลดข้อมูลบัญชีได้ กรุณาลองใหม่';
}

function getLoginErrorMessage(error) {
    switch (error?.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
        case 'auth/invalid-email':
            return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
        case 'auth/network-request-failed':
            return 'ไม่สามารถเชื่อมต่อบริการเข้าสู่ระบบได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง';
        case 'auth/too-many-requests':
            return 'มีการพยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่';
        case 'auth/user-disabled':
            return 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ';
        default:
            return 'ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่อีกครั้ง';
    }
}

async function showAppScreen(resolutionId = authResolutionId, resolveInitialRoute = false) {
    showLoadingScreen();
    const appUser = currentUser;
    if (!appUser) return false;
    
    // Update Profile UI
    const name = appUser.displayName || 'User';
    const initial = name.charAt(0).toUpperCase();
    
    // Desktop Profile
    document.getElementById('display-name-desktop').textContent = name;
    document.getElementById('display-email-desktop').textContent = appUser.email;
    const avatarImgD = document.getElementById('avatar-img-desktop');
    const avatarInitD = document.getElementById('avatar-initial-desktop');
    if (avatarImgD && avatarInitD) {
        if (appUser.photoURL) {
            avatarImgD.src = appUser.photoURL;
            avatarImgD.classList.remove('hidden');
            avatarInitD.classList.add('hidden');
        } else {
            avatarInitD.textContent = initial;
            avatarInitD.classList.remove('hidden');
            avatarImgD.classList.add('hidden');
        }
    }

    // Mobile Profile
    const avatarImgM = document.getElementById('avatar-img-mobile');
    const avatarInitM = document.getElementById('avatar-initial-mobile');
    if (avatarImgM && avatarInitM) {
        if (appUser.photoURL) {
            avatarImgM.src = appUser.photoURL;
            avatarImgM.classList.remove('hidden');
            avatarInitM.classList.add('hidden');
        } else {
            avatarInitM.textContent = initial;
            avatarInitM.classList.remove('hidden');
            avatarImgM.classList.add('hidden');
        }
    }

    // Greeting Profile Avatar
    const greetingAvatarImg = document.getElementById('greeting-avatar-img');
    const greetingAvatarInit = document.getElementById('greeting-avatar-initial');
    if (greetingAvatarImg && greetingAvatarInit) {
        if (appUser.photoURL) {
            greetingAvatarImg.src = appUser.photoURL;
            greetingAvatarImg.classList.remove('hidden');
            greetingAvatarInit.classList.add('hidden');
        } else {
            greetingAvatarInit.textContent = initial;
            greetingAvatarInit.classList.remove('hidden');
            greetingAvatarImg.classList.add('hidden');
        }
    }

    // Load Budget from localStorage
    const savedBudget = localStorage.getItem(`budget_${appUser.uid}`);
    if (savedBudget) {
        state.budget = parseFloat(savedBudget);
        document.getElementById('budget-input').value = state.budget;
    }

    // Load from Firestore
    let resolvedRole = 'user';
    let resolvedPlan = 'free';
    let resolvedAccess = resolveUserAccess({});
    let settings;
    try {
        settings = await getUserSettings(appUser.uid);
    } catch (e) {
        console.error("Failed to resolve user access", e);
        if (resolutionId === authResolutionId && currentUser?.uid === appUser.uid) showRoleResolutionError();
        return false;
    }

    if (settings) {
        try {
            const emailSynced = await syncAuthenticatedUserEmailIfMissing();
            if (emailSynced) settings = { ...settings, email: appUser.email.trim() };
        } catch (syncError) {
            console.warn('Auth email sync deferred.', syncError);
        }

        const access = resolveUserAccess(settings);
        resolvedRole = access.role;
        resolvedPlan = access.plan;
        resolvedAccess = access;

        if (access.legacyPremiumRole) {
            try {
                await migrateLegacyPremiumUser(appUser.uid);
            } catch (migrationError) {
                // Compatibility remains active in memory even if rules are not deployed yet.
                console.warn('Legacy Premium migration deferred.', migrationError);
            }
        }
        
        if (settings.budget !== undefined) {
            state.budget = parseFloat(settings.budget);
            document.getElementById('budget-input').value = state.budget;
            localStorage.setItem(`budget_${appUser.uid}`, state.budget);
        }
        if (Array.isArray(settings.customCategories)) {
            state.customCategories = settings.customCategories;
            populateCategoryDropdowns();
        }
    } else {
        try {
            await createUserAccountDocument(appUser.uid, appUser.email);
        } catch (e) {
            console.warn('Default user settings could not be saved.', e);
        }
    }

    // Ignore an older async role lookup if auth changed while it was in flight.
    if (resolutionId !== authResolutionId || currentUser?.uid !== appUser.uid) return false;
    currentUserRole = resolvedRole;
    currentUserPlan = resolvedPlan;
    currentPremiumAccess = resolvedAccess;
    schedulePremiumExpirationRefresh();

    updateManagementUI();
    updateRoleBadges();
    updatePremiumUpgradeUI();

    if (resolveInitialRoute) {
        const requestedView = window.location.hash.replace(/^#\/?/, '');
        const fallbackView = isStaff() ? 'staff-overview' : isAdmin() ? 'admin-overview' : 'dashboard';
        navigateToView(requestedView && canAccessView(requestedView, currentUserRole) ? requestedView : fallbackView);
    }

    // Populate Profile Modal
    document.getElementById('profile-modal-name').textContent = name;
    document.getElementById('profile-display-name').value = name;
    document.getElementById('profile-modal-email').textContent = appUser.email;
    document.getElementById('profile-photo-url').value = appUser.photoURL || '';
    
    const pModalImg = document.getElementById('profile-modal-img');
    const pModalInit = document.getElementById('profile-modal-initial');
    if (appUser.photoURL) {
        pModalImg.src = appUser.photoURL;
        pModalImg.classList.remove('hidden');
        pModalInit.classList.add('hidden');
    } else {
        pModalInit.textContent = initial;
        pModalInit.classList.remove('hidden');
        pModalImg.classList.add('hidden');
    }
    appLoadingScreen?.classList.add('hidden');
    appScreen.classList.remove('hidden', 'lg:hidden');
    return true;
}

// --- Data Management ---
function loadUserData() {
    unsubscribeSubs = listenSubscriptions(currentUser.uid, (subs, error) => {
        if (error) {
            showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
            return;
        }
        currentSubs = subs.map(normalizeSubscriptionForRuntime);
        updateUI();
    });

    unsubscribeHistory = listenPaymentHistory(currentUser.uid, (history, error) => {
        if (error) {
            console.error(error);
            return;
        }
        currentHistory = history;
        updateUI();
    });
    
}

function renderSmartGreeting(activeSubs, totalCost, budget) {
    const titleEl = document.getElementById('greeting-title');
    const insightEl = document.getElementById('greeting-insight');
    if (!titleEl || !insightEl) return;

    const hour = new Date().getHours();
    let greeting = 'สวัสดี ☀️';
    if (hour >= 5 && hour < 12) greeting = 'สวัสดีตอนเช้า ☀️';
    else if (hour >= 12 && hour < 17) greeting = 'สวัสดีตอนบ่าย ☕';
    else if (hour >= 17 && hour < 22) greeting = 'สวัสดีตอนเย็น 🌙';
    else greeting = 'ราตรีสวัสดิ์ 💤';

    const name = currentUser?.displayName ? `คุณ ${currentUser.displayName.split(' ')[0]}` : '';
    titleEl.textContent = `${greeting} ${name}`;

    let insight = '';
    
    // Check budget first
    if (budget > 0 && totalCost > budget) {
        insight = 'ระวังการใช้จ่าย! ยอดรวมของคุณเกินงบประมาณแล้ว 💸';
    } else {
        // Check upcoming bills
        let hasUpcoming = false;
        const today = new Date();
        for (const sub of activeSubs) {
            const nextDate = calculateNextBillingDate(sub.date, sub.cycle);
            if (nextDate) {
                const diffTime = nextDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays >= 0 && diffDays <= 3) {
                    hasUpcoming = true;
                    insight = `ระวัง! อีก ${diffDays} วันจะมีบิล ${sub.name} มานะ 📅`;
                    break;
                }
            }
        }
        
        if (!hasUpcoming) {
            if (budget > 0) {
                insight = 'เดือนนี้คุณคุมงบได้ยอดเยี่ยมมาก! 🎉';
            } else {
                insight = 'สบายใจได้ ไม่มีบิลเรียกเก็บในเร็วๆ นี้ 🏖️';
            }
        }
    }
    
    insightEl.textContent = insight;
}

function updateManagementUI() {
    const backOffice = isStaff() || isAdmin();
    document.getElementById('user-desktop-nav')?.classList.toggle('hidden', backOffice);
    const staffDesktopNav = document.getElementById('staff-desktop-nav');
    staffDesktopNav?.classList.toggle('hidden', !isStaff());
    const adminDesktopNav = document.getElementById('admin-desktop-nav');
    adminDesktopNav?.classList.toggle('hidden', !isAdmin());
    const userMobileActions = document.getElementById('user-mobile-actions');
    userMobileActions?.classList.toggle('hidden', backOffice);
    userMobileActions?.classList.toggle('flex', !backOffice);
    const staffMobileActions = document.getElementById('staff-mobile-actions');
    staffMobileActions?.classList.toggle('hidden', !isStaff());
    staffMobileActions?.classList.toggle('flex', isStaff());
    const adminMobileActions = document.getElementById('admin-mobile-actions');
    adminMobileActions?.classList.toggle('hidden', !isAdmin());
    adminMobileActions?.classList.toggle('flex', isAdmin());
    document.getElementById('user-bottom-nav')?.classList.toggle('hidden', backOffice);
    const staffBottomNav = document.getElementById('staff-bottom-nav');
    staffBottomNav?.classList.toggle('hidden', !isStaff());
    const adminBottomNav = document.getElementById('admin-bottom-nav');
    adminBottomNav?.classList.toggle('hidden', !isAdmin());
    const desktopProfileActions = document.getElementById('desktop-profile-actions');
    desktopProfileActions?.classList.toggle('hidden', backOffice);
    desktopProfileActions?.classList.toggle('flex', !backOffice);
    const staffProfileActions = document.getElementById('staff-profile-actions');
    staffProfileActions?.classList.toggle('hidden', !isStaff());
    staffProfileActions?.classList.toggle('flex', isStaff());
    const adminProfileActions = document.getElementById('admin-profile-actions');
    adminProfileActions?.classList.toggle('hidden', !isAdmin());
    adminProfileActions?.classList.toggle('flex', isAdmin());
    for (const id of ['btn-add-mobile', 'btn-add-desktop']) document.getElementById(id)?.classList.toggle('hidden', backOffice);
    document.getElementById('app-context-label').textContent = isStaff() ? 'SubTracker Staff' : isAdmin() ? 'SubTracker Admin' : 'SubTracker';
    const brandTitle = document.getElementById('app-brand-title');
    if (brandTitle) brandTitle.textContent = isAdmin() ? 'SubTracker Admin' : 'SubTracker';
    for (const id of ['app-brand-desktop', 'app-brand-mobile']) {
        const brand = document.getElementById(id);
        brand?.classList.toggle('bg-amber-500', isAdmin());
        brand?.classList.toggle('bg-indigo-600', !isAdmin());
    }

    const visibleRestrictedView = document.querySelector('[id^="view-admin-"]:not(.hidden), [id^="view-staff-"]:not(.hidden)');
    if (visibleRestrictedView) {
        const viewId = visibleRestrictedView.id.replace('view-', '');
        if (!canAccessView(viewId, currentUserRole)) navigateToView(isStaff() ? 'staff-overview' : isAdmin() ? 'admin-overview' : 'dashboard');
    } else if (isStaff()) {
        navigateToView('staff-overview');
    } else if (isAdmin()) {
        navigateToView('admin-overview');
    }
}

function updateRoleBadges() {
    currentPremiumAccess = getLivePremiumAccess();
    const role = currentUserRole || 'user';
    const roleText = role === 'admin' ? 'Admin' :
                     role === 'staff' ? 'Staff' : 'User';
                      
    const roleClass = role === 'admin' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                      role === 'staff' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' :
                      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400';
                      
    const badgeDesktop = document.getElementById('role-badge-desktop');
    if (badgeDesktop) {
        badgeDesktop.textContent = roleText;
        badgeDesktop.className = `text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${roleClass}`;
    }
    const planBadgeDesktop = document.getElementById('plan-badge-desktop');
    if (planBadgeDesktop) {
        const activePremium = currentPremiumAccess.isPremiumActive;
        planBadgeDesktop.textContent = activePremium ? `Premium · ${getPremiumPlanLabel(currentPremiumAccess.premiumPlan)}` : (currentPremiumAccess.isPremiumExpired ? 'Premium · Expired' : 'Free');
        planBadgeDesktop.className = `text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${activePremium ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : currentPremiumAccess.isPremiumExpired ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`;
    }
    
    const badgeModal = document.getElementById('role-badge-modal');
    if (badgeModal) {
        badgeModal.textContent = `${roleText} · ${currentPremiumAccess.isPremiumActive ? 'Premium' : currentPremiumAccess.isPremiumExpired ? 'Expired' : 'Free'}`;
        badgeModal.className = `text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ml-2 ${roleClass}`;
    }

    const statusDetail = document.getElementById('premium-status-detail');
    if (statusDetail) {
        if (currentPremiumAccess.isPremiumActive) {
            statusDetail.textContent = currentPremiumAccess.premiumPlan === 'lifetime'
                ? `${getPremiumPlanLabel(currentPremiumAccess.premiumPlan)} · ใช้งานได้ตลอดชีพ`
                : `${getPremiumPlanLabel(currentPremiumAccess.premiumPlan)} · ใช้งานถึง ${formatJoinedDate(currentPremiumAccess.premiumUntil)}`;
            statusDetail.className = 'mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400';
        } else if (currentPremiumAccess.isPremiumExpired) {
            statusDetail.textContent = `${getPremiumPlanLabel(currentPremiumAccess.premiumPlan)} · หมดอายุ ${formatJoinedDate(currentPremiumAccess.premiumUntil)}`;
            statusDetail.className = 'mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400';
        } else {
            statusDetail.textContent = 'Free plan';
            statusDetail.className = 'mt-2 text-xs font-medium text-slate-400';
        }
    }
}

function updatePremiumUpgradeUI() {
    const upgradeBtn = document.getElementById('btn-upgrade-premium');
    if (!upgradeBtn) return;
    upgradeBtn.classList.toggle('hidden', currentPremiumAccess.isPremiumActive || isAdmin());
    upgradeBtn.textContent = currentPremiumAccess.isPremiumExpired ? 'ต่ออายุ Premium' : 'อัปเกรดเป็น Premium';
}

const PREMIUM_PLAN_OPTIONS = Object.freeze({
    monthly: { label: 'Monthly', amount: 29, duration: '29 บาท / เดือน' },
    yearly: { label: 'Yearly', amount: 199, duration: '199 บาท / ปี' },
    lifetime: { label: 'Lifetime', amount: 299, duration: '299 บาท · ชำระครั้งเดียว' }
});

function getPremiumPlanLabel(plan) {
    return PREMIUM_PLAN_OPTIONS[plan]?.label || 'Legacy Lifetime';
}

function renderPremiumPlanSelection() {
    const option = PREMIUM_PLAN_OPTIONS[selectedPremiumPlan];
    document.querySelectorAll('[data-premium-plan]').forEach(button => {
        const selected = button.dataset.premiumPlan === selectedPremiumPlan;
        button.setAttribute('aria-pressed', String(selected));
        button.textContent = selected ? 'เลือกแล้ว' : `เลือก ${getPremiumPlanLabel(button.dataset.premiumPlan)}`;
        button.classList.toggle('bg-amber-500', selected);
        button.classList.toggle('hover:bg-amber-600', selected);
        button.classList.toggle('text-white', selected);
        button.classList.toggle('border-transparent', selected);
        button.classList.toggle('border-slate-300', !selected);
        button.classList.toggle('dark:border-slate-600', !selected);
        button.classList.toggle('text-slate-700', !selected);
        button.classList.toggle('dark:text-slate-200', !selected);
    });
    document.querySelectorAll('[data-premium-card]').forEach(card => {
        const selected = card.dataset.premiumCard === selectedPremiumPlan;
        card.classList.toggle('ring-2', selected);
        card.classList.toggle('ring-amber-500', selected);
        card.classList.toggle('border-amber-300', selected);
        card.classList.toggle('dark:border-amber-700', selected);
    });
    const selectedSummary = document.getElementById('premium-selected-summary');
    if (selectedSummary) selectedSummary.textContent = `${option.label} · ${option.duration}`;
    const confirmButton = document.getElementById('btn-confirm-premium-purchase');
    if (confirmButton && !premiumPurchaseInProgress) confirmButton.textContent = `ชำระ ${option.amount} บาท และเปิดใช้ Premium`;

    if (!currentUser) return;
    const reference = `DEMO-PREMIUM-${selectedPremiumPlan.toUpperCase()}-${option.amount}-${currentUser.uid}`;
    const qrContainer = document.getElementById('premium-demo-qrcode');
    const referenceEl = document.getElementById('premium-demo-reference');
    if (referenceEl) referenceEl.textContent = reference;
    if (qrContainer) {
        qrContainer.innerHTML = '';
        if (window.QRCode) {
            new QRCode(qrContainer, {
                text: reference,
                width: 132,
                height: 132,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
        } else {
            qrContainer.textContent = reference;
        }
    }
}

function openPremiumPurchaseModal() {
    if (!currentUser || currentPremiumAccess.isPremiumActive || isAdmin()) {
        showToast('บัญชีนี้ไม่สามารถซื้อแพ็กเกจ Premium ได้', 'error');
        return;
    }

    const profileModal = document.getElementById('modal-profile');
    if (profileModal) profileModal.classList.add('hidden');

    renderPremiumPlanSelection();
    openModal(document.getElementById('modal-premium-purchase'));
}

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
}

function formatJoinedDate(createdAt) {
    if (!createdAt) return '-';
    const date = toDate(createdAt);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('th-TH');
}

function toDate(value) {
    if (!value) return new Date(NaN);
    return typeof value.toDate === 'function' ? value.toDate() : new Date(value);
}

function dateValue(value) {
    const date = toDate(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getUserSubscriptionSummary(userId) {
    const subscriptions = managementSubscriptions.filter(sub => sub.userId === userId);
    const paused = subscriptions.filter(sub => sub.status === 'paused').length;
    const monthlyTHB = subscriptions.reduce((total, sub) => {
        let amount = Number(sub.price) || 0;
        if ((sub.currency || 'THB').toUpperCase() !== 'THB') {
            amount /= state.exchangeRates[(sub.currency || '').toLowerCase()] || 1;
        }
        if (sub.cycle === 'yearly') amount /= 12;
        return total + amount;
    }, 0);
    return { count: subscriptions.length, paused, monthlyTHB };
}

function renderManagementUsers(panel) {
    const tbody = document.getElementById(`${panel}-user-list`);
    if (!tbody) return;
    const search = (document.getElementById(`${panel}-user-search`)?.value || '').trim().toLowerCase();
    const roleFilter = document.getElementById(`${panel}-role-filter`)?.value || 'all';
    const planFilter = document.getElementById(`${panel}-plan-filter`)?.value || 'all';

    const users = managementUsers.filter(user => {
        const access = resolveUserAccess(user);
        const matchesSearch = !search || (user.email || '').toLowerCase().includes(search) ||
            (user.displayName || '').toLowerCase().includes(search);
        return matchesSearch && (roleFilter === 'all' || access.role === roleFilter) &&
            (planFilter === 'all' || access.plan === planFilter);
    });

    tbody.innerHTML = '';
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-8 px-4 text-center text-slate-400">ไม่พบผู้ใช้งาน</td></tr>';
        return;
    }

    users.forEach(user => {
        const access = resolveUserAccess(user);
        const identity = getSupportUserIdentity(user);
        const summary = getUserSubscriptionSummary(user.id);
        const roleColors = access.role === 'admin' ? 'text-indigo-600' : access.role === 'staff' ? 'text-sky-600' : 'text-slate-500';
        const planBadge = access.plan === 'premium'
            ? `<span class="${access.isPremiumActive ? 'text-amber-600' : 'text-rose-600'} font-bold">Premium · ${escapeHTML(getPremiumPlanLabel(access.premiumPlan))}</span><div class="text-[10px] ${access.isPremiumActive ? 'text-emerald-500' : 'text-rose-500'}">${access.isPremiumActive ? 'Active' : 'Expired'}${access.premiumPlan !== 'lifetime' && access.premiumUntil ? ` · ${formatJoinedDate(access.premiumUntil)}` : ''}</div>`
            : '<span class="text-slate-500">Free</span>';
        const canChangeRole = panel === 'admin' && user.id !== currentUser.uid && access.role !== 'admin';
        const canOverridePremium = panel === 'admin' && user.id !== currentUser.uid && access.role !== 'admin';
        let action = panel === 'staff'
            ? '<span class="text-slate-400" title="ไม่มีข้อมูลสถานะบัญชีใน user schema">-</span>'
            : '';
        let roleAction = '';
        if (canChangeRole && access.role === 'user') {
            roleAction = `<button type="button" data-change-role="staff" data-user-id="${escapeHTML(user.id)}" data-legacy-premium="${access.legacyPremium}" class="admin-user-action admin-user-action--promote"><i class="fa-solid fa-user-shield" aria-hidden="true"></i><span>เลื่อนเป็น Staff</span></button>`;
        } else if (canChangeRole && access.role === 'staff') {
            roleAction = `<button type="button" data-change-role="user" data-user-id="${escapeHTML(user.id)}" class="admin-user-action admin-user-action--demote"><i class="fa-solid fa-user" aria-hidden="true"></i><span>เปลี่ยนเป็น User</span></button>`;
        }
        if (panel === 'admin') {
            const premiumAction = canOverridePremium ? `<button type="button" data-manage-premium="${escapeHTML(user.id)}" class="admin-user-action admin-user-action--premium"><i class="fa-solid fa-crown" aria-hidden="true"></i><span>Premium</span></button>` : '';
            action = roleAction || premiumAction ? `<div class="admin-user-action-group">${roleAction}${premiumAction}</div>` : '<span class="admin-protected-badge"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i><span>ได้รับการป้องกัน</span></span>';
        }

        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50';
        const accountCell = `<td class="py-3 px-4"><div class="font-medium">${escapeHTML(identity.primary)}</div>${identity.secondary ? `<div class="text-xs text-slate-400 truncate max-w-[190px]">${escapeHTML(identity.secondary)}</div>` : ''}</td>`;
        tr.innerHTML = panel === 'admin' ? `
            ${accountCell}<td class="py-3 px-4 font-bold ${roleColors}">${escapeHTML(access.role)}</td><td class="py-3 px-4">${access.plan === 'premium' ? `<span class="${access.isPremiumActive ? 'text-amber-600' : 'text-rose-600'} font-bold">Premium</span><div class="text-[10px] ${access.isPremiumActive ? 'text-emerald-500' : 'text-rose-500'}">${access.isPremiumActive ? 'Active' : 'Expired'}</div>` : '<span class="text-slate-500">Free</span>'}</td><td class="py-3 px-4 capitalize">${access.plan === 'premium' ? escapeHTML(getPremiumPlanLabel(access.premiumPlan)) : '-'}</td><td class="py-3 px-4 whitespace-nowrap">${formatJoinedDate(user.createdAt)}</td><td class="py-3 px-4 text-right whitespace-nowrap">${action}</td>
        ` : `
            ${accountCell}<td class="py-3 px-4 font-bold ${roleColors}">${escapeHTML(access.role)}</td><td class="py-3 px-4">${planBadge}</td><td class="py-3 px-4 whitespace-nowrap">${summary.count} รายการ (${summary.paused} พัก)<div class="text-xs text-slate-400">≈ ฿${summary.monthlyTHB.toLocaleString('th-TH', { maximumFractionDigits: 2 })}/เดือน</div></td><td class="py-3 px-4 whitespace-nowrap">${formatJoinedDate(user.createdAt)}</td><td class="py-3 px-4 text-right whitespace-nowrap">${action}</td>
        `;
        tbody.appendChild(tr);
    });
}

function getPopularServices(limit = 5) {
    const counts = new Map();
    managementSubscriptions.forEach(sub => {
        const name = (sub.name || 'ไม่ระบุบริการ').trim();
        const key = name.toLowerCase();
        const current = counts.get(key) || { name, count: 0 };
        current.count += 1;
        counts.set(key, current);
    });
    return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}

function getSupportUserIdentity(user) {
    const displayName = String(user.displayName || '').trim();
    const email = String(user.email || '').trim();
    const uidPrefix = String(user.id || '').slice(0, 6);
    return {
        primary: displayName || email || `User ${uidPrefix || '—'}`,
        secondary: displayName && email ? email : (!email && uidPrefix ? `UID ${uidPrefix}` : '')
    };
}

function renderCompactUsers(containerId, users, premiumOnly = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const compactStrip = containerId === 'staff-latest-premium';
    if (!users.length) {
        container.innerHTML = `<p class="${compactStrip ? 'py-3 text-center text-xs' : 'py-5 text-center text-sm'} text-slate-400">ยังไม่มีข้อมูล</p>`;
        return;
    }
    container.innerHTML = users.map(user => {
        const access = resolveUserAccess(user);
        const identity = getSupportUserIdentity(user);
        const date = premiumOnly ? formatJoinedDate(user.premiumSince) : formatJoinedDate(user.createdAt);
        const dateMarkup = premiumOnly || date !== '-' ? `<p class="text-[9px] text-slate-400 mt-0.5">${date}</p>` : '';
        return `<div class="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
            <div class="min-w-0"><p class="text-xs md:text-sm font-bold text-slate-800 dark:text-slate-200 truncate">${escapeHTML(identity.primary)}</p>${identity.secondary ? `<p class="text-[10px] md:text-xs text-slate-400 truncate">${escapeHTML(identity.secondary)}</p>` : ''}</div>
            <div class="text-right shrink-0"><div class="flex justify-end gap-1"><span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300">${escapeHTML(access.role)}</span><span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${access.plan === 'premium' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400'}">${access.plan === 'premium' ? 'Premium' : 'Free'}</span></div>${dateMarkup}</div>
        </div>`;
    }).join('');
}

function renderPopularServices(containerId, services, accentClass = 'bg-sky-500') {
    const container = document.getElementById(containerId);
    if (!container) return;
    const max = services[0]?.count || 1;
    container.innerHTML = services.length ? services.map((service, index) => `<div>
        <div class="flex justify-between text-xs mb-1.5"><span class="font-medium text-slate-700 dark:text-slate-300 truncate">${index + 1}. ${escapeHTML(service.name)}</span><span class="text-slate-400">${service.count}</span></div>
        <div class="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div class="h-full ${accentClass} rounded-full" style="width:${Math.max(8, service.count / max * 100)}%"></div></div>
    </div>`).join('') : '<p class="py-5 text-center text-sm text-slate-400">ยังไม่มีข้อมูล</p>';
}

function renderSupportSubscriptions(panel = 'staff') {
    const tbody = document.getElementById(`${panel}-subscription-list`);
    if (!tbody) return;
    const search = (document.getElementById(`${panel}-subscription-search`)?.value || '').trim().toLowerCase();
    const status = document.getElementById(`${panel}-subscription-status`)?.value || 'all';
    const usersById = new Map(managementUsers.map(user => [user.id, user]));
    const subscriptions = managementSubscriptions.filter(sub => {
        const user = usersById.get(sub.userId);
        const isPaused = sub.status === 'paused';
        const matchesStatus = status === 'all' || (status === 'paused' ? isPaused : !isPaused);
        const haystack = `${sub.name || ''} ${user?.email || ''} ${user?.displayName || ''}`.toLowerCase();
        return matchesStatus && (!search || haystack.includes(search));
    });
    tbody.innerHTML = subscriptions.length ? subscriptions.map(sub => {
        const user = usersById.get(sub.userId);
        const paused = sub.status === 'paused';
        return `<tr class="border-b border-slate-100 dark:border-slate-800">
            <td class="py-3 px-4 font-bold">${escapeHTML(sub.name || '-')}</td><td class="py-3 px-4"><p>${escapeHTML(user?.displayName || '-')}</p><p class="text-xs text-slate-400">${escapeHTML(user?.email || sub.userId || '-')}</p></td>
            <td class="py-3 px-4 whitespace-nowrap">${(Number(sub.price) || 0).toLocaleString('th-TH')} ${escapeHTML((sub.currency || 'THB').toUpperCase())}</td><td class="py-3 px-4">${sub.cycle === 'yearly' ? 'รายปี' : 'รายเดือน'}</td>
            <td class="py-3 px-4"><span class="px-2 py-1 rounded-full text-[10px] font-bold ${paused ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'}">${paused ? 'Paused' : 'Active'}</span></td><td class="py-3 px-4 whitespace-nowrap">${escapeHTML(sub.date || '-')}</td>
        </tr>`;
    }).join('') : '<tr><td colspan="6" class="py-8 text-center text-slate-400">ไม่พบรายการ</td></tr>';
}

function renderStaffPremium() {
    const premiumUsers = managementUsers.filter(user => resolveUserAccess(user).plan === 'premium')
        .sort((a, b) => dateValue(b.premiumSince) - dateValue(a.premiumSince));
    const tbody = document.getElementById('staff-premium-list');
    const activeCount = premiumUsers.filter(user => resolveUserAccess(user).isPremiumActive).length;
    if (document.getElementById('staff-premium-count')) document.getElementById('staff-premium-count').textContent = activeCount;
    if (document.getElementById('staff-premium-expired-count')) document.getElementById('staff-premium-expired-count').textContent = premiumUsers.length - activeCount;
    if (!tbody) return;
    tbody.innerHTML = premiumUsers.length ? premiumUsers.map(user => {
        const access = resolveUserAccess(user);
        const identity = getSupportUserIdentity(user);
        const statusClass = access.isPremiumActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400';
        const until = access.premiumPlan === 'lifetime' ? 'ตลอดชีพ' : formatJoinedDate(access.premiumUntil);
        return `<tr class="border-b border-slate-100 dark:border-slate-800"><td class="py-3 px-4"><p class="font-bold">${escapeHTML(identity.primary)}</p>${identity.secondary ? `<p class="text-xs text-slate-400">${escapeHTML(identity.secondary)}</p>` : ''}</td><td class="py-3 px-4 capitalize">${escapeHTML(access.role)}</td><td class="py-3 px-4 font-semibold">${escapeHTML(getPremiumPlanLabel(access.premiumPlan))}${access.legacyLifetime ? '<div class="text-[10px] text-slate-400">Legacy</div>' : ''}</td><td class="py-3 px-4"><span class="px-2 py-1 rounded-full text-[10px] font-bold ${statusClass}">${access.isPremiumActive ? 'Active' : 'Expired'}</span></td><td class="py-3 px-4 whitespace-nowrap">${until}</td><td class="py-3 px-4 whitespace-nowrap">${formatJoinedDate(user.premiumSince)}</td></tr>`;
    }).join('') : '<tr><td colspan="6" class="py-8 text-center text-slate-400">ยังไม่มี Premium user</td></tr>';
}

function renderStaffBackOffice() {
    if (!isStaff()) return;
    const plans = managementUsers.reduce((result, user) => {
        result[resolveUserAccess(user).plan] += 1;
        return result;
    }, { free: 0, premium: 0 });
    const active = managementSubscriptions.filter(sub => sub.status !== 'paused').length;
    const paused = managementSubscriptions.length - active;
    const subscriptionTotal = managementSubscriptions.length;
    const activePercent = subscriptionTotal > 0 ? active / subscriptionTotal * 100 : 0;
    const pausedPercent = subscriptionTotal > 0 ? paused / subscriptionTotal * 100 : 0;
    const setText = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    setText('staff-stat-users', managementUsers.length.toLocaleString('th-TH'));
    setText('staff-stat-plans', `${plans.premium.toLocaleString('th-TH')} / ${managementUsers.length.toLocaleString('th-TH')}`);
    setText('staff-stat-subscriptions', managementSubscriptions.length.toLocaleString('th-TH'));
    setText('staff-stat-active', active.toLocaleString('th-TH'));
    setText('staff-stat-paused', paused.toLocaleString('th-TH'));
    setText('staff-stat-updated', new Date().toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
    setText('staff-subscription-active-ratio', `${active.toLocaleString('th-TH')} — ${activePercent.toFixed(1)}%`);
    setText('staff-subscription-paused-ratio', `${paused.toLocaleString('th-TH')} — ${pausedPercent.toFixed(1)}%`);
    setText('staff-subscription-status-total', subscriptionTotal.toLocaleString('th-TH'));
    const activeBar = document.getElementById('staff-subscription-active-bar');
    const pausedBar = document.getElementById('staff-subscription-paused-bar');
    if (activeBar) activeBar.style.width = `${activePercent}%`;
    if (pausedBar) pausedBar.style.width = `${pausedPercent}%`;

    const latestUsers = [...managementUsers].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)).slice(0, 4);
    const latestPremium = managementUsers.filter(user => resolveUserAccess(user).plan === 'premium').sort((a, b) => dateValue(b.premiumSince) - dateValue(a.premiumSince)).slice(0, 1);
    renderCompactUsers('staff-latest-users', latestUsers);
    renderCompactUsers('staff-latest-premium', latestPremium, true);
    const popular = getPopularServices();
    renderPopularServices('staff-popular-services', popular);
    renderPopularServices('staff-report-services', popular);

    const totalPlans = Math.max(1, plans.free + plans.premium);
    const premiumAdoption = plans.premium / totalPlans * 100;
    const premiumDegrees = premiumAdoption / 100 * 360;
    const chart = document.getElementById('staff-plan-chart');
    if (chart) chart.style.background = `conic-gradient(#f59e0b 0deg ${premiumDegrees}deg, #38bdf8 ${premiumDegrees}deg 360deg)`;
    const legend = document.getElementById('staff-plan-legend');
    if (legend) legend.innerHTML = `<div class="flex justify-between"><span><i class="fa-solid fa-circle text-sky-400 text-[8px] mr-2"></i>Free</span><b>${plans.free}</b></div><div class="flex justify-between"><span><i class="fa-solid fa-circle text-amber-500 text-[8px] mr-2"></i>Premium</span><b>${plans.premium}</b></div>`;
    setText('staff-premium-adoption', `Premium adoption ${premiumAdoption.toFixed(1)}%`);

    const report = document.getElementById('staff-report-summary');
    if (report) report.innerHTML = [
        ['อัตรา Premium', `${premiumAdoption.toFixed(1)}%`, 'fa-crown', 'text-amber-500'],
        ['Subscriptions / User', (managementSubscriptions.length / Math.max(1, managementUsers.length)).toFixed(1), 'fa-receipt', 'text-indigo-500'],
        ['Active rate', `${(active / Math.max(1, managementSubscriptions.length) * 100).toFixed(1)}%`, 'fa-circle-check', 'text-emerald-500']
    ].map(([label, value, icon, color]) => `<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5"><div class="flex justify-between"><p class="text-xs text-slate-500">${label}</p><i class="fa-solid ${icon} ${color}"></i></div><p class="text-2xl font-extrabold text-slate-900 dark:text-white mt-3">${value}</p></div>`).join('');
    const accounts = document.getElementById('staff-report-accounts');
    if (accounts) {
        const roles = managementUsers.reduce((result, user) => { result[resolveUserAccess(user).role] += 1; return result; }, { user: 0, staff: 0, admin: 0 });
        accounts.innerHTML = Object.entries(roles).map(([role, count]) => `<div><div class="flex justify-between text-sm mb-2"><span class="capitalize text-slate-600 dark:text-slate-300">${role}</span><b>${count}</b></div><div class="h-2 bg-slate-100 dark:bg-slate-800 rounded-full"><div class="h-full bg-sky-500 rounded-full" style="width:${count / Math.max(1, managementUsers.length) * 100}%"></div></div></div>`).join('');
    }
    renderSupportSubscriptions('staff');
    renderStaffPremium();
    renderManagementUsers('staff');
}

function renderAdminRatioList(containerId, entries, total) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = entries.map(([label, value, color = 'bg-amber-500']) => `<div><div class="flex justify-between text-xs mb-1.5"><span class="text-slate-600 dark:text-slate-300">${escapeHTML(label)}</span><b class="text-slate-800 dark:text-white">${value}</b></div><div class="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div class="h-full ${color} rounded-full" style="width:${value / Math.max(1, total) * 100}%"></div></div></div>`).join('');
}

function getAdminMetrics() {
    const roles = { user: 0, staff: 0, admin: 0 };
    const premium = { total: 0, monthly: 0, yearly: 0, lifetime: 0, active: 0, expired: 0 };
    managementUsers.forEach(user => {
        const access = resolveUserAccess(user);
        roles[access.role] += 1;
        if (access.plan === 'premium') {
            premium.total += 1;
            premium[access.premiumPlan] += 1;
            premium[access.isPremiumActive ? 'active' : 'expired'] += 1;
        }
    });
    const activeSubscriptions = managementSubscriptions.filter(sub => sub.status !== 'paused').length;
    return { roles, premium, activeSubscriptions, pausedSubscriptions: managementSubscriptions.length - activeSubscriptions };
}

function renderAdminPremium() {
    const metrics = getAdminMetrics();
    const summary = document.getElementById('admin-premium-summary');
    if (summary) summary.innerHTML = [
        ['Monthly', metrics.premium.monthly], ['Yearly', metrics.premium.yearly], ['Lifetime', metrics.premium.lifetime], ['Active', metrics.premium.active], ['Expired', metrics.premium.expired]
    ].map(([label, value]) => `<div class="admin-kpi"><p>${label}</p><strong>${value.toLocaleString('th-TH')}</strong></div>`).join('');

    const filter = document.getElementById('admin-premium-filter')?.value || 'all';
    const users = managementUsers.filter(user => {
        const access = resolveUserAccess(user);
        if (access.plan !== 'premium') return false;
        if (filter === 'all') return true;
        if (filter === 'active') return access.isPremiumActive;
        if (filter === 'expired') return access.isPremiumExpired;
        return access.premiumPlan === filter;
    }).sort((a, b) => dateValue(b.premiumSince) - dateValue(a.premiumSince));
    const tbody = document.getElementById('admin-premium-list');
    if (tbody) tbody.innerHTML = users.length ? users.map(user => {
        const access = resolveUserAccess(user);
        const identity = getSupportUserIdentity(user);
        const protectedAccount = user.id === currentUser.uid || access.role === 'admin';
        return `<tr class="border-b border-slate-100 dark:border-slate-800"><td class="py-3 px-4"><p class="font-bold">${escapeHTML(identity.primary)}</p>${identity.secondary ? `<p class="text-xs text-slate-400">${escapeHTML(identity.secondary)}</p>` : ''}</td><td class="py-3 px-4">${escapeHTML(getPremiumPlanLabel(access.premiumPlan))}${access.legacyLifetime ? '<span class="ml-1 text-[9px] text-slate-400">Legacy</span>' : ''}</td><td class="py-3 px-4 whitespace-nowrap">${formatJoinedDate(user.premiumSince)}</td><td class="py-3 px-4 whitespace-nowrap">${access.premiumPlan === 'lifetime' ? 'ตลอดชีพ' : formatJoinedDate(access.premiumUntil)}</td><td class="py-3 px-4"><span class="px-2 py-1 rounded-full text-[10px] font-bold ${access.isPremiumActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400'}">${access.isPremiumActive ? 'Active' : 'Expired'}</span></td><td class="py-3 px-4 text-right">${protectedAccount ? '<span class="text-[10px] text-slate-400">Protected</span>' : `<button data-manage-premium="${escapeHTML(user.id)}" class="px-2.5 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/20 text-xs font-bold text-amber-700 dark:text-amber-400">จัดการ</button>`}</td></tr>`;
    }).join('') : '<tr><td colspan="6" class="py-8 text-center text-slate-400">ไม่พบ Premium user</td></tr>';

    const logList = document.getElementById('admin-audit-log-list');
    if (logList) {
        const usersById = new Map(managementUsers.map(user => [user.id, user]));
        logList.innerHTML = managementAuditLogs.length ? managementAuditLogs.slice(0, 10).map(log => {
            const target = getSupportUserIdentity(usersById.get(log.targetUserId) || { id: log.targetUserId });
            const before = log.previousPlan === 'premium' ? getPremiumPlanLabel(log.previousPremiumPlan) : 'Free';
            const after = log.newPlan === 'premium' ? getPremiumPlanLabel(log.newPremiumPlan) : 'Free';
            return `<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5"><div class="min-w-0"><p class="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">${escapeHTML(target.primary)} · ${escapeHTML(before)} → ${escapeHTML(after)}</p><p class="text-[10px] text-slate-500 truncate">${escapeHTML(log.reason || '-')}</p></div><p class="text-[10px] text-slate-400 whitespace-nowrap">${formatJoinedDate(log.createdAt)}</p></div>`;
        }).join('') : '<p class="py-4 text-center text-sm text-slate-400">ยังไม่มี Premium override</p>';
    }
}

function renderAdminBackOffice() {
    if (!isAdmin()) return;
    const metrics = getAdminMetrics();
    const totalUsers = managementUsers.length;
    const setText = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    setText('admin-stat-users', totalUsers.toLocaleString('th-TH'));
    setText('admin-stat-staff', metrics.roles.staff.toLocaleString('th-TH'));
    setText('admin-stat-premium', metrics.premium.total.toLocaleString('th-TH'));
    setText('admin-stat-subscriptions', managementSubscriptions.length.toLocaleString('th-TH'));
    setText('admin-stat-active', metrics.activeSubscriptions.toLocaleString('th-TH'));
    renderAdminRatioList('admin-role-overview', [['User', metrics.roles.user, 'bg-slate-400'], ['Staff', metrics.roles.staff, 'bg-sky-500'], ['Admin', metrics.roles.admin, 'bg-amber-500']], totalUsers);
    renderAdminRatioList('admin-premium-overview', [['Monthly', metrics.premium.monthly], ['Yearly', metrics.premium.yearly], ['Lifetime', metrics.premium.lifetime], ['Expired', metrics.premium.expired, 'bg-rose-500']], metrics.premium.total);
    renderAdminRatioList('admin-subscription-overview', [['Active', metrics.activeSubscriptions, 'bg-emerald-500'], ['Paused', metrics.pausedSubscriptions, 'bg-amber-500']], managementSubscriptions.length);
    renderCompactUsers('admin-latest-users', [...managementUsers].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)).slice(0, 5));

    const issues = managementUsers.map(user => {
        const access = resolveUserAccess(user);
        const reasons = [];
        if (access.legacyPremium) reasons.push('Legacy Premium');
        if (!String(user.email || '').trim()) reasons.push('ไม่มีอีเมล');
        return { user, reasons };
    }).filter(item => item.reasons.length).slice(0, 5);
    const issueContainer = document.getElementById('admin-account-issues');
    if (issueContainer) issueContainer.innerHTML = issues.length ? issues.map(({ user, reasons }) => { const identity = getSupportUserIdentity(user); return `<div class="flex justify-between gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 px-3 py-2"><div class="min-w-0"><p class="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">${escapeHTML(identity.primary)}</p><p class="text-[10px] text-amber-700 dark:text-amber-400">${escapeHTML(reasons.join(' · '))}</p></div><i class="fa-solid fa-triangle-exclamation text-amber-500 text-xs mt-1"></i></div>`; }).join('') : '<p class="py-4 text-center text-sm text-slate-400">ไม่พบบัญชีที่เข้าเงื่อนไข</p>';

    renderManagementUsers('admin');
    renderSupportSubscriptions('admin');
    renderAdminPremium();
    const adoption = metrics.premium.total / Math.max(1, totalUsers) * 100;
    const reports = document.getElementById('admin-report-summary');
    if (reports) reports.innerHTML = [['Premium adoption', `${adoption.toFixed(1)}%`], ['Subscriptions', managementSubscriptions.length], ['Active', metrics.activeSubscriptions], ['Paused', metrics.pausedSubscriptions]].map(([label, value]) => `<div class="admin-kpi"><p>${label}</p><strong>${value}</strong></div>`).join('');
    renderAdminRatioList('admin-report-accounts', [['User', metrics.roles.user, 'bg-slate-400'], ['Staff', metrics.roles.staff, 'bg-sky-500'], ['Admin', metrics.roles.admin], ['Free', totalUsers - metrics.premium.total, 'bg-slate-300'], ['Premium', metrics.premium.total], ['Monthly', metrics.premium.monthly], ['Yearly', metrics.premium.yearly], ['Lifetime', metrics.premium.lifetime], ['Active Premium', metrics.premium.active, 'bg-emerald-500'], ['Expired Premium', metrics.premium.expired, 'bg-rose-500']], totalUsers);
    renderPopularServices('admin-report-services', getPopularServices(), 'bg-amber-500');
}

function toDatetimeLocalValue(value) {
    const date = toDate(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function updateAdminPremiumExpiry(plan, preferredExpiry = null) {
    const wrap = document.getElementById('admin-premium-expiry-wrap');
    const input = document.getElementById('admin-premium-until');
    const needsExpiry = plan === 'monthly' || plan === 'yearly';
    wrap?.classList.toggle('hidden', !needsExpiry);
    if (!input) return;
    input.disabled = !needsExpiry;
    input.required = needsExpiry;
    if (!needsExpiry) {
        input.value = '';
        return;
    }
    const expiry = preferredExpiry || calculatePremiumUntil(plan);
    input.value = toDatetimeLocalValue(expiry);
}

function openAdminPremiumModal(userId) {
    if (!isAdmin() || userId === currentUser?.uid) {
        showToast('ไม่สามารถแก้ Premium ของบัญชีนี้ได้', 'error');
        return;
    }
    const user = managementUsers.find(item => item.id === userId);
    if (!user || resolveUserAccess(user).role === 'admin') {
        showToast('บัญชี Admin ได้รับการป้องกัน', 'error');
        return;
    }
    adminPremiumTargetId = userId;
    const access = resolveUserAccess(user);
    const identity = getSupportUserIdentity(user);
    document.getElementById('admin-premium-target').textContent = identity.secondary ? `${identity.primary} · ${identity.secondary}` : identity.primary;
    document.getElementById('admin-premium-current').textContent = access.plan === 'premium'
        ? `Premium ${getPremiumPlanLabel(access.premiumPlan)} · ${access.isPremiumActive ? 'Active' : 'Expired'} · ${access.premiumPlan === 'lifetime' ? 'ตลอดชีพ' : `ถึง ${formatJoinedDate(access.premiumUntil)}`}`
        : 'Free';
    const planSelect = document.getElementById('admin-premium-plan');
    planSelect.value = access.plan === 'premium' ? access.premiumPlan : 'free';
    document.getElementById('admin-premium-reason').value = '';
    updateAdminPremiumExpiry(planSelect.value, access.premiumUntil);
    openModal(document.getElementById('modal-admin-premium'));
}

async function submitAdminPremiumOverride(event) {
    event.preventDefault();
    if (!isAdmin() || !adminPremiumTargetId || adminPremiumTargetId === currentUser?.uid) return;
    const targetUser = managementUsers.find(user => user.id === adminPremiumTargetId);
    if (!targetUser || resolveUserAccess(targetUser).role === 'admin') return;
    const selected = document.getElementById('admin-premium-plan').value;
    const reason = document.getElementById('admin-premium-reason').value.trim();
    if (!reason) {
        showToast('กรุณาระบุเหตุผลในการแก้ไข', 'error');
        return;
    }
    const plan = selected === 'free' ? 'free' : 'premium';
    const expiryValue = document.getElementById('admin-premium-until').value;
    const override = { plan, premiumPlan: plan === 'premium' ? selected : null, premiumUntil: null };
    if (selected === 'monthly' || selected === 'yearly') {
        const expiry = new Date(expiryValue);
        if (!expiryValue || Number.isNaN(expiry.getTime())) {
            showToast('กรุณาระบุวันหมดอายุที่ถูกต้อง', 'error');
            return;
        }
        override.premiumUntil = expiry;
    }
    const oldRole = targetUser.role || 'user';
    const previous = {
        plan: targetUser.plan === 'premium' || oldRole === 'premium' ? 'premium' : 'free',
        premiumPlan: targetUser.premiumPlan || null,
        premiumUntil: targetUser.premiumUntil || null
    };
    const button = document.getElementById('btn-confirm-admin-premium');
    button.disabled = true;
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i>กำลังบันทึก...';
    try {
        await overrideUserPremium(currentUser.uid, adminPremiumTargetId, previous, override, reason);
        closeModal(document.getElementById('modal-admin-premium'));
        adminPremiumTargetId = null;
        showToast('อัปเดต Premium และบันทึก Audit Log แล้ว', 'success');
        await loadManagementUsers('admin', true);
    } catch (error) {
        console.error('Premium override failed:', error);
        showToast('Premium override ไม่สำเร็จ', 'error');
    } finally {
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

export async function loadManagementUsers(panel, force = false) {
    const allowed = panel === 'admin' ? isAdmin() : isStaff();
    if (!allowed) {
        showToast('ไม่มีสิทธิ์เข้าถึง', 'error');
        navigateToView(isStaff() ? 'staff-overview' : isAdmin() ? 'admin-overview' : 'dashboard');
        return;
    }
    try {
        if (!managementDataLoaded || force) {
            if (panel === 'admin') {
                const [users, subscriptions, auditLogs] = await Promise.all([
                    getAllUsers(), getAllSubscriptionsForSupport(), getAdminAuditLogs().catch(error => {
                        console.warn('Admin audit logs are unavailable until the updated Firestore Rules are deployed.', error);
                        return [];
                    })
                ]);
                managementUsers = users;
                managementSubscriptions = subscriptions.map(normalizeSubscriptionForRuntime);
                managementAuditLogs = auditLogs;
            } else {
                const [users, subscriptions] = await Promise.all([
                    getAllUsers(), getAllSubscriptionsForSupport()
                ]);
                managementUsers = users;
                managementSubscriptions = subscriptions.map(normalizeSubscriptionForRuntime);
            }
            managementDataLoaded = true;
        }
        if (panel === 'staff') renderStaffBackOffice();
        else renderAdminBackOffice();
    } catch(err) {
        console.error("Management load error:", err);
        showToast('ไม่สามารถดึงข้อมูลผู้ใช้งานได้', 'error');
    }
}

async function changeRole(userId, newRole, legacyPremium = false) {
    if (!isAdmin()) return;
    if (userId === currentUser.uid || (newRole !== 'user' && newRole !== 'staff')) {
        showToast('การเปลี่ยน Role ไม่ถูกต้อง', 'error');
        return;
    }
    try {
        await updateUserRole(userId, newRole, legacyPremium);
        showToast('อัปเดต Role สำเร็จ', 'success');
        await loadManagementUsers('admin', true);
    } catch(err) {
        console.error("Change Role Error:", err);
        showToast('อัปเดต Role ไม่สำเร็จ', 'error');
    }
}

function navigateToView(view) {
    if (!canAccessView(view, currentUserRole)) {
        showToast('ไม่มีสิทธิ์เข้าถึง', 'error');
        const fallbackView = isStaff() ? 'staff-overview' : isAdmin() ? 'admin-overview' : 'dashboard';
        updateWorkspaceWidth(fallbackView);
        switchView(fallbackView);
        if (isStaff()) loadManagementUsers('staff');
        if (isAdmin()) loadManagementUsers('admin');
        return false;
    }
    updateWorkspaceWidth(view);
    switchView(view);
    if (view.startsWith('admin-')) loadManagementUsers('admin');
    if (view.startsWith('staff-')) loadManagementUsers('staff');
    return true;
}

function updateWorkspaceWidth(view) {
    document.getElementById('app-content-container')?.classList.toggle('staff-overview-width', view === 'staff-overview');
    document.getElementById('app-content-container')?.classList.toggle('admin-workspace-width', view.startsWith('admin-'));
}

function updateUI() {
    // 1. Filter and Sort Subs
    let filteredSubs = [...currentSubs];
    
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        filteredSubs = filteredSubs.filter(s => s.name.toLowerCase().includes(q));
    }
    
    if (state.filterCategory && state.filterCategory !== 'all') {
        filteredSubs = filteredSubs.filter(s => s.category === state.filterCategory);
    }

    filteredSubs.sort((a, b) => {
        const getThb = (sub) => {
            const code = (sub.currency || 'THB').toLowerCase();
            const rate = state.exchangeRates[code] || 1;
            return code === 'thb' ? sub.price : sub.price / rate;
        };

        if (state.sortMethod === 'price-desc') {
            return getThb(b) - getThb(a);
        }
        if (state.sortMethod === 'price-asc') {
            return getThb(a) - getThb(b);
        }
        if (state.sortMethod === 'name') {
            return a.name.localeCompare(b.name, 'th');
        }
        // default: upcoming
        const dateA = calculateNextBillingDate(a.date, a.cycle);
        const dateB = calculateNextBillingDate(b.date, b.cycle);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA - dateB;
    });

    let totalMonthly = 0;
    let totalYearly = 0;
    let maxSub = null;
    let maxSubPrice = 0;
    let savedMonthly = 0;
    
    // Update settings exchange date if exists
    const exchangeDateEl = document.getElementById('settings-exchange-date');
    if (exchangeDateEl) {
        const cacheDate = localStorage.getItem('exchangeRateDate');
        exchangeDateEl.textContent = cacheDate || 'ยังไม่มีข้อมูล';
    }

    currentSubs.forEach(sub => {
        let currencyCode = (sub.currency || 'THB').toLowerCase();
        let thbPrice = parseFloat(sub.price);
        if (currencyCode !== 'thb') {
            const rate = state.exchangeRates[currencyCode] || 1;
            thbPrice = thbPrice / rate; // price in foreign currency / (foreign per 1 THB) = THB
        }
        
        let excessCost = parseFloat(sub.excessCost) || 0;
        
        // Calculate monthly equivalent for both active and paused
        let monthlyEquiv = sub.cycle === 'monthly' ? (thbPrice + excessCost) : (thbPrice / 12) + excessCost;
        
        if (sub.status === 'paused') {
            savedMonthly += monthlyEquiv;
            return; // Skip adding to totals
        }
        
        if (sub.cycle === 'monthly') {
            totalMonthly += thbPrice + excessCost;
            totalYearly += (thbPrice * 12) + excessCost;
        } else {
            totalYearly += thbPrice + excessCost;
            totalMonthly += (thbPrice / 12) + excessCost;
        }

        // For insights: find max spender
        if (monthlyEquiv > maxSubPrice) {
            maxSubPrice = monthlyEquiv;
            maxSub = sub;
        }
    });

    // 3. Update Dashboard Numbers
    const totalEl = document.getElementById('summary-total-cost');
    const labelEl = document.getElementById('summary-cycle-label');
    
    const budgetLabel = document.getElementById('budget-label');
    const budgetInput = document.getElementById('budget-input');
    
    let activeTotal = state.cycle === 'monthly' ? totalMonthly : totalYearly;
    let activeBudget = state.cycle === 'monthly' ? state.budget : state.budget * 12;

    totalEl.textContent = activeTotal.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
    labelEl.textContent = state.cycle === 'monthly' ? '/ เดือน' : '/ ปี';
    if(budgetLabel) {
        budgetLabel.innerHTML = state.cycle === 'monthly' ? 'งบประมาณ/เดือน <i class="fa-solid fa-pen text-[10px] ml-1 opacity-50"></i>' : 'งบประมาณ/ปี <i class="fa-solid fa-pen text-[10px] ml-1 opacity-50"></i>';
    }

    // Update Exchange rate display
    const rateEl = document.getElementById('exchange-rate-display');
    if (rateEl) rateEl.textContent = `เรท: USD 1 = ${(1/state.exchangeRates.usd).toFixed(2)} THB`;

    // Check Notifications (only actually notifies if permitted and needed)
    const activeSubs = currentSubs.filter(s => s.status !== 'paused');
    const pausedSubs = currentSubs.filter(s => s.status === 'paused');
    checkUpcomingNotifications(activeSubs, state.exchangeRates);
    
    // Update Smart Greeting
    renderSmartGreeting(activeSubs, activeTotal, activeBudget);

    // Update the input value without triggering event listener (only if not currently focused)
    if (document.activeElement !== budgetInput) {
        budgetInput.value = activeBudget;
    }

    // Update Budget Progress
    const pBar = document.getElementById('budget-progress');
    const pText = document.getElementById('budget-percentage');
    const warn = document.getElementById('budget-warning');
    
    if (activeBudget > 0) {
        let pct = (activeTotal / activeBudget) * 100;
        pText.textContent = `${pct.toFixed(0)}%`;
        pBar.style.width = `${Math.min(pct, 100)}%`;
        
        // Reset classes
        pBar.classList.remove('bg-emerald-400', 'bg-amber-400', 'bg-rose-500');
        pText.classList.remove('bg-emerald-500/20', 'text-emerald-200', 'bg-amber-500/20', 'text-amber-200', 'bg-rose-500/20', 'text-rose-200');
        
        if (pct >= 100) {
            pBar.classList.add('bg-rose-500');
            warn.classList.remove('hidden');
            pText.classList.add('bg-rose-500/20', 'text-rose-200');
        } else if (pct >= 80) {
            pBar.classList.add('bg-amber-400');
            warn.classList.add('hidden');
            pText.classList.add('bg-amber-500/20', 'text-amber-200');
        } else {
            pBar.classList.add('bg-emerald-400');
            warn.classList.add('hidden');
            pText.classList.add('bg-emerald-500/20', 'text-emerald-200');
        }
    } else {
        pBar.style.width = '0%';
        pText.textContent = '0%';
        warn.classList.add('hidden');
    }

    // 4. Update Insights
    const topSpenderName = document.getElementById('insight-top-spender');
    const topSpenderPrice = document.getElementById('insight-top-spender-price');
    if (topSpenderName && topSpenderPrice) {
        if (maxSub) {
            topSpenderName.textContent = maxSub.name;
            topSpenderPrice.textContent = `${maxSubPrice.toLocaleString(undefined, {minimumFractionDigits:2})} บ./ด.`;
        } else {
            topSpenderName.textContent = '-';
            topSpenderPrice.textContent = '-';
        }
    }
    
    const savedMoneyText = savedMonthly.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
    ['insight-saved-money', 'insight-saved-money-mobile'].forEach(id => {
        const savedMoneyEl = document.getElementById(id);
        if (savedMoneyEl) savedMoneyEl.textContent = savedMoneyText;
    });

    // Removed duplicate activeCountEl declaration

    // 5. Render Components
    const handleQrClick = (sub) => {
        if (!hasPremiumAccess()) {
            showToast('Feature นี้สำหรับ Premium User เท่านั้น', 'error');
            return;
        }
        const currencyCode = (sub.currency || 'THB').toLowerCase();
        let thbPrice = parseFloat(sub.price);
        if (currencyCode !== 'thb') {
            const rate = state.exchangeRates[currencyCode] || 1;
            thbPrice = thbPrice / rate;
        }
        openSplitBillModal(sub, thbPrice, openModal);
    };

    const handlePayClick = async (sub) => {
        try {
            await recordSubscriptionPayment(currentUser.uid, sub.id, sub.date);
            showToast(`ชำระเงินและบันทึกประวัติ ${sub.name} แล้ว`, 'success');
        } catch (err) {
            showToast('อัปเดตไม่สำเร็จ กรุณาลองใหม่', 'error');
        }
    };

    const handleQuickAction = async (sub, newStatus) => {
        try {
            await updateSubscription(sub.id, { status: newStatus });
            showToast(newStatus === 'paused' ? `พักการใช้งาน ${sub.name} แล้ว` : `กลับมาใช้งาน ${sub.name} แล้ว`, 'success');
        } catch (err) {
            showToast('อัปเดตไม่สำเร็จ', 'error');
        }
    };

    document.getElementById('list-count').textContent = currentSubs.length;
    renderSubscriptionList(
        filteredSubs, 
        openEditModal, 
        handleQrClick,
        (sub) => {
            state.editingSubId = sub.id;
            openModal(document.getElementById('modal-confirm'));
        },
        handlePayClick,
        state.exchangeRates
    );
    renderUpcomingList(activeSubs, handlePayClick, handleQrClick, state.exchangeRates);
    
    const subsToList = state.activeSubsTab === 'paused' ? pausedSubs : activeSubs;
    const activeLabelEl = document.getElementById('insight-active-label');
    if (activeLabelEl) {
        activeLabelEl.textContent = state.activeSubsTab === 'paused' ? 'บริการที่พักไว้' : 'บริการที่ใช้งาน';
    }
    
    // Update active count correctly depending on tab
    const activeCountEl = document.getElementById('insight-active-count');
    if (activeCountEl) {
        activeCountEl.textContent = subsToList.length;
    }

    renderActiveSubsList(subsToList, state.exchangeRates, handleQuickAction);
    renderDonutChart(activeSubs, state.chartMode, state.exchangeRates);
    
    // Update History Components
    renderHistoryList(currentHistory, state.exchangeRates);
    renderLatestTransactions(currentHistory, state.exchangeRates);
    renderMonthlyCalendar(activeSubs);
    renderFullCalendar(activeSubs);
    renderAnalyticsChart(activeSubs, state.exchangeRates);
}


// --- Event Listeners Setup ---
function setupEventListeners() {
    initFullCalendarControls();
    initSettings({
        getCategories: () => state.customCategories,
        onAddCategory: addCustomCategory,
        onDeleteCategory: deleteCustomCategory,
        notify: showToast
    });
    
    // Auth Forms
    const linkRegister = document.getElementById('link-to-register');
    if (linkRegister) linkRegister.addEventListener('click', (e) => {
        e.preventDefault();
        showRegisterScreen();
    });
    const linkLogin = document.getElementById('link-to-login');
    if (linkLogin) linkLogin.addEventListener('click', (e) => {
        e.preventDefault();
        showAuthScreen();
    });

    const formLogin = document.getElementById('form-login');
    if (formLogin) formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        const btn = e.target.querySelector('button');
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังเข้าสู่ระบบ...';
        btn.disabled = true;
        try {
            await login(email, pass);
            showToast('เข้าสู่ระบบสำเร็จ!', 'success');
        } catch (error) {
            showToast(getLoginErrorMessage(error), 'error');
            console.error(error);
        } finally {
            btn.innerHTML = 'เข้าสู่ระบบ';
            btn.disabled = false;
        }
    });

    const formRegister = document.getElementById('form-register');
    if (formRegister) formRegister.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const pass = document.getElementById('register-password').value;
        const btn = e.target.querySelector('button');
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังสร้างบัญชี...';
        btn.disabled = true;
        try {
            await register(name, email, pass);
            showToast('สมัครสมาชิกสำเร็จ!', 'success');
        } catch (error) {
            showToast(error.message, 'error');
            console.error(error);
        } finally {
            btn.innerHTML = 'สมัครสมาชิก';
            btn.disabled = false;
        }
    });

    const btnGoogleLogin = document.getElementById('btn-google-login');
    if (btnGoogleLogin) btnGoogleLogin.addEventListener('click', async () => {
        try {
            await loginWithGoogle();
        } catch (error) {
            showToast('เข้าสู่ระบบด้วย Google ล้มเหลว', 'error');
            console.error(error);
        }
    });

    // Logout
    const logoutBtns = [
        document.getElementById('btn-logout-desktop'), document.getElementById('btn-logout-mobile'),
        document.getElementById('btn-staff-logout-desktop'), document.getElementById('btn-staff-logout-mobile'),
        document.getElementById('btn-staff-logout-settings'), document.getElementById('btn-admin-logout-desktop'),
        document.getElementById('btn-admin-logout-mobile'), document.getElementById('btn-admin-logout-settings')
    ];
    logoutBtns.forEach(btn => {
        if (btn) btn.addEventListener('click', logout);
    });

    // Navigation
    document.querySelectorAll('[data-view]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.currentTarget.dataset.view;
            navigateToView(view);
        });
    });

    const btnAdminRefresh = document.getElementById('btn-admin-refresh');
    if (btnAdminRefresh) {
        btnAdminRefresh.addEventListener('click', () => loadManagementUsers('admin', true));
    }
    const btnStaffRefresh = document.getElementById('btn-staff-refresh');
    if (btnStaffRefresh) {
        btnStaffRefresh.addEventListener('click', () => loadManagementUsers('staff', true));
    }

    for (const panel of ['staff', 'admin']) {
        for (const suffix of ['subscription-search', 'subscription-status']) {
            document.getElementById(`${panel}-${suffix}`)?.addEventListener('input', () => renderSupportSubscriptions(panel));
            document.getElementById(`${panel}-${suffix}`)?.addEventListener('change', () => renderSupportSubscriptions(panel));
        }
    }

    // btn-staff-theme-mobile is already bound once by initTheme().
    for (const id of ['btn-staff-theme-settings', 'btn-admin-theme-settings']) {
        document.getElementById(id)?.addEventListener('click', () => {
            changeTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
        });
    }
    for (const panel of ['admin', 'staff']) {
        for (const suffix of ['user-search', 'role-filter', 'plan-filter']) {
            document.getElementById(`${panel}-${suffix}`)?.addEventListener('input', () => renderManagementUsers(panel));
            document.getElementById(`${panel}-${suffix}`)?.addEventListener('change', () => renderManagementUsers(panel));
        }
    }

    document.getElementById('admin-user-list')?.addEventListener('click', (event) => {
        const premiumButton = event.target.closest('[data-manage-premium]');
        if (premiumButton) {
            openAdminPremiumModal(premiumButton.dataset.managePremium);
            return;
        }
        const roleButton = event.target.closest('[data-change-role]');
        if (roleButton) changeRole(roleButton.dataset.userId, roleButton.dataset.changeRole, roleButton.dataset.legacyPremium === 'true');
    });
    document.getElementById('admin-premium-list')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-manage-premium]');
        if (button) openAdminPremiumModal(button.dataset.managePremium);
    });
    document.getElementById('admin-premium-filter')?.addEventListener('change', renderAdminPremium);
    document.getElementById('admin-premium-plan')?.addEventListener('change', event => updateAdminPremiumExpiry(event.target.value));
    document.getElementById('form-admin-premium')?.addEventListener('submit', submitAdminPremiumOverride);
    document.getElementById('btn-close-admin-premium')?.addEventListener('click', () => {
        adminPremiumTargetId = null;
        closeModal(document.getElementById('modal-admin-premium'));
    });

    window.addEventListener('hashchange', () => {
        const requestedView = window.location.hash.replace(/^#\/?/, '');
        if (requestedView) navigateToView(requestedView);
    });

    // History Toggle Handlers
    const btnHistList = document.getElementById('btn-hist-list');
    const btnHistCalendar = document.getElementById('btn-hist-calendar');
    const historyView = document.getElementById('history-list-container');
    const monthlyView = document.getElementById('monthly-calendar-container');
    
    if (btnHistList && btnHistCalendar) {
        btnHistList.addEventListener('click', () => {
            btnHistList.className = 'flex-1 sm:flex-none px-4 py-1.5 text-sm sm:text-xs font-medium rounded-md bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-white transition-all';
            btnHistCalendar.className = 'flex-1 sm:flex-none px-4 py-1.5 text-sm sm:text-xs font-medium rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 transition-all';
            historyView.classList.remove('hidden');
            monthlyView.classList.add('hidden');
        });

        btnHistCalendar.addEventListener('click', () => {
            btnHistCalendar.className = 'flex-1 sm:flex-none px-4 py-1.5 text-sm sm:text-xs font-medium rounded-md bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-white transition-all';
            btnHistList.className = 'flex-1 sm:flex-none px-4 py-1.5 text-sm sm:text-xs font-medium rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 transition-all';
            monthlyView.classList.remove('hidden');
            historyView.classList.add('hidden');
        });
    }

    // Modal Handlers
    const addBtns = [document.getElementById('btn-add-desktop'), document.getElementById('btn-add-mobile'), document.getElementById('btn-sidebar-add')];
    addBtns.forEach(btn => {
        if(btn) btn.addEventListener('click', openAddModal);
    });

    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });

    document.getElementById('modal-backdrop').addEventListener('click', closeAllModals);

    // Form Sub Submit
    document.getElementById('form-sub').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const data = {
            name: document.getElementById('sub-name').value,
            price: document.getElementById('sub-price').value,
            currency: document.getElementById('sub-currency').value,
            cycle: document.getElementById('sub-cycle').value,
            category: document.getElementById('sub-category').value,
            date: document.getElementById('sub-date').value,
            note: document.getElementById('sub-note').value,
            status: document.getElementById('sub-status').value || 'active',
            isFreeTrial: document.getElementById('sub-is-free-trial').checked,
            excessCost: document.getElementById('sub-category').value === 'utilities' ? (document.getElementById('sub-excess-cost').value || 0) : 0,
        };

        const btn = e.target.querySelector('button[type="submit"]');
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังบันทึก...';
        btn.disabled = true;

        try {
            if (state.editingSubId) {
                await updateSubscription(state.editingSubId, data);
                showToast('อัปเดตรายการแล้ว', 'success');
            } else {
                await addSubscription(currentUser.uid, data);
                showToast('เพิ่มรายการสำเร็จ!', 'success');
            }
            closeAllModals();
        } catch (error) {
            showToast('เกิดข้อผิดพลาดในการบันทึก', 'error');
            console.error(error);
        } finally {
            btn.innerHTML = 'บันทึกข้อมูล';
            btn.disabled = false;
        }
    });

    // Delete Flow
    document.getElementById('btn-delete-sub').addEventListener('click', () => {
        closeModal(document.getElementById('modal-sub'));
        openModal(document.getElementById('modal-confirm'));
    });

    document.getElementById('btn-cancel-delete').addEventListener('click', () => {
        closeAllModals();
        // optionally reopen the sub modal
    });

    document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
        if (!state.editingSubId) return;
        const btn = document.getElementById('btn-confirm-delete');
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังดำเนินการ...';
        btn.disabled = true;
        try {
            const subData = currentSubs.find(s => s.id === state.editingSubId);
            if (subData) {
                await archiveSubscription(currentUser.uid, subData, state.editingSubId);
                showToast('ย้ายลงสุสานแล้ว!', 'success');
            }
            closeAllModals();
        } catch (error) {
            showToast('เกิดข้อผิดพลาด', 'error');
        } finally {
            btn.innerHTML = 'ย้ายลงสุสาน';
            btn.disabled = false;
        }
    });

    // Profile Modal
    const btnProfileDesktop = document.getElementById('btn-profile-desktop');
    if (btnProfileDesktop) {
        btnProfileDesktop.addEventListener('click', () => {
            if (isStaff()) {
                navigateToView('staff-settings');
                return;
            }
            if (isAdmin()) {
                navigateToView('admin-settings');
                return;
            }
            const currentTheme = localStorage.getItem('theme') || 'auto';
            const themeSelect = document.getElementById('profile-theme-select');
            if (themeSelect) themeSelect.value = currentTheme;
            openModal(document.getElementById('modal-profile'));
        });
    }

    const btnUpgradePremium = document.getElementById('btn-upgrade-premium');
    if (btnUpgradePremium) {
        btnUpgradePremium.addEventListener('click', openPremiumPurchaseModal);
    }

    const premiumModal = document.getElementById('modal-premium-purchase');
    premiumModal?.addEventListener('click', (event) => {
        const planButton = event.target.closest('[data-premium-plan]');
        if (!planButton || premiumPurchaseInProgress) return;
        selectedPremiumPlan = planButton.dataset.premiumPlan;
        renderPremiumPlanSelection();
    });
    const btnClosePremium = document.getElementById('btn-close-premium-purchase');
    if (btnClosePremium) {
        btnClosePremium.addEventListener('click', () => closeModal(premiumModal));
    }
    document.getElementById('modal-backdrop').addEventListener('click', () => closeModal(premiumModal));

    const btnConfirmPremium = document.getElementById('btn-confirm-premium-purchase');
    if (btnConfirmPremium) {
        btnConfirmPremium.addEventListener('click', async () => {
            if (premiumPurchaseInProgress) return;
            if (!currentUser || currentPremiumAccess.isPremiumActive || isAdmin()) {
                showToast('สถานะบัญชีไม่ถูกต้องสำหรับการอัปเกรด', 'error');
                return;
            }

            premiumPurchaseInProgress = true;
            btnConfirmPremium.disabled = true;
            const originalText = btnConfirmPremium.innerHTML;
            btnConfirmPremium.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i>กำลังอนุมัติ...';

            let purchaseResult = null;
            try {
                purchaseResult = await purchasePremiumPlan(currentUser.uid, selectedPremiumPlan);
            } catch (error) {
                console.error('Premium purchase failed:', error);
                showToast('ไม่สามารถอัปเกรด Premium ได้ กรุณาลองใหม่', 'error');
            }

            if (purchaseResult) {
                try {
                    const refreshedSettings = await getUserSettings(currentUser.uid);
                    currentPremiumAccess = resolveUserAccess(refreshedSettings || {
                        role: currentUserRole,
                        plan: 'premium',
                        premiumPlan: purchaseResult.premiumPlan,
                        premiumUntil: purchaseResult.premiumUntil
                    });
                    currentUserPlan = currentPremiumAccess.plan;
                    schedulePremiumExpirationRefresh();
                    updateManagementUI();
                    updateRoleBadges();
                    updatePremiumUpgradeUI();
                    closeModal(premiumModal);
                    showToast(`เปิดใช้ Premium ${getPremiumPlanLabel(selectedPremiumPlan)} สำเร็จ!`, 'success');
                } catch (uiError) {
                    console.error('Post-purchase UI update error:', uiError);
                    showToast('อัปเกรดเป็น Premium สำเร็จ!', 'success');
                }
            }

            premiumPurchaseInProgress = false;
            btnConfirmPremium.disabled = false;
            btnConfirmPremium.innerHTML = originalText;
        });
    }
    
    // Profile Modal Navigation Buttons
    const btnProfileSettings = document.getElementById('btn-profile-settings');
    if (btnProfileSettings) {
        btnProfileSettings.addEventListener('click', () => {
            closeAllModals();
            switchView('settings');
        });
    }

    document.getElementById('form-profile').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const themeSelect = document.getElementById('profile-theme-select');
        if (themeSelect) {
            changeTheme(themeSelect.value);
        }

        if (!currentUser) return;

        const displayName = document.getElementById('profile-display-name').value;
        const photoURL = document.getElementById('profile-photo-url').value;
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังอัปเดต...';
        btn.disabled = true;

        try {
            await updateUserProfile(currentUser, { displayName, photoURL });
            
            // Re-auth user object isn't automatically updated in all properties instantly sometimes, 
            // but we can manually update the DOM since we know it succeeded.
            currentUser.displayName = displayName;
            currentUser.photoURL = photoURL;
            showAppScreen(); // Refresh UI
            showToast('อัปเดตโปรไฟล์เรียบร้อย!', 'success');
            closeAllModals();
        } catch (error) {
            showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
            console.error(error);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });

    const escapeCsvString = (value) => {
        const stringValue = String(value ?? '');
        const neutralizedValue = /^[=+\-@]/.test(stringValue) ? `'${stringValue}` : stringValue;
        return `"${neutralizedValue.replace(/"/g, '""')}"`;
    };
    const csvNumber = (value) => {
        const numberValue = Number(value);
        return Number.isFinite(numberValue) ? numberValue : 0;
    };

    const handleExportCSV = () => {
        if (!hasPremiumAccess()) {
            showToast('Feature นี้สำหรับ Premium User เท่านั้น', 'error');
            return;
        }
        if (!currentSubs || currentSubs.length === 0) {
            showToast('ไม่มีข้อมูลสำหรับส่งออก', 'error');
            return;
        }
        
        const headers = ['Name', 'Price', 'Currency', 'ExcessCost', 'Cycle', 'Category', 'StartDate'];
        const rows = currentSubs.map(sub => {
            return [
                escapeCsvString(sub.name),
                csvNumber(sub.price),
                escapeCsvString(sub.currency || 'THB'),
                csvNumber(sub.excessCost),
                escapeCsvString(sub.cycle || 'monthly'),
                escapeCsvString(sub.category || 'other'),
                escapeCsvString(sub.date || '')
            ].join(',');
        });
        
        const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `subtracker_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast('ดาวน์โหลดข้อมูลสำเร็จ!', 'success');
    };

    const btnExportCsv = document.getElementById('btn-export-csv');
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', handleExportCSV);
    }
    const btnExportCsvDesktop = document.getElementById('btn-export-csv-desktop');
    if (btnExportCsvDesktop) {
        btnExportCsvDesktop.addEventListener('click', handleExportCSV);
    }
    const btnExportCsvModal = document.getElementById('btn-export-csv-modal');
    if (btnExportCsvModal) {
        btnExportCsvModal.addEventListener('click', handleExportCSV);
    }

    // Controls
    document.getElementById('btn-cycle-month').addEventListener('click', () => {
        state.cycle = 'monthly';
        const slider = document.getElementById('cycle-slider');
        if (slider) slider.style.transform = 'translateX(0)';
        const btnM = document.getElementById('btn-cycle-month');
        const btnY = document.getElementById('btn-cycle-year');
        if (btnM && btnY) {
            btnM.className = 'px-3 py-1 text-[10px] md:text-xs font-semibold rounded-lg bg-white text-indigo-600 shadow-sm transition-all whitespace-nowrap';
            btnY.className = 'px-3 py-1 text-[10px] md:text-xs font-semibold rounded-lg text-white hover:bg-white/20 transition-all whitespace-nowrap';
        }
        updateUI();
    });

    document.getElementById('btn-cycle-year').addEventListener('click', () => {
        state.cycle = 'yearly';
        const slider = document.getElementById('cycle-slider');
        if (slider) slider.style.transform = 'translateX(100%)';
        const btnM = document.getElementById('btn-cycle-month');
        const btnY = document.getElementById('btn-cycle-year');
        if (btnM && btnY) {
            btnY.className = 'px-3 py-1 text-[10px] md:text-xs font-semibold rounded-lg bg-white text-indigo-600 shadow-sm transition-all whitespace-nowrap';
            btnM.className = 'px-3 py-1 text-[10px] md:text-xs font-semibold rounded-lg text-white hover:bg-white/20 transition-all whitespace-nowrap';
        }
        updateUI();
    });

    document.getElementById('btn-chart-app').addEventListener('click', () => {
        state.chartMode = 'app';
        document.getElementById('btn-chart-app').className = 'px-3 py-1 text-xs font-medium rounded-md bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-white transition-all';
        document.getElementById('btn-chart-cat').className = 'px-3 py-1 text-xs font-medium rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 transition-all';
        renderDonutChart(currentSubs.filter(s => s.status !== 'paused'), state.chartMode, state.exchangeRates);
    });

    document.getElementById('btn-chart-cat').addEventListener('click', () => {
        state.chartMode = 'cat';
        document.getElementById('btn-chart-cat').className = 'px-3 py-1 text-xs font-medium rounded-md bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-white transition-all';
        document.getElementById('btn-chart-app').className = 'px-3 py-1 text-xs font-medium rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 transition-all';
        renderDonutChart(currentSubs.filter(s => s.status !== 'paused'), state.chartMode, state.exchangeRates);
    });

    // Active Subs Toggle
    const btnSubsActive = document.getElementById('btn-subs-active');
    const btnSubsPaused = document.getElementById('btn-subs-paused');
    if (btnSubsActive && btnSubsPaused) {
        btnSubsActive.addEventListener('click', () => {
            state.activeSubsTab = 'active';
            btnSubsActive.className = 'px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md bg-white text-purple-600 shadow-sm transition-all whitespace-nowrap';
            btnSubsPaused.className = 'px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md text-white hover:bg-white/20 transition-all whitespace-nowrap';
            updateUI();
        });
        btnSubsPaused.addEventListener('click', () => {
            state.activeSubsTab = 'paused';
            btnSubsPaused.className = 'px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md bg-white text-purple-600 shadow-sm transition-all whitespace-nowrap';
            btnSubsActive.className = 'px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md text-white hover:bg-white/20 transition-all whitespace-nowrap';
            updateUI();
        });
    }

    // Budget
    document.getElementById('budget-input').addEventListener('change', async (e) => {
        let val = parseFloat(e.target.value);
        if(isNaN(val) || val < 0) val = 0;
        
        // If in yearly view, the input value is a yearly budget. Convert to monthly for storage.
        state.budget = state.cycle === 'monthly' ? val : val / 12;
        
        if(currentUser) {
            localStorage.setItem(`budget_${currentUser.uid}`, state.budget);
            try {
                await saveUserSettings(currentUser.uid, { budget: state.budget });
            } catch(err) {
                console.error("Failed to save budget", err);
            }
        }
        updateUI();
    });

    // Search and Sort
    document.getElementById('search-input').addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        updateUI();
    });

    document.getElementById('sort-select').addEventListener('change', (e) => {
        state.sortMethod = e.target.value;
        updateUI();
    });

    const notiBtns = [
        document.getElementById('btn-noti-mobile'), document.getElementById('btn-noti-desktop'),
        document.getElementById('btn-staff-noti-desktop'), document.getElementById('btn-admin-noti-desktop'),
        document.getElementById('btn-admin-noti-mobile')
    ];
    notiBtns.forEach(btn => {
        if(btn) {
            btn.addEventListener('click', async () => {
                openModal(document.getElementById('modal-noti'));
                
                // We ask for permission but show the modal regardless
                if ('Notification' in window && window.Notification.permission !== 'granted' && window.Notification.permission !== 'denied') {
                    const granted = await requestNotificationPermission();
                    if (granted) {
                        checkUpcomingNotifications(currentSubs, state.exchangeRates);
                    }
                }
            });
        }
    });

    document.getElementById('filter-category').addEventListener('change', (e) => {
        state.filterCategory = e.target.value;
        updateUI();
    });

    document.getElementById('sub-category').addEventListener('change', (e) => {
        const excessContainer = document.getElementById('excess-cost-container');
        if (e.target.value === 'utilities') {
            excessContainer.classList.remove('hidden');
        } else {
            excessContainer.classList.add('hidden');
        }
        
        if (e.target.value === 'custom') {
            openModal(document.getElementById('modal-category'));
            e.target.value = 'other'; // Reset temporarily
        }
    });
    
    const btnCloseCategory = document.getElementById('btn-close-category');
    if (btnCloseCategory) {
        btnCloseCategory.addEventListener('click', () => {
            const catModal = document.getElementById('modal-category');
            if (window.innerWidth >= 1024) {
                catModal.classList.add('lg:translate-y-4', 'lg:scale-95', 'lg:opacity-0');
            } else {
                catModal.classList.add('translate-y-full');
            }
            setTimeout(() => {
                catModal.classList.add('hidden');
            }, 300);
        });
    }
    
    // Split Bill Button (if any inside active subs)
    document.addEventListener('click', (e) => {
        if (e.target.closest('.btn-split-bill')) {
            if (!hasPremiumAccess()) {
                showToast('Feature นี้สำหรับ Premium User เท่านั้น', 'error');
                return;
            }
            const btn = e.target.closest('.btn-split-bill');
            const subId = btn.dataset.id;
            // Get sub object (the handler in main.js passes an ID string instead of full object when using delegated event listener)
            const sub = currentSubs.find(s => s.id === subId);
            if (sub) {
                let thbPrice = parseFloat(sub.price);
                if (sub.currency !== 'THB') {
                    const rate = state.exchangeRates[sub.currency.toLowerCase()] || 1;
                    thbPrice = thbPrice / rate;
                }
                openSplitBillModal(sub, thbPrice, openModal);
            }
        }
    });

    // Year in Review Button
    const btnYir = document.getElementById('btn-year-in-review');
    if (btnYir) {
        btnYir.addEventListener('click', () => {
            openYearInReview(currentSubs, state.exchangeRates);
        });
    }

    const btnSaveCategory = document.getElementById('btn-save-category');
    if (btnSaveCategory) {
        btnSaveCategory.addEventListener('click', async () => {
            const input = document.getElementById('custom-category-name');
            const catName = input.value.trim();
            if (!catName) return;
            
            const btn = btnSaveCategory;
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังบันทึก...';
            btn.disabled = true;
            
            try {
                const category = await addCustomCategory(catName);
                document.getElementById('sub-category').value = category.id;
                
                const catModal = document.getElementById('modal-category');
                if (window.innerWidth >= 1024) {
                    catModal.classList.add('lg:translate-y-4', 'lg:scale-95', 'lg:opacity-0');
                } else {
                    catModal.classList.add('translate-y-full');
                }
                setTimeout(() => {
                    catModal.classList.add('hidden');
                }, 300);
                
                input.value = '';
                showToast('เพิ่มหมวดหมู่ใหม่แล้ว', 'success');
            } catch (err) {
                console.error(err);
                showToast('บันทึกไม่สำเร็จ', 'error');
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });
    }
}

function openAddModal() {
    state.editingSubId = null;
    document.getElementById('form-sub').reset();
    document.getElementById('modal-sub-title').textContent = 'เพิ่มรายการใหม่';
    document.getElementById('btn-delete-sub').classList.add('hidden');
    document.getElementById('preset-selector').classList.remove('hidden');
    document.getElementById('form-sub').classList.add('lg:w-1/2');
    document.getElementById('form-sub').classList.remove('lg:w-full');
    
    // Reset excess cost visibility
    document.getElementById('excess-cost-container').classList.add('hidden');
    document.getElementById('sub-excess-cost').value = '';
    
    // Set default date to today
    document.getElementById('sub-date').valueAsDate = new Date();
    
    openModal(document.getElementById('modal-sub'));
}

function openEditModal(sub) {
    state.editingSubId = sub.id;
    document.getElementById('modal-sub-title').textContent = 'แก้ไขรายการ';
    document.getElementById('preset-selector').classList.add('hidden');
    document.getElementById('form-sub').classList.remove('lg:w-1/2');
    document.getElementById('form-sub').classList.add('lg:w-full');
    
    document.getElementById('sub-name').value = sub.name;
    document.getElementById('sub-price').value = sub.price;
    document.getElementById('sub-currency').value = sub.currency;
    document.getElementById('sub-cycle').value = sub.cycle;
    document.getElementById('sub-category').value = sub.category;
    document.getElementById('sub-date').value = sub.date || '';
    document.getElementById('sub-note').value = sub.note || '';
    document.getElementById('sub-status').value = sub.status || 'active';
    document.getElementById('sub-is-free-trial').checked = sub.isFreeTrial || false;
    document.getElementById('sub-excess-cost').value = sub.excessCost || '';
    
    if (sub.category === 'utilities') {
        document.getElementById('excess-cost-container').classList.remove('hidden');
        document.getElementById('sub-excess-cost').value = sub.excessCost || '';
    } else {
        document.getElementById('excess-cost-container').classList.add('hidden');
        document.getElementById('sub-excess-cost').value = '';
    }
    
    document.getElementById('btn-delete-sub').classList.remove('hidden');
    openModal(document.getElementById('modal-sub'));
}

// --- Presets Rendering ---
function renderPresets() {
    const grid = document.getElementById('preset-grid');
    if (!grid) return;
    
    const grouped = {};
    subscriptionPresets.forEach(preset => {
        if (!grouped[preset.category]) grouped[preset.category] = [];
        grouped[preset.category].push(preset);
    });
    
    let html = '';
    for (const [cat, presets] of Object.entries(grouped)) {
        html += `
        <div>
            <h4 class="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider px-1">${getCategoryName(cat)}</h4>
            <div class="grid grid-cols-4 gap-3">
                ${presets.slice(0, 4).map(preset => {
                    let iconHTML = '';
                    if (preset.domain) {
                        iconHTML = '<img src="https://www.google.com/s2/favicons?domain=' + preset.domain + '&sz=128" class="w-full h-full object-contain p-2" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';" />' +
                                   '<div class="hidden w-full h-full items-center justify-center text-slate-400 text-xl"><i class="fa-solid fa-box"></i></div>';
                    } else if (preset.icon) {
                        iconHTML = `<div class="w-full h-full flex items-center justify-center text-xl ${preset.iconColor || 'text-indigo-500'} ${preset.iconBg || ''}">${preset.icon}</div>`;
                    } else {
                        const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(preset.name)}&background=random&color=fff&size=128&bold=true`;
                        iconHTML = '<img src="' + fallbackUrl + '" class="w-full h-full object-contain p-1 rounded-xl" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';" />' +
                                   '<div class="hidden w-full h-full items-center justify-center text-slate-400 text-xl"><i class="fa-solid fa-box"></i></div>';
                    }
                    
                    return '<div class="preset-item cursor-pointer flex flex-col items-center gap-1 p-2 rounded-xl border border-transparent hover:border-indigo-100 hover:bg-indigo-50 dark:hover:border-indigo-900/50 dark:hover:bg-indigo-900/20 transition-all text-center" ' +
                         'data-id="' + preset.id + '" data-name="' + preset.name + '" data-category="' + preset.category + '">' +
                        '<div class="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-center overflow-hidden shrink-0">' +
                            iconHTML +
                        '</div>' +
                        '<span class="text-[9px] font-medium text-slate-600 dark:text-slate-300 leading-tight truncate w-full px-1">' + preset.name + '</span>' +
                    '</div>';
                }).join('')}
            </div>
        </div>
        `;
    }
    
    grid.innerHTML = html;

    // Attach listeners
    grid.querySelectorAll('.preset-item').forEach(item => {
        item.addEventListener('click', () => {
            document.getElementById('sub-name').value = item.dataset.name;
            document.getElementById('sub-category').value = item.dataset.category;
            document.getElementById('sub-price').focus();
        });
    });
}

// Call at startup
renderPresets();

async function addCustomCategory(name) {
    if (!currentUser) throw new Error('Authentication required');
    const normalizedName = String(name || '').trim();
    if (!normalizedName) throw new Error('Category name is required');

    const existingCategory = state.customCategories.find(category =>
        typeof category?.name === 'string' && category.name.trim().toLocaleLowerCase('th-TH') === normalizedName.toLocaleLowerCase('th-TH')
    );
    if (existingCategory) return existingCategory;

    const category = { id: `custom_${Date.now()}`, name: normalizedName };
    const nextCategories = [...state.customCategories, category];
    await saveUserSettings(currentUser.uid, { customCategories: nextCategories });
    state.customCategories = nextCategories;
    populateCategoryDropdowns();
    return category;
}

async function deleteCustomCategory(categoryId) {
    if (!currentUser) throw new Error('Authentication required');
    const nextCategories = state.customCategories.filter(category => category?.id !== categoryId);
    await saveUserSettings(currentUser.uid, { customCategories: nextCategories });
    state.customCategories = nextCategories;
    populateCategoryDropdowns();
}

function populateCategoryDropdowns() {
    const subCat = document.getElementById('sub-category');
    const filterCat = document.getElementById('filter-category');
    if (!subCat || !filterCat) return;

    // Remove existing custom options before the last option (which is the ➕ Add button)
    Array.from(subCat.options).forEach(opt => {
        if (opt.value.startsWith('custom_')) opt.remove();
    });
    
    // Also from filter category
    Array.from(filterCat.options).forEach(opt => {
        if (opt.value.startsWith('custom_')) opt.remove();
    });

    const customOption = Array.from(subCat.options).find(opt => opt.value === 'custom');
    
    updateCustomCategories(state.customCategories);
    
    state.customCategories.forEach(cat => {
        // Add to sub-category modal
        if (customOption) {
            const opt = new Option(cat.name, cat.id);
            subCat.insertBefore(opt, customOption);
        }
        
        // Add to filter dropdown
        filterCat.appendChild(new Option(cat.name, cat.id));
    });
    refreshSettingsCategories();
}
