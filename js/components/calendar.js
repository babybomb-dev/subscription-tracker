import { calculateNextBillingDate, getDaysUntil, formatMoney, getCategoryIcon } from '../utils/helpers.js';

export function renderMonthlyCalendar(subs) {
    const container = document.getElementById('monthly-calendar-container');
    if (!container) return;

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    const firstDay = new Date(currentYear, currentMonth, 1).getDay(); // 0 (Sun) to 6 (Sat)
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    
    const subsByDay = {};
    for (let i = 1; i <= daysInMonth; i++) subsByDay[i] = [];

    subs.forEach(sub => {
        if (!sub.date) return;
        const nextDate = calculateNextBillingDate(sub.date, sub.cycle);
        // Only show if it falls in the current month/year being viewed
        if (nextDate && nextDate.getMonth() === currentMonth && nextDate.getFullYear() === currentYear) {
            subsByDay[nextDate.getDate()].push({
                sub,
                nextDate
            });
        }
    });

    let html = `
        <div class="mb-4">
            <h3 class="text-lg font-bold text-slate-800 dark:text-slate-100">${monthNames[currentMonth]} ${currentYear + 543}</h3>
        </div>
        <div class="grid grid-cols-7 gap-1 sm:gap-2">
            <!-- Days header -->
            ${['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'].map(day => `
                <div class="text-center text-xs font-semibold text-slate-500 py-2">${day}</div>
            `).join('')}
    `;

    // Empty cells before the first day of the month
    for (let i = 0; i < firstDay; i++) {
        html += `<div class="p-1 sm:p-2 min-h-[80px] sm:min-h-[100px] rounded-xl bg-transparent"></div>`;
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = day === today.getDate();
        
        let dayItemsHTML = '';
        if (subsByDay[day].length > 0) {
            dayItemsHTML = subsByDay[day].map(item => {
                const daysUntil = getDaysUntil(item.nextDate);
                let bgColorClass = 'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300'; // Default
                let iconColorClass = 'text-slate-500 dark:text-slate-400';
                
                if (daysUntil !== null) {
                    if (daysUntil <= 1) {
                        bgColorClass = 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300';
                        iconColorClass = 'text-rose-500 dark:text-rose-400';
                    } else if (daysUntil <= 7) {
                        bgColorClass = 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300';
                        iconColorClass = 'text-amber-500 dark:text-amber-400';
                    }
                }

                return `
                    <div class="flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 mt-1 rounded-lg ${bgColorClass} shadow-sm text-left truncate cursor-help" title="${item.sub.name} - ${formatMoney(item.sub.price)} ${item.sub.currency}">
                        <div class="w-4 h-4 shrink-0 flex items-center justify-center text-[10px] ${iconColorClass}">
                            ${getCategoryIcon(item.sub.category)}
                        </div>
                        <div class="flex-1 truncate text-[9px] sm:text-[10px] font-semibold leading-tight">
                            ${item.sub.name}
                        </div>
                    </div>
                `;
            }).join('');
        }

        html += `
            <div class="flex flex-col p-1 sm:p-2 min-h-[80px] sm:min-h-[100px] rounded-xl border ${isToday ? 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800' : 'bg-white dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'}">
                <span class="text-xs sm:text-sm font-medium ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400'}">${day}</span>
                <div class="mt-1 flex-1 overflow-y-auto hide-scrollbar space-y-1">
                    ${dayItemsHTML}
                </div>
            </div>
        `;
    }

    html += `</div>`;
    container.innerHTML = html;
}

let fullCalDate = new Date();
let currentSubsCache = [];

export function renderFullCalendar(subs, date = null) {
    if (subs) currentSubsCache = subs;
    if (date) fullCalDate = new Date(date);
    
    const container = document.getElementById('full-calendar-grid');
    if (!container) return;

    const currentYear = fullCalDate.getFullYear();
    const currentMonth = fullCalDate.getMonth();
    const today = new Date();

    const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    document.getElementById('full-cal-month-year').textContent = `${monthNames[currentMonth]} ${currentYear + 543}`;

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    const subsByDay = {};
    for (let i = 1; i <= daysInMonth; i++) subsByDay[i] = [];

    currentSubsCache.forEach(sub => {
        if (!sub.date || sub.status === 'paused') return;
        
        let subNextDate = calculateNextBillingDate(sub.date, sub.cycle);
        
        // Find all occurrences in the month for this subscription (if weekly/monthly, it might occur this month)
        // For simplicity, we calculate the next date from today, but it could fall into another month.
        // A robust calendar needs to project the cycle for the specific viewing month.
        // Simplified projection:
        let checkDate = new Date(sub.date);
        while (checkDate.getFullYear() < currentYear || (checkDate.getFullYear() === currentYear && checkDate.getMonth() <= currentMonth)) {
            if (checkDate.getMonth() === currentMonth && checkDate.getFullYear() === currentYear) {
                subsByDay[checkDate.getDate()].push(sub);
            }
            if (sub.cycle === 'monthly') checkDate.setMonth(checkDate.getMonth() + 1);
            else if (sub.cycle === 'yearly') checkDate.setFullYear(checkDate.getFullYear() + 1);
            else break; // fallback
        }
    });

    let html = `
        <div class="grid grid-cols-7 gap-2 sm:gap-4 w-full">
            <!-- Days header -->
            ${['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์', 'เสาร์'].map(day => `
                <div class="text-center text-xs sm:text-sm font-bold text-slate-500 py-2">${day}</div>
            `).join('')}
    `;

    for (let i = 0; i < firstDay; i++) {
        html += `<div class="p-2 min-h-[100px] sm:min-h-[120px] rounded-2xl bg-transparent"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
        
        let dayItemsHTML = '';
        if (subsByDay[day].length > 0) {
            dayItemsHTML = subsByDay[day].map(sub => {
                return `
                    <div class="flex items-center gap-1.5 p-1.5 mb-1 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 text-xs truncate">
                        <div class="w-4 h-4 rounded flex items-center justify-center shrink-0 bg-slate-100 dark:bg-slate-700 text-[10px] text-slate-500"><i class="${getCategoryIcon(sub.category)}"></i></div>
                        <span class="truncate font-medium text-slate-700 dark:text-slate-300">${sub.name}</span>
                    </div>
                `;
            }).join('');
        }

        html += `
            <div class="flex flex-col p-2 min-h-[100px] sm:min-h-[120px] rounded-2xl border ${isToday ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50'} transition-all hover:shadow-md">
                <span class="text-sm font-bold ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300'} mb-2 ${isToday ? 'bg-white dark:bg-indigo-900 rounded-full w-7 h-7 flex items-center justify-center shadow-sm' : ''}">${day}</span>
                <div class="flex-1 overflow-y-auto hide-scrollbar space-y-1">
                    ${dayItemsHTML}
                </div>
            </div>
        `;
    }

    html += `</div>`;
    container.innerHTML = html;
}

export function initFullCalendarControls() {
    const btnPrev = document.getElementById('btn-full-cal-prev');
    const btnNext = document.getElementById('btn-full-cal-next');
    
    if (btnPrev && btnNext) {
        btnPrev.addEventListener('click', () => {
            fullCalDate.setMonth(fullCalDate.getMonth() - 1);
            renderFullCalendar(null);
        });
        btnNext.addEventListener('click', () => {
            fullCalDate.setMonth(fullCalDate.getMonth() + 1);
            renderFullCalendar(null);
        });
    }
}
