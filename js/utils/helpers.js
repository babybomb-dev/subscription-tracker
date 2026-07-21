/**
 * js/utils/helpers.js
 * Utility functions for formatting, calculating dates, etc.
 */

// Format money to standard currency format
export function formatMoney(amount, currency = 'THB') {
    const num = parseFloat(amount);
    if (isNaN(num)) return '0.00';
    
    // For THB we can just do 2 decimal places and commas
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Calculate next billing date based on start date and cycle
export function calculateNextBillingDate(startDateStr, cycle) {
    if (!startDateStr) return null;
    const start = new Date(startDateStr);
    const now = new Date();
    let nextDate = new Date(start);

    // If start date is in the future, that is the next billing date
    if (start > now) {
        return start;
    }

    if (cycle === 'monthly') {
        // Calculate months diff
        const monthsDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
        nextDate.setMonth(start.getMonth() + monthsDiff);
        
        // If the date in this month has passed, go to next month
        if (nextDate < now) {
            nextDate.setMonth(nextDate.getMonth() + 1);
        }
    } else if (cycle === 'yearly') {
        const yearsDiff = now.getFullYear() - start.getFullYear();
        nextDate.setFullYear(start.getFullYear() + yearsDiff);
        
        if (nextDate < now) {
            nextDate.setFullYear(nextDate.getFullYear() + 1);
        }
    }
    
    return nextDate;
}

// Calculate days until a date
export function getDaysUntil(date) {
    if (!date) return null;
    const now = new Date();
    
    // Normalize to midnight to avoid partial days
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const diffTime = Math.abs(next - today);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export let customCategoriesMap = {};

export function updateCustomCategories(categories) {
    customCategoriesMap = {};
    categories.forEach(c => customCategoriesMap[c.id] = c.name);
}

// Map category ID to readable name
export function getCategoryName(catId) {
    const map = {
        'entertainment': 'บันเทิง',
        'software': 'ซอฟต์แวร์',
        'game': 'เกม',
        'utilities': 'บิล/สาธารณูปโภค',
        'other': 'อื่นๆ'
    };
    return map[catId] || customCategoriesMap[catId] || 'อื่นๆ';
}

// Map category ID to icon
export function getCategoryIcon(catId) {
    const map = {
        'entertainment': '<i class="fa-solid fa-film text-rose-500"></i>',
        'software': '<i class="fa-solid fa-code text-blue-500"></i>',
        'game': '<i class="fa-solid fa-gamepad text-purple-500"></i>',
        'utilities': '<i class="fa-solid fa-bolt text-amber-500"></i>',
        'other': '<i class="fa-solid fa-box text-slate-500"></i>'
    };
    if (catId && catId.startsWith('custom_')) {
        return '<i class="fa-solid fa-tag text-indigo-500"></i>';
    }
    return map[catId] || map['other'];
}

// Get Logo HTML (using clearbit or fallback to icon)
import { subscriptionPresets } from './presets.js';

export function getLogoHTML(subName, catId) {
    const preset = subscriptionPresets.find(p => p.name.toLowerCase() === subName.toLowerCase());
    
    if (preset && preset.domain) {
        return `
            <img src="https://www.google.com/s2/favicons?domain=${preset.domain}&sz=128" class="w-full h-full object-contain p-1.5" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
            <div class="hidden w-full h-full items-center justify-center">${getCategoryIcon(catId)}</div>
        `;
    } else {
        // Fallback to UI-Avatars to avoid ugly google globe
        const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(subName)}&background=random&color=fff&size=128&bold=true`;
        return `
            <img src="${fallbackUrl}" class="w-full h-full object-contain p-1 rounded-xl" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
            <div class="hidden w-full h-full items-center justify-center">${getCategoryIcon(catId)}</div>
        `;
    }
}

// Generate PromptPay Payload
const CRC16_CCITT = (payload) => {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) > 0) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
};

export function generatePromptPayPayload(id, amount) {
    id = id.replace(/[^0-9]/g, '');
    let targetId = '';
    if (id.length === 10) {
        targetId = `01130066${id.substring(1)}`;
    } else if (id.length === 13) {
        targetId = `0213${id}`;
    } else {
        return null; 
    }

    let payload = `00020101021129370016A000000677010111${targetId}5802TH5303764`;
    if (amount > 0) {
        const amtStr = amount.toFixed(2);
        const amtLen = amtStr.length.toString().padStart(2, '0');
        payload += `54${amtLen}${amtStr}`;
    }
    payload += `6304`;
    const crc = CRC16_CCITT(payload);
    return payload + crc;
}

// Generate Google Calendar Link
export function generateGoogleCalendarUrl(subName, price, currency, nextDate) {
    if (!nextDate) return '#';
    const text = encodeURIComponent(`ชำระค่า ${subName}`);
    
    // Format dates to YYYYMMDD (All day event)
    const startDate = nextDate.toISOString().replace(/-|:|\.\d\d\d/g,"").slice(0, 8);
    // Add one day for end date
    const end = new Date(nextDate);
    end.setDate(end.getDate() + 1);
    const endDate = end.toISOString().replace(/-|:|\.\d\d\d/g,"").slice(0, 8);
    
    const details = encodeURIComponent(`กำหนดชำระค่า ${subName}\nยอดเงิน: ${formatMoney(price)} ${currency}\nสร้างจากแอป SubTracker`);
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${startDate}/${endDate}&details=${details}`;
}
