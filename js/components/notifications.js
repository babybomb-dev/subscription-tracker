/**
 * js/components/notifications.js
 * Handles browser Push API / Notifications API for upcoming bills
 */
import { calculateNextBillingDate, getDaysUntil, formatMoney } from '../utils/helpers.js';

let permissionGranted = false;

// Initialize Notification System
export function initNotifications() {
    if (!('Notification' in window)) {
        console.warn('This browser does not support desktop notification');
        return;
    }
    
    if (Notification.permission === 'granted') {
        permissionGranted = true;
    }
    
    updateNotificationUI();
}

// Request Permission
export async function requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        permissionGranted = true;
        updateNotificationUI();
        return true;
    }
    return false;
}

// Update Bell Icon UI (if it exists)
function updateNotificationUI() {
    const mobileBtn = document.getElementById('btn-noti-mobile');
    const desktopBtn = document.getElementById('btn-noti-desktop');
    
    if (permissionGranted) {
        if (mobileBtn) mobileBtn.classList.add('text-indigo-500', 'dark:text-indigo-400');
        if (desktopBtn) desktopBtn.classList.add('text-indigo-500', 'dark:text-indigo-400');
    }
}

// Check and send notifications for upcoming bills
// Check and send notifications for upcoming bills
export function checkUpcomingNotifications(subs, exchangeRates = {}) {
    // We will render to In-App list regardless of Browser Permission
    const notiList = document.getElementById('noti-list');
    const notiBadgeMobile = document.getElementById('btn-noti-mobile');
    const notiBadgeDesktop = document.getElementById('btn-noti-desktop');
    
    let html = '';
    let alertCount = 0;
    
    const notifiedLogs = JSON.parse(localStorage.getItem('notifiedLogs') || '{}');
    const today = new Date().toDateString();
    let updatedLogs = false;
    
    // Sort subs so urgent comes first
    subs.forEach(sub => {
        if (sub.status === 'paused') return;
        
        const nextDate = calculateNextBillingDate(sub.date, sub.cycle);
        const daysUntil = getDaysUntil(nextDate);
        
        // Threshold: 3 days for normal, 1 day for free trial (but show 3 days anyway)
        if (daysUntil !== null && daysUntil <= 3 && daysUntil >= 0) {
            alertCount++;
            let currencyDisplay = sub.currency || 'THB';
            let thbPrice = parseFloat(sub.price);
            if (currencyDisplay.toLowerCase() !== 'thb') {
                const code = currencyDisplay.toLowerCase();
                const rate = exchangeRates[code] || 1;
                const thbEquivalent = (parseFloat(sub.price) / rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                currencyDisplay = `${currencyDisplay.toUpperCase()} (≈ ${thbEquivalent} บ.)`;
            }

            const isUrgentTrial = sub.isFreeTrial && daysUntil <= 1;
            const title = daysUntil === 0 
                ? (sub.isFreeTrial ? `หมดทดลองใช้ฟรี ${sub.name} วันนี้!` : `ถึงกำหนดชำระค่า ${sub.name} วันนี้!`) 
                : (sub.isFreeTrial ? `ทดลองใช้ ${sub.name} จะหมดในอีก ${daysUntil} วัน` : `ค่า ${sub.name} จะถึงกำหนดในอีก ${daysUntil} วัน`);
            const body = `ยอดชำระ: ${formatMoney(sub.price)} ${currencyDisplay}`;
            
            // Build Google Calendar Link (Allday event for that date)
            const d = new Date(nextDate);
            const dStr = d.toISOString().replace(/-|:|\.\d\d\d/g, '').substring(0,8);
            const nextD = new Date(d);
            nextD.setDate(d.getDate() + 1);
            const nextDStr = nextD.toISOString().replace(/-|:|\.\d\d\d/g, '').substring(0,8);
            
            const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('รอบบิล: ' + sub.name)}&dates=${dStr}/${nextDStr}&details=${encodeURIComponent(body)}`;

            html += `
            <div class="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border ${isUrgentTrial ? 'border-rose-300 dark:border-rose-800' : 'border-slate-100 dark:border-slate-700'}">
                <div class="flex gap-3">
                    <div class="w-10 h-10 rounded-full ${isUrgentTrial ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'} flex items-center justify-center shrink-0">
                        <i class="${isUrgentTrial ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-bell'}"></i>
                    </div>
                    <div class="flex-1">
                        <h4 class="text-sm font-bold ${isUrgentTrial ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'}">${title}</h4>
                        <p class="text-xs text-slate-500 mt-1">${body}</p>
                        <a href="${calUrl}" target="_blank" class="inline-flex items-center gap-1 mt-2 text-[10px] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-2 py-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors">
                            <i class="fa-regular fa-calendar-plus"></i> เพิ่มลงปฏิทิน
                        </a>
                    </div>
                </div>
            </div>`;
            
            // Browser Notification if granted and not notified yet
            if (permissionGranted) {
                const notiKey = `${sub.id}_${nextDate.toISOString().slice(0, 10)}`;
                if (!notifiedLogs[notiKey]) {
                    const notification = new Notification(title, {
                        body: body,
                        icon: '/favicon.ico',
                        tag: notiKey
                    });
                    notification.onclick = function() { window.focus(); this.close(); };
                    notifiedLogs[notiKey] = today;
                    updatedLogs = true;
                }
            }
        }
    });
    
    if (notiList) {
        if (alertCount === 0) {
            notiList.innerHTML = `<div class="text-center text-slate-500 py-10"><i class="fa-regular fa-face-smile-wink text-3xl mb-2 opacity-50"></i><p class="text-sm">ไม่มีบิลใกล้กำหนดชำระ</p></div>`;
        } else {
            notiList.innerHTML = html;
        }
    }
    
    // Badge indicator
    [notiBadgeMobile, notiBadgeDesktop].forEach(btn => {
        if (btn) {
            if (alertCount > 0) {
                btn.classList.add('relative');
                if (!btn.querySelector('.noti-dot')) {
                    btn.innerHTML += '<span class="noti-dot absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full animate-ping"></span><span class="noti-dot absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full"></span>';
                }
            } else {
                btn.classList.remove('relative');
                const dots = btn.querySelectorAll('.noti-dot');
                dots.forEach(d => d.remove());
            }
        }
    });

    if (updatedLogs) {
        const keys = Object.keys(notifiedLogs);
        if (keys.length > 50) {
            const newLogs = {};
            keys.slice(-30).forEach(k => newLogs[k] = notifiedLogs[k]);
            localStorage.setItem('notifiedLogs', JSON.stringify(newLogs));
        } else {
            localStorage.setItem('notifiedLogs', JSON.stringify(notifiedLogs));
        }
    }
}
