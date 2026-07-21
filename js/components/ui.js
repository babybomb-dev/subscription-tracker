/**
 * js/components/ui.js
 * Handles DOM manipulation, Toasts, Modals, Theme, Navigation, and Rendering List
 */
import { getCategoryName, getCategoryIcon, formatMoney, calculateNextBillingDate, getDaysUntil, getLogoHTML, generateGoogleCalendarUrl } from '../utils/helpers.js';

// Elements
const modalSub = document.getElementById('modal-sub');
const modalConfirm = document.getElementById('modal-confirm');
const modalSplitBill = document.getElementById('modal-split-bill');
const modalBackdrop = document.getElementById('modal-backdrop');

// --- Theme Management ---
export function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'auto';
    applyTheme(savedTheme);

    // Watch for system theme changes if set to auto
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (localStorage.getItem('theme') === 'auto' || !localStorage.getItem('theme')) {
            applyTheme('auto');
        }
    });

    const toggleBtns = [document.getElementById('btn-theme-mobile'), document.getElementById('btn-theme-desktop')];
    toggleBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                const currentDark = document.documentElement.classList.contains('dark');
                changeTheme(currentDark ? 'light' : 'dark');
            });
        }
    });
}

export function changeTheme(themeSetting) {
    localStorage.setItem('theme', themeSetting);
    applyTheme(themeSetting);
}

function applyTheme(themeSetting) {
    let isDark = false;
    if (themeSetting === 'dark') {
        isDark = true;
    } else if (themeSetting === 'auto' || !themeSetting) {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    
    if (isDark) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

// --- Navigation Management ---
export function switchView(viewId) {
    const views = ['dashboard', 'list', 'history', 'analytics', 'calendar', 'achievements', 'settings'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.classList.add('hidden');
    });

    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) targetView.classList.remove('hidden');

    // Update active state on buttons
    document.querySelectorAll('.nav-btn, .nav-btn-mobile').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === viewId) {
            btn.classList.add('active');
        }
    });
    
    // Scroll to top
    const scrollArea = document.getElementById('main-scroll-area');
    if (scrollArea) scrollArea.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Modals ---
export function openModal(modalEl) {
    if (!modalEl) return;
    modalBackdrop.classList.remove('hidden');
    modalEl.classList.remove('hidden');
    
    // Animate in
    setTimeout(() => {
        modalBackdrop.classList.remove('opacity-0');
        if (window.innerWidth >= 1024) { // Desktop
            modalEl.classList.remove('lg:translate-y-4', 'lg:scale-95', 'lg:opacity-0');
        } else { // Mobile
            modalEl.classList.remove('translate-y-full');
        }
    }, 10);
}

export function closeModal(modalEl) {
    if (!modalEl) return;
    modalBackdrop.classList.add('opacity-0');
    
    if (window.innerWidth >= 1024) {
        modalEl.classList.add('lg:translate-y-4', 'lg:scale-95', 'lg:opacity-0');
    } else {
        modalEl.classList.add('translate-y-full');
    }

    setTimeout(() => {
        modalBackdrop.classList.add('hidden');
        modalEl.classList.add('hidden');
    }, 300); // Wait for transition
}

export function closeAllModals() {
    closeModal(modalSub);
    closeModal(modalConfirm);
    closeModal(modalSplitBill);
    closeModal(document.getElementById('modal-profile'));
    closeModal(document.getElementById('modal-year-in-review'));
    closeModal(document.getElementById('modal-category'));
}

