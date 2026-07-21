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
    saveUserSettings,
    getUserSettings,
    addPaymentHistory,
    listenPaymentHistory
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
import { initSettings } from './components/settings.js';
import { initAchievements } from './components/achievements.js';
import { initSplitBill, openSplitBillModal } from './components/splitBill.js';
import { initNotifications, requestNotificationPermission, checkUpcomingNotifications } from './components/notifications.js';

import { subscriptionPresets } from './utils/presets.js';
import { initPWA } from './pwa.js';
import { calculateNextBillingDate, getCategoryName, updateCustomCategories } from './utils/helpers.js';

// --- Global State ---
export let currentUser = null;
export let currentSubs = [];
export let currentHistory = [];
export let unsubscribeSubs = null;
export let unsubscribeHistory = null;
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

// --- Elements ---
const authScreen = document.getElementById('auth-screen');
const registerScreen = document.getElementById('register-screen');
const appScreen = document.getElementById('app-screen');

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
        if (user) {
            currentUser = user;
            showAppScreen();
            loadUserData();
        } else {
            currentUser = null;
            showAuthScreen();
            if (unsubscribeSubs) unsubscribeSubs();
            if (unsubscribeHistory) unsubscribeHistory();
        }
    });
});

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
    authScreen.classList.remove('hidden');
}

function showRegisterScreen() {
    authScreen.classList.add('hidden');
    appScreen.classList.add('hidden', 'lg:hidden');
    registerScreen.classList.remove('hidden');
}

