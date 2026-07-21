export function renderAnalyticsChart(subs, exchangeRates) {
    const ctxTrend = document.getElementById('analytics-chart');
    const ctxBar = document.getElementById('analytics-bar-chart');
    if (!ctxTrend || !ctxBar) return;
    
    const today = new Date();
    const isDark = document.documentElement.classList.contains('dark');
    
    let baseMonthlyCost = 0;
    let maxSub = null;
    let maxSubPrice = 0;
    
    const categoryTotals = {};
    const categoryLabels = {
        'entertainment': 'บันเทิง',
        'software': 'ซอฟต์แวร์',
        'game': 'เกม',
        'utilities': 'บิล/สาธารณูปโภค',
        'other': 'อื่นๆ'
    };
    const categoryColors = {
        'entertainment': '#f43f5e',
        'software': '#3b82f6',
        'game': '#8b5cf6',
        'utilities': '#10b981',
        'other': '#64748b'
    };

    subs.filter(s => s.status !== 'paused').forEach(sub => {
        let currencyCode = (sub.currency || 'THB').toLowerCase();
        let thbPrice = parseFloat(sub.price);
        if (currencyCode !== 'thb') {
            const rate = exchangeRates[currencyCode] || 1;
            thbPrice = thbPrice / rate;
        }
        if (sub.cycle === 'yearly') {
            thbPrice = thbPrice / 12;
        }
        baseMonthlyCost += thbPrice;
        
        if (thbPrice > maxSubPrice) {
            maxSubPrice = thbPrice;
            maxSub = sub;
        }
        
        const cat = sub.category || 'other';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + thbPrice;
    });

    // Update Quick Stats
    const avgCostEl = document.getElementById('analytics-avg-cost');
    if (avgCostEl) avgCostEl.innerText = `฿${baseMonthlyCost.toLocaleString('th-TH', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    
    const maxSubEl = document.getElementById('analytics-max-sub');
    if (maxSubEl) maxSubEl.innerText = maxSub ? maxSub.name : '-';
    
    let topCat = null;
    let topCatVal = 0;
    for (const [cat, val] of Object.entries(categoryTotals)) {
        if (val > topCatVal) {
            topCatVal = val;
            topCat = cat;
        }
    }
    const topCatEl = document.getElementById('analytics-top-cat');
    if (topCatEl) topCatEl.innerText = topCat ? (categoryLabels[topCat] || topCat) : '-';

    // === 1. Category Bar Chart ===
    const barLabels = [];
    const barData = [];
    const barColors = [];
    
    // Sort categories by value desc
    const sortedCats = Object.entries(categoryTotals).sort((a,b) => b[1] - a[1]);
    sortedCats.forEach(([cat, val]) => {
        barLabels.push(categoryLabels[cat] || cat);
        barData.push(val);
        barColors.push(categoryColors[cat] || categoryColors['other']);
    });

    if (window.analyticsBarChartInstance) {
        window.analyticsBarChartInstance.destroy();
    }
    window.analyticsBarChartInstance = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: barLabels,
            datasets: [{
                data: barData,
                backgroundColor: barColors,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // Horizontal bar chart
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: isDark ? '#334155' : '#e2e8f0' },
                    ticks: { color: isDark ? '#94a3b8' : '#64748b' }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: isDark ? '#94a3b8' : '#64748b' }
                }
            }
        }
    });

    // === 2. Trend Line Chart ===
    const months = [];
    const costs = [];
    for (let i = 0; i <= 5; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
        months.push(d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }));
        // Simple mock trend: slight increase over time if they keep subscribing
        costs.push(baseMonthlyCost * (1 + (i * 0.05)));
    }

    if (window.analyticsChartInstance) {
        window.analyticsChartInstance.destroy();
    }
    window.analyticsChartInstance = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'คาดการณ์ค่าใช้จ่าย (THB)',
                data: costs,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: isDark ? '#94a3b8' : '#64748b' }
                },
                y: {
                    border: { display: false },
                    grid: { color: isDark ? '#334155' : '#e2e8f0' },
                    ticks: { color: isDark ? '#94a3b8' : '#64748b' }
                }
            }
        }
    });
    
    // Update AI insight
    const aiInsight = document.getElementById('analytics-ai-insight');
    if (aiInsight) {
        if (baseMonthlyCost > 0) {
            let topCatName = topCat ? (categoryLabels[topCat] || topCat) : '';
            aiInsight.innerHTML = `พบว่าคุณใช้เงินไปกับหมวดหมู่ <b>${topCatName}</b> มากที่สุดถึง <b>฿${topCatVal.toLocaleString('th-TH', {maximumFractionDigits:0})}</b> ต่อเดือน! <br><br>และจากแนวโน้ม คาดว่าเดือนหน้ายอดรวมจะอยู่ที่ <b>฿${costs[1].toLocaleString('th-TH', {maximumFractionDigits:0})}</b> หากต้องการประหยัดเพิ่ม ลองพิจารณายกเลิกบริการในหมวด ${topCatName} ที่ไม่ได้ใช้งานดูนะครับ 💡`;
        } else {
            aiInsight.innerHTML = `เพิ่มบริการของคุณเพื่อดูการวิเคราะห์พฤติกรรมการใช้จ่ายล่วงหน้า 💡`;
        }
    }
}

export function openYearInReview(subs, exchangeRates) {
    const modal = document.getElementById('modal-year-in-review');
    const backdrop = document.getElementById('modal-backdrop');
    if (!modal || !backdrop) return;
    
    let totalYearly = 0;
    let maxSub = null;
    let maxSubPrice = 0;
    let activeCount = 0;
    let pausedCount = 0;

    subs.forEach(sub => {
        if (sub.status === 'paused') {
            pausedCount++;
            return;
        }
        activeCount++;
        
        let currencyCode = (sub.currency || 'THB').toLowerCase();
        let thbPrice = parseFloat(sub.price);
        if (currencyCode !== 'thb') {
            const rate = exchangeRates[currencyCode] || 1;
            thbPrice = thbPrice / rate;
        }
        
        // Calculate yearly price
        let yearlyPrice = thbPrice;
        if (sub.cycle === 'monthly') {
            yearlyPrice = thbPrice * 12;
        } else if (sub.cycle === 'weekly') {
            yearlyPrice = thbPrice * 52;
        }

        totalYearly += yearlyPrice;

        if (yearlyPrice > maxSubPrice) {
            maxSubPrice = yearlyPrice;
            maxSub = sub;
        }
    });

    document.getElementById('yir-year').textContent = new Date().getFullYear() + 543;
    
    // Formatting currency
    const formatCurrency = (val) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(val);
    
    document.getElementById('yir-total-spent').textContent = formatCurrency(totalYearly);
    document.getElementById('yir-active-count').textContent = activeCount;
    document.getElementById('yir-paused-count').textContent = pausedCount;
    
    if (maxSub) {
        document.getElementById('yir-top-name').textContent = maxSub.name;
        document.getElementById('yir-top-price').textContent = `${formatCurrency(maxSubPrice)} / ปี`;
        import('../utils/helpers.js').then(module => {
            document.getElementById('yir-top-icon').className = module.getCategoryIcon(maxSub.category);
        });
    } else {
        document.getElementById('yir-top-name').textContent = 'ไม่มีข้อมูล';
        document.getElementById('yir-top-price').textContent = '0.00 THB';
    }

    // Show modal
    modal.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    
    // Small delay for transition
    setTimeout(() => {
        modal.classList.remove('translate-y-full', 'lg:translate-y-4', 'lg:scale-95', 'lg:opacity-0');
        backdrop.classList.remove('opacity-0');
    }, 10);
}
