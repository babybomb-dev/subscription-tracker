const fs = require('fs');
const filePath = 'app.js';
let content = fs.readFileSync(filePath, 'utf-8');

const newCall = '    renderBudgetUI();\n    renderUpcoming7Days();';
content = content.replace('    renderBudgetUI();', newCall);

const newFunction = `
// ==========================================
// 8. Upcoming 7 Days Logic
// ==========================================
function renderUpcoming7Days() {
    const section = document.getElementById('upcoming-section');
    const container = document.getElementById('upcoming-list');
    if (!section || !container) return;

    const today = new Date();
    today.setHours(0,0,0,0);

    let upcomingSubs = subscriptions.filter(sub => {
        if (sub.isActive === false || !sub.date) return false;
        
        let subDate = new Date(sub.date);
        subDate.setHours(0,0,0,0);
        
        let loopCount = 0;
        while (subDate < today) {
            if (sub.cycle === 'yearly') {
                subDate.setFullYear(subDate.getFullYear() + 1);
            } else {
                subDate.setMonth(subDate.getMonth() + 1);
            }
            loopCount++;
            if(loopCount > 1000) break;
        }

        const diffTime = subDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        sub.diffDays = diffDays;
        return diffDays >= 0 && diffDays <= 7;
    });

    upcomingSubs.sort((a, b) => a.diffDays - b.diffDays);

    container.innerHTML = '';
    
    if (upcomingSubs.length === 0) {
        container.innerHTML = \`<p class="text-sm text-slate-500 dark:text-slate-400 py-4 w-full text-center">ไม่มีรายการที่ต้องชำระใน 7 วันนี้</p>\`;
        return;
    }

    upcomingSubs.forEach(sub => {
        const isUSD = sub.currency === 'USD';
        const priceText = isUSD ? \`$\${sub.price}\` : \`\${sub.price} บ.\`;
        const logoUrl = getServiceLogo(sub.name);
        
        let colorClass = 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50';
        if (sub.diffDays === 0) {
            colorClass = 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/50 shadow-[0_0_10px_rgba(225,29,72,0.3)] animate-pulse';
        } else if (sub.diffDays <= 3) {
            colorClass = 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/50';
        } else if (sub.diffDays <= 5) {
            colorClass = 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50';
        }

        const daysText = sub.diffDays === 0 ? 'วันนี้' : \`อีก \${sub.diffDays} วัน\`;
        
        const card = document.createElement('div');
        card.className = \`min-w-[110px] shrink-0 p-3 rounded-2xl flex flex-col items-center justify-center border text-center transition-transform cursor-pointer active:scale-95 \${colorClass}\`;
        
        let logoHtml = logoUrl ? \`<img src="\${logoUrl}" class="w-full h-full object-cover">\` : \`<div class="font-bold">\${sub.name.charAt(0)}</div>\`;
        card.innerHTML = \`
            <div class="w-10 h-10 rounded-full overflow-hidden bg-white/50 dark:bg-black/20 flex items-center justify-center mb-2 shadow-sm">
                \${logoHtml}
            </div>
            <span class="text-xs font-bold truncate w-full mb-0.5">\${sub.name}</span>
            <span class="text-[10px] opacity-80">\${priceText}</span>
            <div class="mt-2 text-[10px] font-bold bg-white/40 dark:bg-black/30 px-2 py-0.5 rounded-full">\${daysText}</div>
        \`;
        
        card.addEventListener('click', () => {
            if (typeof window.editSub === 'function') {
                window.editSub(sub.id);
            }
        });
        
        container.appendChild(card);
    });
}
`;

content = content.replace(newFunction, ''); // remove if exists
content += newFunction;
fs.writeFileSync(filePath, content, 'utf-8');
console.log('app.js updated successfully (forced).');