async function showAppScreen() {
    authScreen.classList.add('hidden');
    registerScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    if(window.innerWidth >= 1024) appScreen.classList.add('lg:flex');
    
    // Update Profile UI
    const name = currentUser.displayName || 'User';
    const initial = name.charAt(0).toUpperCase();
    
    // Desktop Profile
    document.getElementById('display-name-desktop').textContent = name;
    document.getElementById('display-email-desktop').textContent = currentUser.email;
    const avatarImgD = document.getElementById('avatar-img-desktop');
    const avatarInitD = document.getElementById('avatar-initial-desktop');
    if (avatarImgD && avatarInitD) {
        if (currentUser.photoURL) {
            avatarImgD.src = currentUser.photoURL;
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
        if (currentUser.photoURL) {
            avatarImgM.src = currentUser.photoURL;
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
        if (currentUser.photoURL) {
            greetingAvatarImg.src = currentUser.photoURL;
            greetingAvatarImg.classList.remove('hidden');
            greetingAvatarInit.classList.add('hidden');
        } else {
            greetingAvatarInit.textContent = initial;
            greetingAvatarInit.classList.remove('hidden');
            greetingAvatarImg.classList.add('hidden');
        }
    }

    // Load Budget from localStorage
    const savedBudget = localStorage.getItem(`budget_${currentUser.uid}`);
    if (savedBudget) {
        state.budget = parseFloat(savedBudget);
        document.getElementById('budget-input').value = state.budget;
    }

    // Load from Firestore
    try {
        const settings = await getUserSettings(currentUser.uid);
        if (settings) {
            if (settings.budget !== undefined) {
                state.budget = parseFloat(settings.budget);
                document.getElementById('budget-input').value = state.budget;
                localStorage.setItem(`budget_${currentUser.uid}`, state.budget);
            }
            if (settings.customCategories) {
                state.customCategories = settings.customCategories;
                populateCategoryDropdowns();
            }
        }
    } catch (e) {
        console.error("Failed to load user settings", e);
    }

    // Populate Profile Modal
    document.getElementById('profile-modal-name').textContent = name;
    document.getElementById('profile-display-name').value = name;
    document.getElementById('profile-modal-email').textContent = currentUser.email;
    document.getElementById('profile-photo-url').value = currentUser.photoURL || '';
    
    const pModalImg = document.getElementById('profile-modal-img');
    const pModalInit = document.getElementById('profile-modal-initial');
    if (currentUser.photoURL) {
        pModalImg.src = currentUser.photoURL;
        pModalImg.classList.remove('hidden');
        pModalInit.classList.add('hidden');
    } else {
        pModalInit.textContent = initial;
        pModalInit.classList.remove('hidden');
        pModalImg.classList.add('hidden');
    }
}

// --- Data Management ---
function loadUserData() {
    unsubscribeSubs = listenSubscriptions(currentUser.uid, (subs, error) => {
        if (error) {
            showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
            return;
        }
        currentSubs = subs;
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
    
    initAchievements();
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
            totalYearly += (thbPrice * 12);
        } else {
            totalYearly += thbPrice;
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
    
    const savedMoneyEl = document.getElementById('insight-saved-money');
    if (savedMoneyEl) {
        savedMoneyEl.textContent = `${savedMonthly.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    }

    // Removed duplicate activeCountEl declaration

    // 5. Render Components
    const handleQrClick = (sub) => {
        const currencyCode = (sub.currency || 'THB').toLowerCase();
        let thbPrice = parseFloat(sub.price);
        if (currencyCode !== 'thb') {
            const rate = state.exchangeRates[currencyCode] || 1;
            thbPrice = thbPrice / rate;
        }
        openSplitBillModal(sub, thbPrice, openModal);
    };

    const handlePayClick = async (sub) => {
        const nextDate = calculateNextBillingDate(sub.date, sub.cycle);
        if (!nextDate) return;
        
        const tzOffset = nextDate.getTimezoneOffset() * 60000;
        const nextDateStr = new Date(nextDate.getTime() - tzOffset).toISOString().split('T')[0];
        
        try {
            await updateSubscription(sub.id, { date: nextDateStr });
            
            // Add payment history
            await addPaymentHistory(currentUser.uid, {
                subId: sub.id,
                name: sub.name,
                price: sub.price,
                currency: sub.currency || 'THB'
            });

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
    initSettings();
    
    // Auth Forms
    document.getElementById('link-to-register').addEventListener('click', (e) => {
        e.preventDefault();
        showRegisterScreen();
    });
    document.getElementById('link-to-login').addEventListener('click', (e) => {
        e.preventDefault();
        showAuthScreen();
    });

    document.getElementById('form-login').addEventListener('submit', async (e) => {
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
            showToast('อีเมลหรือรหัสผ่านไม่ถูกต้อง', 'error');
            console.error(error);
        } finally {
            btn.innerHTML = 'เข้าสู่ระบบ';
            btn.disabled = false;
        }
    });

    document.getElementById('form-register').addEventListener('submit', async (e) => {
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

    document.getElementById('btn-google-login').addEventListener('click', async () => {
        try {
            await loginWithGoogle();
        } catch (error) {
            showToast('เข้าสู่ระบบด้วย Google ล้มเหลว', 'error');
            console.error(error);
        }
    });

    // Logout
    const logoutBtns = [document.getElementById('btn-logout-desktop'), document.getElementById('btn-logout-mobile')];
    logoutBtns.forEach(btn => {
        if(btn) btn.addEventListener('click', () => {
            if(confirm('ต้องการออกจากระบบหรือไม่?')) logout();
        });
    });

    // Navigation
    document.querySelectorAll('[data-view]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.currentTarget.dataset.view;
            switchView(view);
        });
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
            const currentTheme = localStorage.getItem('theme') || 'auto';
            const themeSelect = document.getElementById('profile-theme-select');
            if (themeSelect) themeSelect.value = currentTheme;
            openModal(document.getElementById('modal-profile'));
        });
    }
    
    // Profile Modal Navigation Buttons
    const btnProfileAchievements = document.getElementById('btn-profile-achievements');
    if (btnProfileAchievements) {
        btnProfileAchievements.addEventListener('click', () => {
            closeAllModals();
            switchView('achievements');
        });
    }
    
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

    const handleExportCSV = () => {
        if (!currentSubs || currentSubs.length === 0) {
            showToast('ไม่มีข้อมูลสำหรับส่งออก', 'error');
            return;
        }
        
        const headers = ['Name', 'Price', 'Currency', 'ExcessCost', 'Cycle', 'Category', 'StartDate'];
        const rows = currentSubs.map(sub => {
            return [
                `"${(sub.name || '').replace(/"/g, '""')}"`,
                sub.price || 0,
                sub.currency || 'THB',
                sub.excessCost || 0,
                sub.cycle || 'monthly',
                sub.category || 'other',
                sub.date || ''
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

    const notiBtns = [document.getElementById('btn-noti-mobile'), document.getElementById('btn-noti-desktop')];
    notiBtns.forEach(btn => {
        if(btn) {
            btn.addEventListener('click', async () => {
                openModal(document.getElementById('modal-noti'));
                
                // We ask for permission but show the modal regardless
                if (Notification && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
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
    
    const btnSaveCategory = document.getElementById('btn-save-category');
    if (btnSaveCategory) {
        // Split Bill Button (if any inside active subs)
        document.addEventListener('click', (e) => {
            if (e.target.closest('.btn-split-bill')) {
                const btn = e.target.closest('.btn-split-bill');
                const subId = btn.dataset.id;
                openSplitBillModal(subId);
            }
        });

        // Year in Review Button
        const btnYir = document.getElementById('btn-year-in-review');
        if (btnYir) {
            btnYir.addEventListener('click', () => {
                const activeSubs = Array.isArray(state.subs) ? state.subs : [];
                openYearInReview(activeSubs, state.exchangeRates);
            });
        }

        btnSaveCategory.addEventListener('click', async () => {
            const input = document.getElementById('custom-category-name');
            const catName = input.value.trim();
            if (!catName) return;
            
            const btn = btnSaveCategory;
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังบันทึก...';
            btn.disabled = true;
            
            try {
                const catId = 'custom_' + Date.now();
                state.customCategories.push({ id: catId, name: catName });
                
                if (currentUser) {
                    await saveUserSettings(currentUser.uid, { customCategories: state.customCategories });
                }
                
                populateCategoryDropdowns();
                document.getElementById('sub-category').value = catId;
                
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
}