// --- Toasts ---
export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const colors = type === 'success' ? 'bg-emerald-500' : 'bg-rose-500';
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-circle-exclamation';
    
    toast.className = `flex items-center gap-2 px-4 py-3 rounded-full text-white text-sm font-medium shadow-lg toast-enter ${colors}`;
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${message}`;
    
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.replace('toast-enter', 'toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- List Rendering ---
export function renderSubscriptionList(subs, onEditClick, onQrClick, onDeleteClick, onPayClick, exchangeRates = {}) {
    const grid = document.getElementById('subs-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (subs.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-12 flex flex-col items-center justify-center text-slate-400">
                <i class="fa-solid fa-box-open text-4xl mb-3 opacity-50"></i>
                <p>ยังไม่มีรายการใดๆ</p>
            </div>
        `;
        return;
    }

    subs.forEach(sub => {
        const nextDate = calculateNextBillingDate(sub.date, sub.cycle);
        const daysUntil = getDaysUntil(nextDate);
        
        let dateColor = 'text-slate-500 dark:text-slate-400';
        let dateIcon = 'fa-calendar';
        if (daysUntil !== null) {
            if (daysUntil === 0) { dateColor = 'text-rose-500 font-bold'; dateIcon = 'fa-circle-exclamation animate-pulse'; }
            else if (daysUntil <= 3) { dateColor = 'text-rose-500'; dateIcon = 'fa-clock'; }
            else if (daysUntil <= 7) { dateColor = 'text-amber-500'; dateIcon = 'fa-clock'; }
        }

        let currencyDisplay = sub.currency || 'THB';
        if (currencyDisplay !== 'THB' && currencyDisplay !== 'thb') {
            const code = currencyDisplay.toLowerCase();
            const rate = exchangeRates[code] || 1;
            const thbEquivalent = (parseFloat(sub.price) / rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            currencyDisplay = `${currencyDisplay.toUpperCase()} (≈ ${thbEquivalent} THB)`;
        }

        const isPaused = sub.status === 'paused';
        const card = document.createElement('div');
        card.className = "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden group";
        if (isPaused) {
            card.classList.add('opacity-60', 'grayscale-[0.5]');
        }
        
        card.innerHTML = `
            <div class="flex justify-between items-start mb-4 relative z-10">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center text-lg shadow-sm shrink-0 overflow-hidden">
                        ${getLogoHTML(sub.name, sub.category)}
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h4 class="font-bold text-slate-800 dark:text-slate-100 leading-tight">${sub.name}</h4>
                            ${isPaused ? '<span class="text-[10px] font-bold text-slate-50 bg-slate-400 dark:text-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">⏸️ พัก</span>' : ''}
                            ${sub.isFreeTrial ? '<span class="text-[10px] font-bold text-white bg-amber-500 px-1.5 py-0.5 rounded animate-pulse shadow-sm shadow-amber-500/30">🆓 ทดลองใช้ฟรี</span>' : ''}
                        </div>
                        <span class="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md mt-1 inline-block">${getCategoryName(sub.category)}</span>
                    </div>
                </div>
                <!-- Action Icons -->
                <div class="flex items-center shrink-0">
                    <button class="btn-item-pay w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 flex items-center justify-center transition-colors shadow-sm border border-emerald-100 dark:border-emerald-500/20" title="ชำระแล้ว">
                        <i class="fa-solid fa-check"></i>
                    </button>
                </div>
            </div>
            
            <div class="space-y-1 relative z-10">
                <div class="flex items-baseline gap-1">
                    <p class="text-xl font-extrabold text-slate-800 dark:text-white">${formatMoney(sub.price)}</p>
                    <span class="text-xs font-semibold text-slate-500">${currencyDisplay}</span>
                    <span class="text-[10px] text-slate-400">/ ${sub.cycle === 'monthly' ? 'เดือน' : 'ปี'}</span>
                </div>
                ${sub.excessCost && parseFloat(sub.excessCost) > 0 ? `
                <div class="flex items-baseline gap-1 mt-0.5">
                    <span class="text-xs font-semibold text-rose-500">+${formatMoney(sub.excessCost)}</span>
                    <span class="text-[10px] text-slate-500">ส่วนเกิน (เฉพาะเดือนนี้)</span>
                </div>` : ''}
            </div>

            <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center relative z-10">
                <div class="flex items-center gap-1.5 ${dateColor} text-xs">
                    <i class="fa-solid ${dateIcon}"></i>
                    <span>${daysUntil !== null ? (daysUntil === 0 ? 'ชำระวันนี้!' : `อีก ${daysUntil} วัน`) : 'ไม่ได้ตั้งวัน'}</span>
                </div>
                
                <div class="flex items-center gap-1">
                    ${sub.note ? `<div class="text-indigo-400 mr-2" title="${sub.note}"><i class="fa-solid fa-comment-dots"></i></div>` : ''}
                    <a href="${generateGoogleCalendarUrl(sub.name, sub.price, sub.currency || 'THB', nextDate)}" target="_blank" class="btn-item-calendar w-7 h-7 rounded-full hover:bg-sky-100 hover:text-sky-600 dark:hover:bg-sky-500/20 dark:hover:text-sky-400 flex items-center justify-center text-slate-400 transition-colors" title="เพิ่มลง Google Calendar" onclick="event.stopPropagation()">
                        <i class="fa-regular fa-calendar-plus"></i>
                    </a>
                    <button class="btn-item-qr w-7 h-7 rounded-full hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-500/20 dark:hover:text-indigo-400 flex items-center justify-center text-slate-400 transition-colors" title="หารบิล">
                        <i class="fa-solid fa-qrcode"></i>
                    </button>
                    <button class="btn-item-edit w-7 h-7 rounded-full hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-500/20 dark:hover:text-amber-400 flex items-center justify-center text-slate-400 transition-colors" title="แก้ไข">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-item-delete w-7 h-7 rounded-full hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-500/20 dark:hover:text-rose-400 flex items-center justify-center text-slate-400 transition-colors" title="ลบ">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;

        // No more whole card click listener to prevent accidental clicks
        // card.addEventListener('click', () => onEditClick(sub));
        
        // Bind action buttons
        
        const qrBtn = card.querySelector('.btn-item-qr');
        if (qrBtn && onQrClick) {
            qrBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                onQrClick(sub);
            });
        }

        const editBtn = card.querySelector('.btn-item-edit');
        if (editBtn && onEditClick) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                onEditClick(sub);
            });
        }
        
        const deleteBtn = card.querySelector('.btn-item-delete');
        if (deleteBtn && onDeleteClick) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                onDeleteClick(sub);
            });
        }
        
        const payBtn = card.querySelector('.btn-item-pay');
        if (payBtn && onPayClick) {
            payBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                onPayClick(sub);
            });
        }

        grid.appendChild(card);
    });
}



// --- Upcoming List Rendering (Dashboard) ---
export function renderUpcomingList(subs, onPayClick, onQrClick, exchangeRates = {}) {
    const container = document.getElementById('upcoming-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Filter subs that have a date and are within 7 days
    const upcomingSubs = subs.filter(sub => {
        if (!sub.date) return false;
        const days = getDaysUntil(calculateNextBillingDate(sub.date, sub.cycle));
        return days !== null && days >= 0 && days <= 7;
    }).sort((a, b) => {
        const daysA = getDaysUntil(calculateNextBillingDate(a.date, a.cycle));
        const daysB = getDaysUntil(calculateNextBillingDate(b.date, b.cycle));
        return daysA - daysB;
    });

    if (upcomingSubs.length === 0) {
        container.innerHTML = `<p class="text-sm text-slate-500 italic py-4 w-full text-center">ไม่มีรายการที่ต้องชำระใน 7 วันนี้ 🎉</p>`;
        return;
    }

    upcomingSubs.forEach(sub => {
        const nextDate = calculateNextBillingDate(sub.date, sub.cycle);
        const daysUntil = getDaysUntil(nextDate);
        
        let bgColor = 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700';
        let textColor = 'text-slate-600 dark:text-slate-300';
        let dotColor = 'bg-emerald-500';
        
        if (daysUntil === 0) {
            bgColor = 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-900/50';
            textColor = 'text-rose-600 dark:text-rose-400 font-bold';
            dotColor = 'bg-rose-500 animate-pulse';
        } else if (daysUntil <= 3) {
            bgColor = 'bg-rose-50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-900/30';
            textColor = 'text-rose-600 dark:text-rose-400';
            dotColor = 'bg-rose-500';
        } else if (daysUntil <= 5) {
            dotColor = 'bg-amber-500';
        }

        let currencyDisplay = sub.currency || 'THB';
        if (currencyDisplay === 'USD') {
            const thbEquivalent = (parseFloat(sub.price) * exchangeRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            currencyDisplay = `USD (≈ ${thbEquivalent} บ.)`;
        }

        const card = document.createElement('div');
        card.className = `shrink-0 w-36 lg:w-full ${bgColor} border rounded-2xl p-3 shadow-sm snap-start flex flex-col justify-between transition-transform hover:-translate-y-1 relative`;
        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div class="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center text-sm shrink-0 overflow-hidden">
                    ${getLogoHTML(sub.name, sub.category)}
                </div>
                <div class="flex items-center gap-1.5">
                    <a href="${generateGoogleCalendarUrl(sub.name, sub.price, sub.currency || 'THB', nextDate)}" target="_blank" class="btn-up-calendar w-8 h-8 rounded-full hover:bg-sky-100 hover:text-sky-600 dark:hover:bg-sky-500/20 dark:hover:text-sky-400 flex items-center justify-center text-slate-400 transition-colors text-xs" title="เพิ่มลง Google Calendar" onclick="event.stopPropagation()">
                        <i class="fa-regular fa-calendar-plus"></i>
                    </a>
                    <button class="btn-up-qr w-8 h-8 rounded-full hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-500/20 dark:hover:text-indigo-400 flex items-center justify-center text-slate-400 transition-colors text-xs" title="หารบิล">
                        <i class="fa-solid fa-qrcode"></i>
                    </button>
                    <button class="btn-up-pay w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 flex items-center justify-center transition-colors shadow-sm border border-emerald-100 dark:border-emerald-500/20 text-xs" title="จ่ายแล้ว">
                        <i class="fa-solid fa-check"></i>
                    </button>
                </div>
            </div>
            <div class="cursor-pointer" id="up-card-body-${sub.id}">
                <p class="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">${sub.name}</p>
                <p class="text-xs text-slate-600 dark:text-slate-300 truncate">${formatMoney(sub.price)} ${currencyDisplay} ${sub.excessCost && parseFloat(sub.excessCost) > 0 ? `<span class="text-rose-500 font-medium">+${formatMoney(sub.excessCost)}</span>` : ''}</p>
                <div class="flex justify-between items-center mt-1.5">
                    <p class="text-xs font-medium ${textColor}">${daysUntil === 0 ? 'ชำระวันนี้' : `อีก ${daysUntil} วัน`}</p>
                    <div class="w-2 h-2 rounded-full ${dotColor}"></div>
                </div>
            </div>
        `;
        
        // Clicking on the body switches to list view
        const body = card.querySelector(`#up-card-body-${sub.id}`);
        if(body) {
            body.addEventListener('click', () => {
                switchView('list');
            });
        }
        
        const payBtn = card.querySelector('.btn-up-pay');
        if (payBtn && onPayClick) {
            payBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                onPayClick(sub);
            });
        }

        const qrBtn = card.querySelector('.btn-up-qr');
        if (qrBtn && onQrClick) {
            qrBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                onQrClick(sub);
            });
        }
        
        container.appendChild(card);
    });
}

