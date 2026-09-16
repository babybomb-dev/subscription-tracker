import { listenCanceledSubscriptions } from '../services/database.js';
import { state, currentUser } from '../main.js';

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
    // ผู้ใช้แจ้งว่านำ Element นี้ออกไปแล้ว จึงทำการคอมเมนต์ไว้เพื่อไม่ให้เกิด Error
    // document.getElementById('achievements-total-saved').textContent = formatCurrency(totalSavedYearly);
    
    // 2. Render Badges
    renderBadges(currentCanceledSubs.length, totalSavedYearly);
    
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
