/**
 * js/components/history.js
 * Renders the Payment History
 */

export function renderHistoryList(historyData, exchangeRates = {}) {
    const container = document.getElementById('history-list-container');
    if (!container) return;

    if (!historyData || historyData.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-48 text-slate-400">
                <i class="fa-solid fa-receipt text-4xl mb-3 opacity-30"></i>
                <p class="text-sm">ยังไม่มีประวัติการชำระเงิน</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    // Group history by month (e.g. "กรกฎาคม 2026")
    const grouped = {};
    historyData.forEach(item => {
        const d = new Date(item.paidAt);
        const monthYear = d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
        if (!grouped[monthYear]) {
            grouped[monthYear] = [];
        }
        grouped[monthYear].push(item);
    });

    const formatCurrency = (val) => val.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});

    for (const [monthYear, items] of Object.entries(grouped)) {
        // Month Header
        const header = document.createElement('h3');
        header.className = "text-sm font-bold text-slate-500 dark:text-slate-400 mt-6 mb-2";
        header.textContent = monthYear;
        container.appendChild(header);

        // List
        const listContainer = document.createElement('div');
        listContainer.className = "bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden";
        
        items.forEach((item, idx) => {
            const isLast = idx === items.length - 1;
            const borderClass = isLast ? "" : "border-b border-slate-100 dark:border-slate-800";
            
            const currency = (item.currency || 'THB').toUpperCase();
            let originalPriceText = '';
            
            if (currency !== 'THB') {
                originalPriceText = `<p class="text-[10px] text-slate-400 text-right mt-0.5">${formatCurrency(item.price)} ${currency}</p>`;
            }

            // Convert to THB
            let thbPrice = parseFloat(item.price);
            if (currency !== 'THB') {
                const rate = exchangeRates[currency.toLowerCase()] || 1;
                thbPrice = thbPrice / rate;
            }

            const itemEl = document.createElement('div');
            itemEl.className = `flex items-center justify-between p-4 ${borderClass}`;
            
            const d = new Date(item.paidAt);
            const timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            const dateStr = d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });

            itemEl.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 flex items-center justify-center shrink-0">
                        <i class="fa-solid fa-check"></i>
                    </div>
                    <div>
                        <p class="font-bold text-slate-800 dark:text-slate-200 text-sm">${item.name}</p>
                        <p class="text-xs text-slate-500 dark:text-slate-400">${dateStr} • ${timeStr}</p>
                    </div>
                </div>
                <div>
                    <p class="font-bold text-slate-800 dark:text-slate-200 text-sm text-right">฿${formatCurrency(thbPrice)}</p>
                    ${originalPriceText}
                </div>
            `;
            listContainer.appendChild(itemEl);
        });
        
        container.appendChild(listContainer);
    }
}

export function renderLatestTransactions(historyData, exchangeRates = {}) {
    const container = document.getElementById('latest-transactions-container');
    if (!container) return;

    if (!historyData || historyData.length === 0) {
        container.innerHTML = `<p class="text-sm text-slate-500 italic py-4 w-full text-center">ยังไม่มีประวัติการชำระเงิน 📝</p>`;
        return;
    }

    container.innerHTML = '';
    
    const formatCurrency = (val) => val.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});

    // Take top 4 items
    const latestItems = historyData.slice(0, 4);

    latestItems.forEach((item) => {
        const currency = (item.currency || 'THB').toUpperCase();
        let originalPriceText = '';
        
        if (currency !== 'THB') {
            originalPriceText = `<p class="text-[10px] text-slate-400 text-right mt-0.5">${formatCurrency(item.price)} ${currency}</p>`;
        }

        let thbPrice = parseFloat(item.price);
        if (currency !== 'THB') {
            const rate = exchangeRates[currency.toLowerCase()] || 1;
            thbPrice = thbPrice / rate;
        }

        const d = new Date(item.paidAt);
        const timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        const dateStr = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

        const itemEl = document.createElement('div');
        itemEl.className = "flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800";
        itemEl.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <i class="fa-solid fa-receipt"></i>
                </div>
                <div>
                    <h4 class="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">${item.name}</h4>
                    <p class="text-[10px] text-slate-500">${dateStr} • ${timeStr}</p>
                </div>
            </div>
            <div>
                <p class="text-sm font-bold text-slate-800 dark:text-slate-100 text-right">${formatCurrency(thbPrice)} <span class="text-[10px]">THB</span></p>
                ${originalPriceText}
            </div>
        `;
        container.appendChild(itemEl);
    });
}
