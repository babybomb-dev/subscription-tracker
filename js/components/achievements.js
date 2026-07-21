import { listenCanceledSubscriptions, hardDeleteCanceledSubscription } from '../services/database.js';
import { getCategoryName, getCategoryIcon, formatMoney } from '../utils/helpers.js';
import { state, currentUser } from '../main.js';
import { showToast, closeAllModals } from './ui.js';

let currentCanceledSubs = [];

export function initAchievements() {
    if (!currentUser) return;
    
    listenCanceledSubscriptions(currentUser.uid, (subs) => {
        currentCanceledSubs = subs;
        renderAchievements();
    });
}

function renderAchievements() {
    // 1. Calculate Total Saved per year
    let totalSavedYearly = 0;
    
    currentCanceledSubs.forEach(sub => {
        let currencyCode = (sub.currency || 'THB').toLowerCase();
        let thbPrice = parseFloat(sub.price);
        if (currencyCode !== 'thb') {
            const rate = state.exchangeRates[currencyCode] || 1;
            thbPrice = thbPrice / rate;
        }
        
        let yearlyPrice = thbPrice;
        if (sub.cycle === 'monthly') {
            yearlyPrice = thbPrice * 12;
        } else if (sub.cycle === 'weekly') {
            yearlyPrice = thbPrice * 52;
        }
        
        totalSavedYearly += yearlyPrice;
    });
    
    const formatCurrency = (val) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(val);
    document.getElementById('achievements-total-saved').textContent = formatCurrency(totalSavedYearly);
    
    // 2. Render Badges
    renderBadges(currentCanceledSubs.length, totalSavedYearly);
    
    // 3. Render Graveyard List
    renderGraveyardList(currentCanceledSubs);
}

function renderBadges(cancelCount, totalSaved) {
    const container = document.getElementById('badges-container');
    if (!container) return;
    
    const badges = [
        {
            id: 'first_step',
            icon: 'fa-shoe-prints',
            name: 'ก้าวแรก',
            desc: 'ยกเลิก 1 บริการ',
            color: 'text-blue-500',
            bg: 'bg-blue-100 dark:bg-blue-900/30',
            unlocked: cancelCount >= 1
        },
        {
            id: 'minimalist',
            icon: 'fa-leaf',
            name: 'มินิมอลลิสต์',
            desc: 'ยกเลิก 3 บริการ',
            color: 'text-emerald-500',
            bg: 'bg-emerald-100 dark:bg-emerald-900/30',
            unlocked: cancelCount >= 3
        },
        {
            id: 'ruthless',
            icon: 'fa-skull',
            name: 'นักเชือด',
            desc: 'ยกเลิก 5 บริการ',
            color: 'text-purple-500',
            bg: 'bg-purple-100 dark:bg-purple-900/30',
            unlocked: cancelCount >= 5
        },
        {
            id: 'money_saver',
            icon: 'fa-piggy-bank',
            name: 'นักออม',
            desc: 'ประหยัดครบ 1,000 บ.',
            color: 'text-rose-500',
            bg: 'bg-rose-100 dark:bg-rose-900/30',
            unlocked: totalSaved >= 1000
        },
        {
            id: 'wealthy',
            icon: 'fa-sack-dollar',
            name: 'เศรษฐี',
            desc: 'ประหยัดครบ 5,000 บ.',
            color: 'text-amber-500',
            bg: 'bg-amber-100 dark:bg-amber-900/30',
            unlocked: totalSaved >= 5000
        }
    ];
    
    container.innerHTML = badges.map(b => {
        if (b.unlocked) {
            return `
                <div class="flex flex-col items-center p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-indigo-100 dark:border-indigo-900/50 relative">
                    <div class="w-12 h-12 ${b.bg} rounded-full flex items-center justify-center mb-2 shadow-sm">
                        <i class="fa-solid ${b.icon} text-xl ${b.color}"></i>
                    </div>
                    <span class="text-xs font-bold text-slate-800 dark:text-white text-center">${b.name}</span>
                    <span class="text-[10px] text-slate-500 dark:text-slate-400 text-center leading-tight mt-1">${b.desc}</span>
                </div>
            `;
        } else {
            return `
                <div class="flex flex-col items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 opacity-50 grayscale">
                    <div class="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center mb-2">
                        <i class="fa-solid fa-lock text-xl text-slate-400"></i>
                    </div>
                    <span class="text-xs font-bold text-slate-600 dark:text-slate-400 text-center">${b.name}</span>
                    <span class="text-[10px] text-slate-400 dark:text-slate-500 text-center leading-tight mt-1">${b.desc}</span>
                </div>
            `;
        }
    }).join('');
}

function renderGraveyardList(subs) {
    const container = document.getElementById('graveyard-list');
    if (!container) return;
    
    if (subs.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8">
                <i class="fa-solid fa-ghost text-4xl text-slate-300 dark:text-slate-600 mb-3"></i>
                <p class="text-slate-500 dark:text-slate-400 font-medium">สุสานยังว่างเปล่า</p>
                <p class="text-sm text-slate-400 dark:text-slate-500">คุณยังไม่เคยกดยกเลิกบริการใดๆ เลย</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = subs.map(sub => {
        const cancelDate = new Date(sub.canceledAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
        const iconClass = getCategoryIcon(sub.category);
        
        return `
            <div class="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 transition-all">
                <div class="w-12 h-12 bg-white dark:bg-slate-700 rounded-xl flex items-center justify-center shadow-sm shrink-0 grayscale opacity-80">
                    <i class="${iconClass} text-xl text-slate-500 dark:text-slate-400"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start mb-1">
                        <h4 class="font-bold text-slate-800 dark:text-white truncate line-through decoration-slate-400">${sub.name}</h4>
                        <span class="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full whitespace-nowrap ml-2">+${formatMoney(sub.price, sub.currency)}/${sub.cycle === 'monthly'?'ด':sub.cycle === 'yearly'?'ป':'ส'}</span>
                    </div>
                    <div class="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                        <span>ยกเลิกเมื่อ: ${cancelDate}</span>
                        <button class="btn-hard-delete text-rose-500 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors" data-id="${sub.id}" title="ลบถาวร">
                            <i class="fa-solid fa-trash-can"></i> ลบถาวร
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Attach hard delete events
    container.querySelectorAll('.btn-hard-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id;
            if (confirm('คุณต้องการลบข้อมูลนี้ออกจากสุสานอย่างถาวรหรือไม่? (จะไม่ถูกนำมาคิดในสถิติยอดประหยัดอีกต่อไป)')) {
                try {
                    await hardDeleteCanceledSubscription(id);
                    showToast('ลบข้อมูลถาวรแล้ว', 'success');
                } catch (err) {
                    showToast('เกิดข้อผิดพลาด', 'error');
                }
            }
        });
    });
}
