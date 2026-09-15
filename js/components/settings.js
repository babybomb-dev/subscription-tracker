let getCategories = () => [];
let addCategory = null;
let deleteCategory = null;
let notify = () => {};

export function initSettings(options = {}) {
    getCategories = typeof options.getCategories === 'function' ? options.getCategories : getCategories;
    addCategory = typeof options.onAddCategory === 'function' ? options.onAddCategory : null;
    deleteCategory = typeof options.onDeleteCategory === 'function' ? options.onDeleteCategory : null;
    notify = typeof options.notify === 'function' ? options.notify : notify;

    const btnAddCat = document.getElementById('btn-settings-add-cat');
    const inputNewCat = document.getElementById('settings-new-cat');
    const catList = document.getElementById('settings-cat-list');
    const savedNotificationDays = localStorage.getItem('subtracker_noti_days') || '3';
    const notificationSelect = document.getElementById('settings-noti-days');
    const baseCurrencySelect = document.getElementById('settings-base-currency');

    if (notificationSelect) notificationSelect.value = ['1', '3', '7'].includes(savedNotificationDays) ? savedNotificationDays : '3';
    if (baseCurrencySelect) baseCurrencySelect.value = 'THB';
    renderSettingsCategories();

    if (btnAddCat && inputNewCat && addCategory) {
        btnAddCat.addEventListener('click', async () => {
            const name = inputNewCat.value.trim();
            if (!name) return;

            btnAddCat.disabled = true;
            try {
                await addCategory(name);
                inputNewCat.value = '';
                renderSettingsCategories();
                notify('เพิ่มหมวดหมู่ใหม่แล้ว', 'success');
            } catch (error) {
                notify('บันทึกไม่สำเร็จ', 'error');
            } finally {
                btnAddCat.disabled = false;
            }
        });
    }

    if (catList && deleteCategory) {
        catList.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-delete-category]');
            if (!button) return;

            button.disabled = true;
            try {
                await deleteCategory(button.dataset.deleteCategory);
                renderSettingsCategories();
                notify('ลบหมวดหมู่แล้ว', 'success');
            } catch (error) {
                button.disabled = false;
                notify('บันทึกไม่สำเร็จ', 'error');
            }
        });
    }

    const themeBtns = document.querySelectorAll('.theme-btn');
    const currentTheme = localStorage.getItem('subtracker_theme') || 'indigo';

    themeBtns.forEach(btn => {
        if (btn.dataset.theme === currentTheme) {
            btn.classList.add('ring-4', 'ring-slate-300', 'dark:ring-slate-600', 'scale-110');
        }

        btn.addEventListener('click', () => {
            localStorage.setItem('subtracker_theme', btn.dataset.theme);
            themeBtns.forEach(item => item.classList.remove('ring-4', 'ring-slate-300', 'dark:ring-slate-600', 'scale-110'));
            btn.classList.add('ring-4', 'ring-slate-300', 'dark:ring-slate-600', 'scale-110');
            notify('เลือกธีมแล้ว (กดบันทึกเพื่อใช้การตั้งค่าและรีโหลด)', 'success');
        });
    });

    const btnSave = document.getElementById('btn-save-settings');
    if (btnSave) {
        btnSave.addEventListener('click', () => {
            const notificationDays = document.getElementById('settings-noti-days')?.value || '3';
            localStorage.setItem('subtracker_noti_days', notificationDays);
            notify('บันทึกการตั้งค่าสำเร็จ!', 'success');
            setTimeout(() => location.reload(), 1000);
        });
    }
}

export function refreshSettingsCategories() {
    renderSettingsCategories();
}

function renderSettingsCategories() {
    const catList = document.getElementById('settings-cat-list');
    if (!catList) return;

    const categories = getCategories().filter(category => category && typeof category.id === 'string' && typeof category.name === 'string');
    catList.replaceChildren();

    if (!categories.length) {
        const empty = document.createElement('span');
        empty.className = 'text-xs text-slate-400';
        empty.textContent = 'ยังไม่มีหมวดหมู่เพิ่มเติม';
        catList.appendChild(empty);
        return;
    }

    categories.forEach(category => {
        const item = document.createElement('div');
        item.className = 'flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg text-sm font-medium';

        const label = document.createElement('span');
        label.textContent = category.name;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'text-rose-500 hover:text-rose-700 disabled:opacity-50';
        button.dataset.deleteCategory = category.id;
        button.setAttribute('aria-label', `ลบหมวดหมู่ ${category.name}`);
        button.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';

        item.append(label, button);
        catList.appendChild(item);
    });
}