export function renderActiveSubsList(subs, exchangeRates = {}, onQuickAction = null) {
    const container = document.getElementById('active-subs-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!subs || subs.length === 0) {
        container.innerHTML = '<p class="text-[10px] text-white/50 text-center py-2">ไม่มีบริการ</p>';
        return;
    }
    
    // Sort by price descending
    const sortedSubs = [...subs].sort((a, b) => {
        let priceA = parseFloat(a.price);
        if ((a.currency || 'THB').toLowerCase() !== 'thb') {
            priceA = priceA / (exchangeRates[(a.currency || 'THB').toLowerCase()] || 1);
        }
        let priceB = parseFloat(b.price);
        if ((b.currency || 'THB').toLowerCase() !== 'thb') {
            priceB = priceB / (exchangeRates[(b.currency || 'THB').toLowerCase()] || 1);
        }
        return priceB - priceA;
    });

    sortedSubs.forEach(sub => {
        const item = document.createElement('div');
        const isPaused = sub.status === 'paused';
        item.className = 'flex items-center gap-2 bg-white/10 hover:bg-white/20 transition-colors p-2 rounded-xl backdrop-blur-sm group';
        
        let priceText = `${parseFloat(sub.price).toLocaleString(undefined, {minimumFractionDigits: 2})} ${sub.currency || 'THB'}`;
        
        item.innerHTML = `
            <div class="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0 overflow-hidden ${isPaused ? 'opacity-50 grayscale' : ''}">
                ${getLogoHTML(sub.name, sub.logoUrl, 'w-full h-full object-cover', 'text-xs')}
            </div>
            <div class="flex-1 min-w-0 text-left ${isPaused ? 'text-white/50' : 'text-white'}">
                <p class="text-xs font-bold truncate">${sub.name}</p>
                <p class="text-[9px] opacity-80">${priceText}</p>
            </div>
            ${onQuickAction ? `
            <button class="w-6 h-6 rounded-md bg-white/10 hover:bg-white/30 text-white flex items-center justify-center transition-colors opacity-0 md:opacity-0 md:group-hover:opacity-100 btn-quick-action" title="${isPaused ? 'กลับมาใช้งาน' : 'พักการใช้งาน'}">
                <i class="fa-solid ${isPaused ? 'fa-play' : 'fa-pause'} text-[10px]"></i>
            </button>
            ` : ''}
        `;
        
        if (onQuickAction) {
            const btn = item.querySelector('.btn-quick-action');
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onQuickAction(sub, isPaused ? 'active' : 'paused');
                });
            }
        }
        
        container.appendChild(item);
    });
}
