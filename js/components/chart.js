/**
 * js/components/chart.js
 * Handles rendering Donut Chart (Dashboard) and Annual Chart (Calendar)
 */
import { getCategoryName } from '../utils/helpers.js';

let donutChartInstance = null;
let annualChartInstance = null;

// Predefined colors for categories
const categoryColors = {
    'entertainment': '#f43f5e', // rose
    'software': '#3b82f6', // blue
    'game': '#a855f7', // purple
    'utilities': '#f59e0b', // amber
    'other': '#64748b' // slate
};

// Custom 10-color vibrant palette matching Tailwind's aesthetic
const customColors = [
    '#6366f1', // Indigo 500
    '#a855f7', // Purple 500
    '#10b981', // Emerald 500
    '#f43f5e', // Rose 500
    '#0ea5e9', // Sky 500
    '#f59e0b', // Amber 500
    '#ec4899', // Pink 500
    '#14b8a6', // Teal 500
    '#8b5cf6', // Violet 500
    '#f97316'  // Orange 500
];

// Convert THB to USD roughly if needed for display (or vice versa), but let's assume we render in THB natively, 
// so we need a rate passed in.
export function renderDonutChart(subs, mode = 'app', exchangeRates = {}) {
    const ctx = document.getElementById('donut-chart');
    const legendContainer = document.getElementById('chart-legend');
    const centerCount = document.getElementById('chart-center-count');
    const chartWrapper = document.getElementById('chart-wrapper');
    const centerLabel = document.getElementById('chart-center-label');

    if (!ctx || !legendContainer) return;

    if (subs.length === 0) {
        chartWrapper.classList.add('hidden');
        legendContainer.innerHTML = '<p class="text-sm text-slate-500 text-center py-4">ยังไม่มีข้อมูล 📝</p>';
        return;
    } else {
        chartWrapper.classList.remove('hidden');
    }

    // Process data
    const dataMap = {};
    let totalValue = 0;

    subs.filter(s => s.status !== 'paused').forEach(sub => {
        let currencyCode = (sub.currency || 'THB').toLowerCase();
        let thbPrice = parseFloat(sub.price);
        if (currencyCode !== 'thb') {
            const rate = exchangeRates[currencyCode] || 1;
            thbPrice = thbPrice / rate;
        }
        
        // Normalize to monthly for chart
        if (sub.cycle === 'yearly') {
            thbPrice = thbPrice / 12;
        }

        const key = mode === 'cat' ? sub.category : sub.name;
        if (!dataMap[key]) {
            dataMap[key] = { value: 0, label: mode === 'cat' ? getCategoryName(key) : key, items: [] };
        }
        dataMap[key].value += thbPrice;
        dataMap[key].items.push({ name: sub.name, price: thbPrice, currency: 'THB' });
        totalValue += thbPrice;
    });

    const labels = [];
    const data = [];
    const bgColors = [];

    // Sort by value desc
    const sortedKeys = Object.keys(dataMap).sort((a, b) => dataMap[b].value - dataMap[a].value);

    sortedKeys.forEach((key, index) => {
        labels.push(dataMap[key].label);
        data.push(dataMap[key].value);
        bgColors.push(mode === 'cat' ? (categoryColors[key] || categoryColors['other']) : customColors[index % customColors.length]);
    });

    // Destroy existing
    if (donutChartInstance) {
        donutChartInstance.destroy();
    }

    const isDark = document.documentElement.classList.contains('dark');

    // Create new
    donutChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: bgColors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const val = context.raw;
                            const pct = ((val / totalValue) * 100).toFixed(1);
                            return ` ${context.label}: ฿${val.toLocaleString(undefined, {minimumFractionDigits:2})} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    // Update center text
    if (centerCount) {
        centerCount.textContent = sortedKeys.length;
    }
    if (centerLabel) {
        centerLabel.textContent = mode === 'cat' ? 'หมวดหมู่' : 'บริการ';
    }

    // Render Custom Legend
    legendContainer.innerHTML = '';
    sortedKeys.forEach((key, index) => {
        const item = dataMap[key];
        const pct = ((item.value / totalValue) * 100).toFixed(1);
        const color = bgColors[index];
        
        if (mode === 'cat' && item.items.length > 0) {
            let subItemsHTML = item.items.map(sub => `
                <div class="flex justify-between items-center text-sm py-1.5">
                    <span class="text-slate-600 dark:text-slate-400 truncate pr-2 w-32 flex-1"><span class="w-2 h-2 rounded-full inline-block mr-2" style="background-color: ${color}80"></span>${sub.name}</span>
                    <span class="text-slate-700 dark:text-slate-300 font-medium">฿${sub.price.toLocaleString(undefined, {minimumFractionDigits:0})}</span>
                </div>
            `).join('');

            legendContainer.innerHTML += `
                <details class="group bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden mb-2 last:mb-0 transition-all">
                    <summary class="flex justify-between items-center p-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden outline-none">
                        <div class="flex items-center gap-3.5 flex-1 min-w-0">
                            <div class="w-4 h-4 rounded-full shadow-sm shrink-0" style="background-color: ${color}"></div>
                            <div class="flex flex-col min-w-0 flex-1">
                                <span class="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">${item.label}</span>
                                <span class="text-xs text-slate-500">${pct}%</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-2.5 shrink-0 pl-2">
                            <span class="text-sm font-bold text-slate-800 dark:text-slate-100">฿${item.value.toLocaleString(undefined, {minimumFractionDigits:0})}</span>
                            <i class="fa-solid fa-chevron-down text-[10px] text-slate-400 group-open:rotate-180 transition-transform"></i>
                        </div>
                    </summary>
                    <div class="px-3 pb-2.5 pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                        ${subItemsHTML}
                    </div>
                </details>
            `;
        } else {
            legendContainer.innerHTML += `
                <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 mb-2 last:mb-0">
                    <div class="flex items-center gap-3.5 flex-1 min-w-0">
                        <div class="w-4 h-4 rounded-full shadow-sm shrink-0" style="background-color: ${color}"></div>
                        <div class="flex flex-col min-w-0 flex-1">
                            <span class="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">${item.label}</span>
                            <span class="text-xs text-slate-500">${pct}%</span>
                        </div>
                    </div>
                    <span class="text-sm font-bold text-slate-800 dark:text-slate-100 shrink-0 pl-2">฿${item.value.toLocaleString(undefined, {minimumFractionDigits:0})}</span>
                </div>
            `;
        }
    });
}
