import { updateCustomCategories } from '../utils/helpers.js';
import { exportToCSV } from '../export.js';
import { currentSubs } from '../main.js';

export function initSettings() {
    const btnAddCat = document.getElementById('btn-settings-add-cat');
    const inputNewCat = document.getElementById('settings-new-cat');
    const catList = document.getElementById('settings-cat-list');
    
    // Initial Render
    renderSettingsCategories();
    
    // Load saved settings
    const notiDays = localStorage.getItem('subtracker_noti_days') || '3';
    const baseCurrency = localStorage.getItem('subtracker_base_currency') || 'THB';
    
    document.getElementById('settings-noti-days').value = notiDays;
    document.getElementById('settings-base-currency').value = baseCurrency;

    if (btnAddCat && inputNewCat) {
        btnAddCat.addEventListener('click', () => {
            const val = inputNewCat.value.trim();
            if (val) {
                // Read current custom categories
                let customCats = JSON.parse(localStorage.getItem('subtracker_custom_categories') || '[]');
                if (!customCats.includes(val)) {
                    customCats.push(val);
                    localStorage.setItem('subtracker_custom_categories', JSON.stringify(customCats));
                    updateCustomCategories();
                    renderSettingsCategories();
                    inputNewCat.value = '';
                }
            }
        });
    }

    // Theme Selection Logic
    const themeBtns = document.querySelectorAll('.theme-btn');
    const currentTheme = localStorage.getItem('subtracker_theme') || 'indigo';
    
    themeBtns.forEach(btn => {
        if (btn.dataset.theme === currentTheme) {
            btn.classList.add('ring-4', 'ring-slate-300', 'dark:ring-slate-600', 'scale-110');
        }
        
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            localStorage.setItem('subtracker_theme', theme);
            
            // Remove active state from all
            themeBtns.forEach(b => b.classList.remove('ring-4', 'ring-slate-300', 'dark:ring-slate-600', 'scale-110'));
            
            // Add active state to clicked
            btn.classList.add('ring-4', 'ring-slate-300', 'dark:ring-slate-600', 'scale-110');
            
            if (window.showToast) {
                window.showToast('เปลี่ยนธีมสำเร็จ (กดบันทึกเพื่อใช้การตั้งค่าใหม่)', 'success');
            }
        });
    });

    const btnExportCSV = document.getElementById('btn-export-csv');
    if (btnExportCSV) {
        btnExportCSV.addEventListener('click', () => {
            exportToCSV(currentSubs);
        });
    }

    const btnSave = document.getElementById('btn-save-settings');
    if (btnSave) {
        btnSave.addEventListener('click', () => {
            const newNotiDays = document.getElementById('settings-noti-days').value;
            const newCurrency = document.getElementById('settings-base-currency').value;
            
            localStorage.setItem('subtracker_noti_days', newNotiDays);
            localStorage.setItem('subtracker_base_currency', newCurrency);
            
            // Notify or update state
            if (window.showToast) {
                window.showToast('บันทึกการตั้งค่าสำเร็จ!', 'success');
            }
            
            // Reload page to apply new currency globally (simplest way to re-render everything)
            setTimeout(() => {
                location.reload();
            }, 1000);
        });
    }
}

export function renderSettingsCategories() {
    const catList = document.getElementById('settings-cat-list');
    if (!catList) return;
    
    let customCats = JSON.parse(localStorage.getItem('subtracker_custom_categories') || '[]');
    if (customCats.length === 0) {
        catList.innerHTML = '<span class="text-xs text-slate-400">ยังไม่มีหมวดหมู่เพิ่มเติม</span>';
        return;
    }
    
    catList.innerHTML = customCats.map(cat => `
        <div class="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg text-sm font-medium">
            <span>${cat}</span>
            <button class="text-rose-500 hover:text-rose-700" onclick="window.deleteCustomCategory('${cat}')"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `).join('');
}

// Global function for inline onclick
window.deleteCustomCategory = function(catToRemove) {
    let customCats = JSON.parse(localStorage.getItem('subtracker_custom_categories') || '[]');
    customCats = customCats.filter(c => c !== catToRemove);
    localStorage.setItem('subtracker_custom_categories', JSON.stringify(customCats));
    updateCustomCategories();
    renderSettingsCategories();
};
