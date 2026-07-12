import { auth, db } from './firebase-config.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    doc,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==========================================
// 1. DOM Elements
// ==========================================
// Screens
const loadingScreen = document.getElementById('loading-screen');
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');

// Auth
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authSwitchBtn = document.getElementById('auth-switch-btn');
const authSwitchText = document.getElementById('auth-switch-text');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-btn');

// App Header
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const toggleViewBtn = document.getElementById('toggle-view-btn');
const toggleKnob = document.getElementById('toggle-knob');
const totalCostEl = document.getElementById('total-cost');
const totalLabelEl = document.getElementById('total-label');
const profileBtn = document.getElementById('profile-btn');
const headerDisplayName = document.getElementById('header-display-name');
const headerAvatarInitial = document.getElementById('header-avatar-initial');
const headerAvatarImg = document.getElementById('header-avatar-img');

// Form & Inputs
const subForm = document.getElementById('sub-form');
const customNameContainer = document.getElementById('custom-name-container');
const subName = document.getElementById('sub-name');
const subPrice = document.getElementById('sub-price');
const subCurrency = document.getElementById('sub-currency');
const subExtraPrice = document.getElementById('sub-extra-price');
const extraPriceContainer = document.getElementById('extra-price-container');
const subCategory = document.getElementById('sub-category');
const subDate = document.getElementById('sub-date');

const subIsActive = document.getElementById('sub-is-active');
const submitBtnText = document.getElementById('submit-btn-text');
const submitBtn = document.getElementById('submit-btn');
const formError = document.getElementById('form-error');

// List & Controls
const subCountEl = document.getElementById('sub-count');
const sortSub = document.getElementById('sort-sub');
const subList = document.getElementById('sub-list');
const subCalendar = document.getElementById('sub-calendar');
const listControlsContainer = document.getElementById('list-controls-container');
const emptyState = document.getElementById('empty-state');
const chartSection = document.getElementById('chart-section');
const chartViewAppBtn = document.getElementById('chart-view-app');
const chartViewCategoryBtn = document.getElementById('chart-view-category');

let chartViewMode = localStorage.getItem('chartViewMode') || 'app'; // Default to app if no preference

// Calendar state
let currentCalDate = new Date();
let viewMode = 'list'; // 'list' or 'calendar'

// Helper
function getCategoryName(cat) {
    switch(cat) {
        case 'entertainment': return '🎬 บันเทิง';
        case 'work': return '💻 การทำงาน';
        case 'utilities': return '⚡ สาธารณูปโภค';
        case 'others': return '🛍️ อื่นๆ';
        default: return '🛍️ อื่นๆ';
    }
}

// Modal
const deleteModal = document.getElementById('delete-modal');
const deleteModalContent = document.getElementById('delete-modal-content');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

const paidModal = document.getElementById('paid-modal');
const paidModalContent = document.getElementById('paid-modal-content');
const cancelPaidBtn = document.getElementById('cancel-paid-btn');
const confirmPaidBtn = document.getElementById('confirm-paid-btn');

const historyModal = document.getElementById('history-modal');
const historyModalContent = document.getElementById('history-modal-content');
const closeHistoryBtn = document.getElementById('close-history-btn');
const historyList = document.getElementById('history-list');

let subIdToMarkPaid = null;

const profileModal = document.getElementById('profile-modal');
const profileModalContent = document.getElementById('profile-modal-content');
const closeProfileBtn = document.getElementById('close-profile-btn');
const profileForm = document.getElementById('profile-form');
const profileNameInput = document.getElementById('profile-name');
const profilePhotoUrlInput = document.getElementById('profile-photo-url');
const saveProfileBtn = document.getElementById('save-profile-btn');
const exportCsvBtn = document.getElementById('export-csv-btn');

exportCsvBtn.addEventListener('click', () => {
    if (subscriptions.length === 0) {
        alert('ไม่มีข้อมูลให้ดาวน์โหลด');
        return;
    }

    let csvContent = "\uFEFFชื่อบริการ,หมวดหมู่,รอบบิล,ราคาหลัก,สกุลเงิน,ค่าใช้จ่ายเกิน,วันที่ต้องจ่ายบิลรอบถัดไป,สถานะการใช้งาน\r\n";

    subscriptions.forEach(sub => {
        const name = `"${sub.name.replace(/"/g, '""')}"`;
        const cat = getCategoryName(sub.category);
        const cycle = sub.cycle === 'yearly' ? 'รายปี' : 'รายเดือน';
        const price = sub.price;
        const currency = sub.currency || 'THB';
        const extra = sub.extraPrice || 0;
        const date = sub.date;
        const status = sub.isActive !== false ? 'Active' : 'Paused';

        csvContent += `${name},${cat},${cycle},${price},${currency},${extra},${date},${status}\r\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `subtracker_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});
const profileError = document.getElementById('profile-error');
const profileSuccess = document.getElementById('profile-success');
const profileModalImg = document.getElementById('profile-modal-img');
const profileModalInitial = document.getElementById('profile-modal-initial');

// ==========================================
// 2. State Variables
// ==========================================
let currentUserId = null;
let subscriptions = [];
let isYearlyView = false;
let editTargetId = null; // Use Firestore document ID instead of array index
let myChart = null;
let isLoginMode = true; // For Auth toggle
let deleteTargetId = null;

// ==========================================
// 3. Initialization & Auth Handlers
// ==========================================

// Monitor Auth State
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        updateHeaderProfile(user);
        showScreen('app');
        await fetchSubs();
    } else {
        currentUserId = null;
        subscriptions = [];
        showScreen('auth');
    }
});

function showScreen(screen) {
    if (screen === 'app') {
        loadingScreen.classList.add('opacity-0', 'pointer-events-none');
        authScreen.classList.add('hidden');
        appScreen.classList.remove('hidden');
        setTimeout(() => loadingScreen.classList.add('hidden'), 500); // Wait for transition
    } else if (screen === 'auth') {
        loadingScreen.classList.add('opacity-0', 'pointer-events-none');
        appScreen.classList.add('hidden');
        authScreen.classList.remove('hidden');
        setTimeout(() => loadingScreen.classList.add('hidden'), 500);
    } else if (screen === 'loading') {
        loadingScreen.classList.remove('hidden');
        // Force reflow
        void loadingScreen.offsetWidth;
        loadingScreen.classList.remove('opacity-0', 'pointer-events-none');
    }
}

// Toggle Login / Register Mode
authSwitchBtn.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    authError.classList.add('hidden');
    if (isLoginMode) {
        authSubmitBtn.innerHTML = '<span>เข้าสู่ระบบ</span>';
        authSwitchText.textContent = 'ยังไม่มีบัญชีใช่ไหม?';
        authSwitchBtn.textContent = 'สมัครสมาชิก';
    } else {
        authSubmitBtn.innerHTML = '<span>สมัครสมาชิก</span>';
        authSwitchText.textContent = 'มีบัญชีอยู่แล้ว?';
        authSwitchBtn.textContent = 'เข้าสู่ระบบ';
    }
});

// Submit Auth Form
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = authEmail.value.trim();
    const password = authPassword.value.trim();

    if (!email || !password) return;

    authError.classList.add('hidden');

    // Simple UI Loading State for Button
    const originalBtnText = authSubmitBtn.innerHTML;
    authSubmitBtn.innerHTML = '<div class="animate-spin h-5 w-5 border-2 border-white border-r-transparent rounded-full"></div>';
    authSubmitBtn.disabled = true;

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            await createUserWithEmailAndPassword(auth, email, password);
        }
    } catch (error) {
        let msg = "เกิดข้อผิดพลาด โปรดลองอีกครั้ง";
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') msg = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
        else if (error.code === 'auth/email-already-in-use') msg = "อีเมลนี้ถูกใช้งานแล้ว";
        else if (error.code === 'auth/weak-password') msg = "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";

        authError.textContent = msg;
        authError.classList.remove('hidden');
    } finally {
        authSubmitBtn.innerHTML = originalBtnText;
        authSubmitBtn.disabled = false;
    }
});

// Logout
logoutBtn.addEventListener('click', async () => {
    try {
        showScreen('loading'); // Show loading before logging out
        await signOut(auth);
    } catch (error) {
        console.error("Logout Error:", error);
        showScreen('app'); // Fallback if error
    }
});

// Google Sign-In / Sign-Up
const googleAuthBtn = document.getElementById('google-auth-btn');
const googleBtnText = document.getElementById('google-btn-text');

if (googleAuthBtn && googleBtnText) {
    googleAuthBtn.addEventListener('click', async () => {
        authError.classList.add('hidden');
        
        // UI Loading state
        const originalText = googleBtnText.textContent;
        googleBtnText.textContent = 'กำลังเชื่อมต่อ...';
        googleAuthBtn.disabled = true;

        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Google Auth Error:", error);
            let msg = "ไม่สามารถเข้าสู่ระบบด้วย Google ได้";
            if (error.code === 'auth/popup-closed-by-user') msg = "การลงชื่อเข้าใช้ถูกยกเลิก";
            authError.textContent = msg;
            authError.classList.remove('hidden');
        } finally {
            googleBtnText.textContent = originalText;
            googleAuthBtn.disabled = false;
        }
    });
}

// Toggle Password Visibility
const togglePasswordVisibilityBtn = document.getElementById('toggle-password-visibility');
const passwordEyeIcon = document.getElementById('password-eye-icon');

if (togglePasswordVisibilityBtn && passwordEyeIcon && authPassword) {
    togglePasswordVisibilityBtn.addEventListener('click', () => {
        if (authPassword.type === 'password') {
            authPassword.type = 'text';
            passwordEyeIcon.className = "fa-regular fa-eye-slash";
        } else {
            authPassword.type = 'password';
            passwordEyeIcon.className = "fa-regular fa-eye";
        }
    });
}

// ==========================================
// 3.5 User Profile Management
// ==========================================

function updateHeaderProfile(user) {
    if (!user) return;
    
    // Display Name
    const displayName = user.displayName || user.email.split('@')[0];
    headerDisplayName.textContent = displayName;
    
    // Initial vs Photo URL
    if (user.photoURL) {
        headerAvatarImg.src = user.photoURL;
        headerAvatarImg.classList.remove('hidden');
        headerAvatarInitial.classList.add('hidden');
    } else {
        headerAvatarInitial.textContent = displayName.charAt(0).toUpperCase();
        headerAvatarInitial.classList.remove('hidden');
        headerAvatarImg.classList.add('hidden');
    }
}

function updateModalProfilePreview(name, photoUrl) {
    if (photoUrl) {
        profileModalImg.src = photoUrl;
        profileModalImg.classList.remove('hidden');
        profileModalInitial.classList.add('hidden');
    } else {
        profileModalInitial.textContent = (name || "U").charAt(0).toUpperCase();
        profileModalInitial.classList.remove('hidden');
        profileModalImg.classList.add('hidden');
    }
}

// Open Profile Modal
profileBtn.addEventListener('click', () => {
    const user = auth.currentUser;
    if (!user) return;
    
    const displayName = user.displayName || user.email.split('@')[0];
    const photoUrl = user.photoURL || '';
    
    profileNameInput.value = user.displayName || '';
    profilePhotoUrlInput.value = photoUrl;
    updateModalProfilePreview(displayName, photoUrl);
    
    profileError.classList.add('hidden');
    profileSuccess.classList.add('hidden');
    
    profileModal.classList.remove('hidden');
    profileModal.classList.add('flex');
    setTimeout(() => {
        profileModal.classList.remove('opacity-0');
        profileModalContent.classList.remove('scale-95');
        profileModalContent.classList.add('scale-100');
    }, 10);
});

// Close Profile Modal
closeProfileBtn.addEventListener('click', closeProfileModal);

function closeProfileModal() {
    profileModal.classList.add('opacity-0');
    profileModalContent.classList.remove('scale-100');
    profileModalContent.classList.add('scale-95');

    setTimeout(() => {
        profileModal.classList.add('hidden');
        profileModal.classList.remove('flex');
    }, 300);
}

// Live preview photoURL change
profilePhotoUrlInput.addEventListener('input', (e) => {
    updateModalProfilePreview(profileNameInput.value || auth.currentUser?.email, e.target.value);
});
profileNameInput.addEventListener('input', (e) => {
    if (!profilePhotoUrlInput.value) {
        updateModalProfilePreview(e.target.value || auth.currentUser?.email, null);
    }
});

profileModalImg.addEventListener('error', function() {
    this.classList.add('hidden');
    profileModalInitial.classList.remove('hidden');
});

// Submit Profile Changes
profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    profileError.classList.add('hidden');
    profileSuccess.classList.add('hidden');
    
    const newName = profileNameInput.value.trim();
    const newPhotoUrl = profilePhotoUrlInput.value.trim();
    
    const user = auth.currentUser;
    if (!user) return;
    
    const originalBtnContent = saveProfileBtn.innerHTML;
    saveProfileBtn.innerHTML = '<div class="animate-spin h-5 w-5 border-2 border-white border-r-transparent rounded-full"></div>';
    saveProfileBtn.disabled = true;
    
    try {
        await updateProfile(user, {
            displayName: newName || null,
            photoURL: newPhotoUrl || null
        });
        
        updateHeaderProfile(user);
        profileSuccess.classList.remove('hidden');
        setTimeout(() => closeProfileModal(), 1500);
    } catch (error) {
        console.error("Error updating profile:", error);
        profileError.textContent = "เกิดข้อผิดพลาดในการอัปเดตโปรไฟล์";
        profileError.classList.remove('hidden');
    } finally {
        saveProfileBtn.innerHTML = originalBtnContent;
        saveProfileBtn.disabled = false;
    }
});


// ==========================================
// 4. Firestore Data Handlers
// ==========================================

async function fetchSubs() {
    if (!currentUserId) return;
    try {
        const subsRef = collection(db, "subscriptions");
        const q = query(subsRef, where("userId", "==", currentUserId));
        const querySnapshot = await getDocs(q);

        subscriptions = [];
        querySnapshot.forEach((doc) => {
            subscriptions.push({ id: doc.id, ...doc.data() });
        });

        // Default sort: newest first (since we don't have createdAt, we keep order of fetch, or sort by date)
        updateDOM();
    } catch (error) {
        console.error("Error fetching subscriptions:", error);
    }
}

subForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.classList.add('hidden');

    if (!currentUserId) return;

    const presetRadio = document.querySelector('input[name="sub-preset"]:checked');
    if (!presetRadio) return;

    const finalName = presetRadio.value === 'other' ? subName.value.trim() : presetRadio.value;
    if (presetRadio.value === 'other' && !finalName) {
        showFormError('กรุณากรอกชื่อบริการ');
        return;
    }

    const price = parseFloat(subPrice.value);
    const extraPrice = parseFloat(subExtraPrice.value) || 0;
    if (isNaN(price) || price <= 0) {
        showFormError('ราคาต้องมากกว่า 0 บาท');
        return;
    }

    const cycle = document.querySelector('input[name="sub-cycle"]:checked').value;
    const date = subDate.value;
    const category = subCategory.value;
    const isVariable = (category === 'utilities');

    if (!date) {
        showFormError('กรุณาเลือกวันตัดรอบบิล');
        return;
    }

    const newSubData = {
        userId: currentUserId,
        name: finalName,
        price: price,
        currency: subCurrency.value || 'THB',
        extraPrice: extraPrice,
        cycle: cycle,
        date: date,
        isVariable: isVariable,
        isActive: subIsActive.checked,
        category: category,
        updatedAt: new Date().toISOString()
    };

    // UI Loading state
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<div class="animate-spin h-5 w-5 border-2 border-white border-r-transparent rounded-full"></div>';
    submitBtn.disabled = true;

    try {
        if (editTargetId) {
            // Update
            const docRef = doc(db, "subscriptions", editTargetId);
            await updateDoc(docRef, newSubData);

            // Update local state
            const index = subscriptions.findIndex(s => s.id === editTargetId);
            if (index !== -1) subscriptions[index] = { id: editTargetId, ...newSubData };

            resetFormState();
        } else {
            // Create
            newSubData.createdAt = new Date().toISOString();
            const docRef = await addDoc(collection(db, "subscriptions"), newSubData);

            // Add to local state
            subscriptions.push({ id: docRef.id, ...newSubData });
        }

        updateDOM();
        subForm.reset();
        document.querySelector('input[name="sub-preset"][value="Netflix"]').checked = true;
        toggleCustomInput();
        window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (error) {
        console.error("Error saving doc:", error);
        showFormError("ไม่สามารถบันทึกข้อมูลได้");
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
});

function showFormError(msg) {
    formError.textContent = msg;
    formError.classList.remove('hidden');
}


// ==========================================
// 5. Delete Handling with Modal
// ==========================================

window.deleteSub = function (id) {
    deleteTargetId = id;
    deleteModal.classList.remove('hidden');
    deleteModal.classList.add('flex');

    // Small delay to allow display:flex to apply before animating opacity
    setTimeout(() => {
        deleteModal.classList.remove('opacity-0');
        deleteModalContent.classList.remove('scale-95');
        deleteModalContent.classList.add('scale-100');
    }, 10);
}

cancelDeleteBtn.addEventListener('click', closeDeleteModal);

function closeDeleteModal() {
    deleteModal.classList.add('opacity-0');
    deleteModalContent.classList.remove('scale-100');
    deleteModalContent.classList.add('scale-95');

    setTimeout(() => {
        deleteModal.classList.add('hidden');
        deleteModal.classList.remove('flex');
        deleteTargetId = null;
    }, 300); // Matches Tailwind duration-300
}

confirmDeleteBtn.addEventListener('click', async () => {
    if (!deleteTargetId) return;

    // Loading state for button
    const originalText = confirmDeleteBtn.innerHTML;
    confirmDeleteBtn.innerHTML = '<div class="animate-spin h-5 w-5 border-2 border-white border-r-transparent rounded-full"></div>';
    confirmDeleteBtn.disabled = true;

    try {
        await deleteDoc(doc(db, "subscriptions", deleteTargetId));

        // Find DOM element to animate out
        const itemToAnimate = document.getElementById(`sub-item-${deleteTargetId}`);
        closeDeleteModal();

        if (itemToAnimate) {
            itemToAnimate.classList.add('opacity-0', 'scale-90', '-translate-x-4');
            setTimeout(() => {
                subscriptions = subscriptions.filter(s => s.id !== deleteTargetId);
                updateDOM();
            }, 300);
        } else {
            subscriptions = subscriptions.filter(s => s.id !== deleteTargetId);
            updateDOM();
        }

    } catch (error) {
        console.error("Error deleting doc:", error);
        alert("ไม่สามารถลบข้อมูลได้");
        closeDeleteModal();
    } finally {
        confirmDeleteBtn.innerHTML = originalText;
        confirmDeleteBtn.disabled = false;
    }
});

// ==========================================
// Phase 3: Mark as Paid & History
// ==========================================

window.markAsPaid = function(id) {
    subIdToMarkPaid = id;
    paidModal.classList.remove('hidden');
    paidModal.classList.add('flex');
    setTimeout(() => {
        paidModal.classList.remove('opacity-0');
        paidModalContent.classList.remove('scale-95');
        paidModalContent.classList.add('scale-100');
    }, 10);
};

cancelPaidBtn.addEventListener('click', () => {
    subIdToMarkPaid = null;
    paidModal.classList.add('opacity-0');
    paidModalContent.classList.remove('scale-100');
    paidModalContent.classList.add('scale-95');
    setTimeout(() => {
        paidModal.classList.add('hidden');
        paidModal.classList.remove('flex');
    }, 300);
});

confirmPaidBtn.addEventListener('click', async () => {
    if (!subIdToMarkPaid) return;
    const sub = subscriptions.find(s => s.id === subIdToMarkPaid);
    if (!sub) return;

    // Update history
    const history = sub.history || [];
    history.unshift({
        paidAt: new Date().toISOString(),
        amount: sub.price
    });

    // Roll date
    const d = new Date(sub.date);
    if (sub.cycle === 'yearly') {
        d.setFullYear(d.getFullYear() + 1);
    } else {
        d.setMonth(d.getMonth() + 1);
    }
    const newDateStr = d.toISOString().split('T')[0];

    try {
        const confirmBtn = confirmPaidBtn;
        const originalText = confirmBtn.innerHTML;
        confirmBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span> กำลังบันทึก...</span>`;
        confirmBtn.disabled = true;

        await updateDoc(doc(db, 'subscriptions', subIdToMarkPaid), {
            history: history,
            date: newDateStr,
            updatedAt: new Date().toISOString()
        });
        
        confirmBtn.innerHTML = originalText;
        confirmBtn.disabled = false;
        cancelPaidBtn.click();
    } catch (err) {
        console.error("Error marking paid: ", err);
        alert("เกิดข้อผิดพลาดในการบันทึก");
    }
});

window.viewHistory = function(id) {
    const sub = subscriptions.find(s => s.id === id);
    if (!sub) return;
    
    historyList.innerHTML = '';
    const history = sub.history || [];
    
    if (history.length === 0) {
        historyList.innerHTML = '<div class="text-center py-4 text-slate-500 text-sm">ยังไม่มีประวัติการชำระเงิน</div>';
    } else {
        history.forEach(item => {
            const dateStr = new Date(item.paidAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            historyList.innerHTML += `
                <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl text-sm border border-slate-100 dark:border-slate-700/50">
                    <span class="text-slate-600 dark:text-slate-300"><i class="fa-solid fa-check-circle text-emerald-500 mr-2"></i>${dateStr}</span>
                    <span class="font-bold text-slate-800 dark:text-slate-100">${Number(item.amount).toLocaleString()} บ.</span>
                </div>
            `;
        });
    }

    historyModal.classList.remove('hidden');
    historyModal.classList.add('flex');
    setTimeout(() => {
        historyModal.classList.remove('opacity-0');
        historyModalContent.classList.remove('scale-95');
        historyModalContent.classList.add('scale-100');
    }, 10);
};

closeHistoryBtn.addEventListener('click', () => {
    historyModal.classList.add('opacity-0');
    historyModalContent.classList.remove('scale-100');
    historyModalContent.classList.add('scale-95');
    setTimeout(() => {
        historyModal.classList.add('hidden');
        historyModal.classList.remove('flex');
    }, 300);
});

// ==========================================
// 6. UI Update & Calculations
// ==========================================

function updateDOM() {
    subList.innerHTML = '';
    let totalMonthly = 0;

    // Filter & Sort
    // Sort
    let filteredSubs = [...subscriptions];
    const sortBy = sortSub.value;

    if (sortBy === 'upcoming') {
        filteredSubs.sort((a, b) => {
            const getDays = (dateStr) => {
                if (!dateStr) return Infinity; // Missing dates go to bottom
                const targetDate = new Date(dateStr);
                targetDate.setHours(0, 0, 0, 0);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                // Return difference in days
                return Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
            };
            return getDays(a.date) - getDays(b.date);
        });
    } else if (sortBy === 'price-high') {
        filteredSubs.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'name') {
        filteredSubs.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    }

    subCountEl.innerText = `${filteredSubs.length} รายการ`;

    // Handle Empty State
    if (filteredSubs.length === 0) {
        emptyState.classList.remove('hidden');
        emptyState.classList.add('flex');
        chartSection.classList.add('hidden');
        totalCostEl.innerText = "0.00 บาท";
        return;
    } else {
        emptyState.classList.add('hidden');
        emptyState.classList.remove('flex');
        chartSection.classList.remove('hidden');
    }

    let chartGroups = {};
    let chartLabels = [];
    let chartData = [];

    // Insights variables
    let maxPrice = 0;
    let topSpenderName = '-';
    let savedMoney = 0;

    filteredSubs.forEach((sub) => {
        // Safe check
        if (!sub || !sub.price) return;

        const isYearly = sub.cycle === 'yearly';
        const isVariable = sub.isVariable || false;
        const isActive = sub.isActive !== false; // default true
        const isUSD = sub.currency === 'USD';
        const exchangeRate = 35;
        
        // Calculate THB equivalents
        const priceInThb = isUSD ? (sub.price * exchangeRate) : sub.price;
        const extraPriceInThb = isUSD ? (sub.extraPrice * exchangeRate) : (sub.extraPrice || 0);
        
        let monthlyBase = priceInThb;
        if (isYearly) monthlyBase = priceInThb / 12;

        let monthlyExtra = 0;
        if (sub.extraPrice > 0) {
            monthlyExtra = isYearly ? extraPriceInThb / 12 : extraPriceInThb;
        }

        const totalMonthlyForSub = monthlyBase + monthlyExtra;
        
        // Add to total only if active
        if (isActive) {
            if (!isYearlyView) {
                totalMonthly += totalMonthlyForSub;
            } else {
                if (!isVariable) totalMonthly += totalMonthlyForSub * 12;
            }
            
            // Insight: Top Spender (compare monthly price)
            if (totalMonthlyForSub > maxPrice) {
                maxPrice = totalMonthlyForSub;
                topSpenderName = sub.name;
            }
        } else {
            // Insight: Money Saved from Paused subscriptions (Monthly basis)
            savedMoney += totalMonthlyForSub;
        }

        // --- Prepare for Chart ---
        let priceForChart = 0;
        if (isActive) {
            if (!isYearlyView) {
                priceForChart = totalMonthlyForSub;
            } else {
                if (!isVariable) priceForChart = totalMonthlyForSub * 12;
            }
        }
        
        // Add to chart only if it has a value > 0 in this view
        if (priceForChart > 0) {
            if (chartViewMode === 'app') {
                chartLabels.push(sub.name);
                chartData.push(priceForChart);
            } else {
                const fullCatName = getCategoryName(sub.category);
                if (!chartGroups[fullCatName]) chartGroups[fullCatName] = 0;
                chartGroups[fullCatName] += priceForChart;
            }
        }

        const logoUrl = getServiceLogo(sub.name);

        // Subtext for list item
        let displayBadges = '';
        if (isActive === false) {
            displayBadges += `<span class="bg-slate-100 text-slate-500 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400 px-2 py-0.5 rounded-lg text-[10px] font-bold">หยุดพัก</span>`;
        }
        if (isVariable) {
            displayBadges += `<span class="bg-rose-50 text-rose-600 border border-rose-100 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-400 px-2 py-0.5 rounded-lg text-[10px] font-bold">ไม่รวมรายปี</span>`;
        }
        
        let originalPriceText = Number(sub.price).toLocaleString();
        if (isUSD) originalPriceText = '$' + Number(sub.price).toLocaleString('en-US', {minimumFractionDigits: 2});
        
        let priceHtml = `${originalPriceText} ${isUSD ? 'USD' : 'บาท'} <span class="mx-1 text-slate-300 dark:text-slate-600">/</span> ${isYearly ? 'ปี' : 'เดือน'}`;
        if ((sub.extraPrice || 0) > 0) {
            let originalExtraText = Number(sub.extraPrice).toLocaleString();
            if (isUSD) originalExtraText = '$' + Number(sub.extraPrice).toLocaleString('en-US', {minimumFractionDigits: 2});
            priceHtml += ` <span class="text-rose-400 dark:text-rose-400 font-medium ml-1">+ส่วนเกิน ${originalExtraText}</span>`;
        }

        // Price on the right
        let displayPriceText = '';
        if (!isYearlyView) {
            displayPriceText = `<span class="font-bold text-slate-800 dark:text-slate-100">${totalMonthlyForSub.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.</span>`;
        } else {
            let yrPrice = totalMonthlyForSub * 12;
            if (isVariable) {
                displayPriceText = `<span class="font-bold text-slate-400 dark:text-slate-500 line-through decoration-rose-500/50" title="ไม่นำมารวมในยอดรายปี">${yrPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.</span>`;
            } else {
                displayPriceText = `<span class="font-bold text-slate-800 dark:text-slate-100">${yrPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.</span>`;
            }
        }

        // Due Date Logic
        const dueDateInfo = calculateDueDate(sub.date);
        
        // Custom styling for upcoming bills
        let borderColor = 'border-l-indigo-500';
        let bgStyle = 'bg-slate-50 dark:bg-slate-900/50';
        
        if (isActive && dueDateInfo.diffDays !== undefined) {
            if (dueDateInfo.diffDays <= 3) {
                borderColor = 'border-l-rose-500';
                bgStyle = 'bg-rose-50/60 dark:bg-rose-900/20 shadow-rose-100 dark:shadow-none shadow-sm';
            } else if (dueDateInfo.diffDays <= 7) {
                borderColor = 'border-l-amber-500';
                bgStyle = 'bg-amber-50/60 dark:bg-amber-900/20 shadow-amber-100 dark:shadow-none shadow-sm';
            }
        }

        // Build DOM Element
        const div = document.createElement('div');
        div.id = `sub-item-${sub.id}`;
        
        // Apply dimming if paused
        let containerClass = `${bgStyle} border border-slate-100 dark:border-slate-700/30 p-4 rounded-2xl flex justify-between items-center border-l-4 ${borderColor} transition-all duration-300`;
        if (!isActive) {
            containerClass += ' opacity-50 grayscale hover:grayscale-0 hover:opacity-100';
        }
        div.className = containerClass;

        div.innerHTML = `
            <div class="flex items-center space-x-3 sm:space-x-4 overflow-hidden w-full sm:w-auto mb-3 sm:mb-0">
                <div class="w-12 h-12 shrink-0 rounded-full overflow-hidden border border-slate-100 dark:border-slate-700 shadow-sm bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center relative">
                    ${logoUrl
                ? `<img src="${logoUrl}" class="w-full h-full object-cover bg-white" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                           <div class="hidden absolute inset-0 text-indigo-600 dark:text-indigo-300 font-bold text-lg uppercase flex items-center justify-center">${getFallbackIcon(sub.name)}</div>`
                : `<div class="w-full h-full flex items-center justify-center text-indigo-600 dark:text-indigo-300 font-bold text-lg uppercase">${getFallbackIcon(sub.name)}</div>`
            }
                </div>
                <div class="min-w-0 flex-1 py-1">
                    <h3 class="font-bold text-slate-800 dark:text-slate-100 truncate text-base">${sub.name}</h3>
                    <div class="flex flex-col gap-1.5 mt-1.5">
                        <div class="flex items-center flex-wrap gap-1.5 text-xs">
                            <span class="bg-indigo-50 text-indigo-600 border border-indigo-100 dark:border-slate-700 dark:bg-slate-700/50 dark:text-indigo-300 px-2 py-0.5 rounded-lg text-[10px] font-bold shadow-sm">${getCategoryName(sub.category)}</span>
                            ${displayBadges}
                            <span class="${dueDateInfo.colorClass} font-medium flex items-center whitespace-nowrap bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-600 text-[10px] shadow-sm">
                                <i class="fa-regular fa-calendar mr-1.5"></i>${dueDateInfo.text}
                            </span>
                        </div>
                        <div class="text-slate-500 dark:text-slate-400 text-xs font-medium">
                            ${priceHtml}
                        </div>
                    </div>
                </div>
            </div>
            <div class="flex flex-col sm:flex-row items-end sm:items-center gap-2 sm:space-x-1 shrink-0 ml-4">
                <div class="mb-1 sm:mb-0 sm:mr-3">${displayPriceText}</div>
                <div class="flex items-center space-x-1">
                    <button onclick="markAsPaid('${sub.id}')" title="ชำระเงินแล้ว" class="text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 p-2 rounded-xl transition-colors"><i class="fa-solid fa-check"></i></button>
                    <button onclick="viewHistory('${sub.id}')" title="ประวัติการชำระเงิน" class="text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-2 rounded-xl transition-colors"><i class="fa-solid fa-clock-rotate-left"></i></button>
                    <button onclick="editSub('${sub.id}')" class="text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 p-2 rounded-xl transition-colors"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteSub('${sub.id}')" class="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 p-2 rounded-xl transition-colors"><i class="fa-regular fa-trash-can"></i></button>
                </div>
            </div>
        `;
        subList.appendChild(div);
    });

    // Update Insights UI
    const topSpenderEl = document.getElementById('insight-top-spender');
    const topSpenderPriceEl = document.getElementById('insight-top-spender-price');
    const savedMoneyEl = document.getElementById('insight-saved-money');

    if (topSpenderEl) topSpenderEl.innerText = topSpenderName;
    if (topSpenderPriceEl) topSpenderPriceEl.innerText = maxPrice > 0 ? `${maxPrice.toLocaleString('en-US', {minimumFractionDigits: 2})} บ./เดือน` : '-';
    if (savedMoneyEl) savedMoneyEl.innerText = `${savedMoney.toLocaleString('en-US', {minimumFractionDigits: 2})} บ.`;

    if (chartViewMode === 'category') {
        for (const [cat, val] of Object.entries(chartGroups)) {
            chartLabels.push(cat);
            chartData.push(val);
        }
        const combined = chartLabels.map((label, i) => ({ label, data: chartData[i] }));
        combined.sort((a, b) => b.data - a.data);
        chartLabels = combined.map(item => item.label);
        chartData = combined.map(item => item.data);
    }

    chartData = chartData.map(val => Number(val).toFixed(2));
    totalCostEl.innerText = `${totalMonthly.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท`;
    drawChart(chartLabels, chartData);
}

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}


function calculateDueDate(dateString) {
    if (!dateString) return { text: "ไม่ระบุ", colorClass: "text-slate-400" };

    const targetDate = new Date(dateString);
    targetDate.setHours(0, 0, 0, 0); 
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = targetDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return { text: `เลยกำหนด ${Math.abs(diffDays)} วัน!`, colorClass: "text-rose-500", diffDays }; 
    } else if (diffDays === 0) {
        return { text: "ครบกำหนดวันนี้!", colorClass: "text-amber-500", diffDays }; 
    } else if (diffDays <= 3) {
        return { text: `อีก ${diffDays} วัน`, colorClass: "text-amber-500", diffDays }; 
    } else {
        return { text: `อีก ${diffDays} วัน`, colorClass: "text-emerald-500", diffDays }; 
    }
}


function getServiceLogo(name) {
    if (!name) return null;
    const n = name.toLowerCase().trim();
    
    // Global Brands
    if (n.includes('netflix')) return 'https://icon.horse/icon/netflix.com';
    if (n.includes('spotify')) return 'https://icon.horse/icon/spotify.com';
    if (n.includes('youtube') || n.includes('ยูทูป')) return 'https://icon.horse/icon/youtube.com';
    if (n.includes('disney') || n.includes('ดิสนีย์')) return 'https://icon.horse/icon/disneyplus.com';
    if (n.includes('apple') || n.includes('แอปเปิล')) return 'https://icon.horse/icon/apple.com';
    if (n.includes('google') || n.includes('กูเกิล')) return 'https://icon.horse/icon/google.com';
    if (n.includes('amazon') || n.includes('prime')) return 'https://icon.horse/icon/amazon.com';
    if (n.includes('hbo')) return 'https://icon.horse/icon/hbo.com';
    if (n.includes('canva')) return 'https://icon.horse/icon/canva.com';
    if (n.includes('adobe')) return 'https://icon.horse/icon/adobe.com';
    if (n.includes('microsoft')) return 'https://icon.horse/icon/microsoft.com';
    if (n.includes('chatgpt') || n.includes('openai')) return 'https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg';

    // Thai & Regional Brands
    if (n.includes('ais') || n.includes('เอไอเอส')) return 'https://icon.horse/icon/ais.th';
    if (n.includes('true') || n.includes('ทรู')) return 'https://icon.horse/icon/true.th';
    if (n.includes('3bb')) return 'https://icon.horse/icon/3bb.co.th';
    if (n.includes('dtac') || n.includes('ดีแทค')) return 'https://icon.horse/icon/dtac.co.th';
    if (n.includes('shopee') || n.includes('ช้อปปี้')) return 'https://icon.horse/icon/shopee.co.th';
    if (n.includes('lazada') || n.includes('ลาซาด้า')) return 'https://icon.horse/icon/lazada.co.th';
    if (n.includes('grab') || n.includes('แกร็บ')) return 'https://icon.horse/icon/grab.com';
    if (n.includes('lineman') || n.includes('ไลน์แมน')) return 'https://icon.horse/icon/lineman.line.me';
    if (n.includes('foodpanda')) return 'https://icon.horse/icon/foodpanda.co.th';
    if (n.includes('iqiyi')) return 'https://icon.horse/icon/iq.com';
    if (n.includes('viu')) return 'https://icon.horse/icon/viu.com';
    if (n.includes('wetv')) return 'https://icon.horse/icon/wetv.vip';
    if (n.includes('bilibili')) return 'https://icon.horse/icon/bilibili.tv';
    
    // Auto-guess for unknown services (extract english characters and assume .com)
    const guessedDomain = n.replace(/[^a-z0-9]/g, '');
    if (guessedDomain.length >= 3) {
        return `https://icon.horse/icon/${guessedDomain}.com`;
    }

    return null;
}

function getFallbackIcon(name) {
    if (!name) return '';
    const n = name.toLowerCase().trim();
    if (n.includes('มือถือ') || n.includes('โทรศัพท์') || n.includes('mobile') || n.includes('ais') || n.includes('true') || n.includes('dtac')) return '<i class="fa-solid fa-mobile-screen"></i>';
    if (n.includes('เน็ต') || n.includes('wifi') || n.includes('internet') || n.includes('3bb')) return '<i class="fa-solid fa-wifi"></i>';
    if (n.includes('น้ำ') || n.includes('water')) return '<i class="fa-solid fa-droplet text-blue-500"></i>';
    if (n.includes('ไฟ') || n.includes('electric')) return '<i class="fa-solid fa-bolt text-amber-500"></i>';
    if (n.includes('บัตร') || n.includes('card') || n.includes('credit')) return '<i class="fa-regular fa-credit-card"></i>';
    return name.charAt(0);
}

// ==========================================
// 7. Chart Logic
// ==========================================

function drawChart(labels, data) {
    const ctx = document.getElementById('subChart').getContext('2d');
    const legendContainer = document.getElementById('chart-legend');
    const colors = generateRandomColors(data.length);

    if (myChart instanceof Chart) {
        myChart.destroy();
    }

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#f1f5f9' : '#1e293b';

    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: isDark ? 2 : 0,
                borderColor: isDark ? '#1e293b' : '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(context.parsed);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });

    legendContainer.innerHTML = '';
    labels.forEach((label, index) => {
        const item = document.createElement('div');
        item.className = "flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg transition-colors duration-300";
        item.innerHTML = `
            <div class="flex items-center gap-3 truncate">
                <div class="w-3 h-3 rounded-full shrink-0" style="background-color: ${colors[index % colors.length]}"></div>
                <span class="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">${label}</span>
            </div>
            <span class="text-sm font-bold text-slate-900 dark:text-slate-100 ml-2 shrink-0">${parseFloat(data[index]).toLocaleString(undefined, { minimumFractionDigits: 2 })} บ.</span>
        `;
        legendContainer.appendChild(item);
    });
}

function generateRandomColors(count) {
    let colors = [];
    const hueStep = 360 / count;
    for (let i = 0; i < count; i++) {
        const hue = Math.floor(i * hueStep + (Math.random() * 20));
        colors.push(`hsl(${hue}, 70%, 60%)`);
    }
    return colors;
}

// ==========================================
// 8. Edit / View / Form Controls
// ==========================================

window.exportToCSV = function() {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Name,Price,Currency,Cycle,Category,ExtraPrice,IsVariable,IsActive,Date\r\n";
    subscriptions.forEach(s => {
        csvContent += `${s.name},${s.price},${s.currency},${s.cycle},${s.category},${s.extraPrice || 0},${s.isVariable},${s.isActive},${s.date}\r\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "my_subscriptions.csv");
    document.body.appendChild(link);
    link.click();
};

window.editSub = function (id) {
    const sub = subscriptions.find(s => s.id === id);
    if (!sub) return;

    editTargetId = id;

    const presets = ['Netflix', 'Spotify', 'YouTube Premium', 'Disney+', 'มือถือ', 'เน็ตบ้าน', 'ค่าน้ำ', 'ค่าไฟ', 'Google Workspace', 'Microsoft 365', 'Canva', 'ChatGPT'];
    if (presets.includes(sub.name)) {
        const radio = document.querySelector(`input[name="sub-preset"][value="${sub.name}"]`);
        if (radio) radio.checked = true;
    } else {
        const radioOther = document.querySelector('input[name="sub-preset"][value="other"]');
        if (radioOther) radioOther.checked = true;
        subName.value = sub.name;
    }

    window.toggleCustomInput();

    subPrice.value = sub.price;
    subCurrency.value = sub.currency || 'THB';
    subExtraPrice.value = sub.extraPrice || '';
    subCategory.value = sub.category || 'others';
    subIsActive.checked = sub.isActive !== false;
    
    const cycleRadio = document.querySelector(`input[name="sub-cycle"][value="${sub.cycle}"]`);
    if (cycleRadio) cycleRadio.checked = true;

    if (sub.date) subDate.value = sub.date;
    subIsActive.checked = sub.isActive !== false; // default true
    toggleExtraPrice();

    // Change Button State
    submitBtnText.innerText = 'อัปเดตบริการ';
    submitBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
    submitBtn.classList.add('bg-amber-500', 'hover:bg-amber-600');
    submitBtn.querySelector('i').className = "fa-solid fa-pen";

    // Scroll to form smoothly
    document.getElementById('sub-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetFormState() {
    editTargetId = null;
    submitBtnText.innerText = 'บันทึกบริการ';
    submitBtn.classList.remove('bg-amber-500', 'hover:bg-amber-600');
    submitBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
    submitBtn.querySelector('i').className = "fa-solid fa-plus";
    subExtraPrice.value = '';
    toggleExtraPrice();
}

window.toggleCustomInput = function () {
    const presetRadio = document.querySelector('input[name="sub-preset"]:checked');
    if (!presetRadio) return;

    const val = presetRadio.value;
    
    if (val === 'other') {
        customNameContainer.classList.remove('hidden');
        subName.required = true;
    } else {
        customNameContainer.classList.add('hidden');
        subName.required = false;
        subName.value = '';
    }
    
    if (val === 'Netflix' || val === 'Spotify' || val === 'YouTube' || val === 'Disney+') {
        subCategory.value = 'entertainment';
    } else if (val === 'มือถือ' || val === 'เน็ตบ้าน' || val === 'ค่าน้ำ' || val === 'ค่าไฟ') {
        subCategory.value = 'utilities';
    } else if (val === 'Google Workspace' || val === 'Microsoft 365' || val === 'Canva' || val === 'ChatGPT') {
        subCategory.value = 'work';
    }
    toggleExtraPrice();
}

function toggleExtraPrice() {
    if (subCategory.value === 'utilities') {
        extraPriceContainer.classList.remove('hidden');
    } else {
        extraPriceContainer.classList.add('hidden');
        subExtraPrice.value = '';
    }
}
subCategory.addEventListener('change', toggleExtraPrice);

// Preset changes
document.querySelectorAll('input[name="sub-preset"]').forEach(radio => {
    radio.addEventListener('change', window.toggleCustomInput);
});

// View Toggle (Monthly/Yearly)
toggleViewBtn.addEventListener('click', () => {
    isYearlyView = !isYearlyView;

    if (isYearlyView) {
        toggleKnob.classList.remove('translate-x-1');
        toggleKnob.classList.add('translate-x-7');
        toggleViewBtn.classList.remove('bg-indigo-950/60', 'dark:bg-slate-900', 'border-white/10');
        toggleViewBtn.classList.add('bg-indigo-500', 'border-indigo-400');
        totalLabelEl.innerText = "ยอดรวมต่อปี";
    } else {
        toggleKnob.classList.remove('translate-x-7');
        toggleKnob.classList.add('translate-x-1');
        toggleViewBtn.classList.add('bg-indigo-950/60', 'dark:bg-slate-900', 'border-white/10');
        toggleViewBtn.classList.remove('bg-indigo-500', 'border-indigo-400');
        totalLabelEl.innerText = "ยอดรวมต่อเดือน";
    }

    updateDOM();
});

// Search & Sort Listeners
sortSub.addEventListener('change', updateDOM);

// Chart View Toggles
const activeBtnClass = "px-3 py-1 text-xs font-medium rounded-lg bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-indigo-300 transition-all";
const inactiveBtnClass = "px-3 py-1 text-xs font-medium rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all";

function updateChartButtons() {
    if (chartViewMode === 'app') {
        chartViewAppBtn.className = activeBtnClass;
        chartViewCategoryBtn.className = inactiveBtnClass;
    } else {
        chartViewCategoryBtn.className = activeBtnClass;
        chartViewAppBtn.className = inactiveBtnClass;
    }
}

// Initialize on startup
updateChartButtons();

chartViewAppBtn.addEventListener('click', () => {
    chartViewMode = 'app';
    localStorage.setItem('chartViewMode', 'app');
    updateChartButtons();
    updateDOM();
});

chartViewCategoryBtn.addEventListener('click', () => {
    chartViewMode = 'category';
    localStorage.setItem('chartViewMode', 'category');
    updateChartButtons();
    updateDOM();
});


// ==========================================
// 10. Calendar View Logic
// ==========================================

const viewListBtn = document.getElementById('view-list-btn');
const viewCalendarBtn = document.getElementById('view-calendar-btn');
const viewListBtnMobile = document.getElementById('view-list-btn-mobile');
const viewCalendarBtnMobile = document.getElementById('view-calendar-btn-mobile');
const calMonthYear = document.getElementById('cal-month-year');
const calGrid = document.getElementById('cal-grid');
const calMonthList = document.getElementById('cal-month-list');
const calPrev = document.getElementById('cal-prev');
const calNext = document.getElementById('cal-next');

const activeViewBtnClass = "px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-indigo-300 transition-all";
const inactiveViewBtnClass = "px-3 py-1.5 text-xs font-medium rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all";
const activeViewBtnMobileClass = "w-1/2 px-3 py-2 text-xs font-medium rounded-lg bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-indigo-300 transition-all";
const inactiveViewBtnMobileClass = "w-1/2 px-3 py-2 text-xs font-medium rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all";

function updateViewButtons() {
    if (viewMode === 'list') {
        if(viewListBtn) viewListBtn.className = activeViewBtnClass;
        if(viewCalendarBtn) viewCalendarBtn.className = inactiveViewBtnClass;
        if(viewListBtnMobile) viewListBtnMobile.className = activeViewBtnMobileClass;
        if(viewCalendarBtnMobile) viewCalendarBtnMobile.className = inactiveViewBtnMobileClass;
        
        subList.classList.remove('hidden');
        if(listControlsContainer) listControlsContainer.classList.remove('hidden');
        subCalendar.classList.add('hidden');
    } else {
        if(viewListBtn) viewListBtn.className = inactiveViewBtnClass;
        if(viewCalendarBtn) viewCalendarBtn.className = activeViewBtnClass;
        if(viewListBtnMobile) viewListBtnMobile.className = inactiveViewBtnMobileClass;
        if(viewCalendarBtnMobile) viewCalendarBtnMobile.className = activeViewBtnMobileClass;
        
        subList.classList.add('hidden');
        if(listControlsContainer) listControlsContainer.classList.add('hidden');
        subCalendar.classList.remove('hidden');
        renderCalendar();
    }
}

function renderCalendar() {
    calGrid.innerHTML = '';
    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();
    
    const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    calMonthYear.innerText = `${monthNames[month]} ${year + 543}`;
    
    const firstDay = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const today = new Date();
    today.setHours(0,0,0,0);

    // Padding empty days before the 1st
    for (let i = 0; i < firstDay; i++) {
        const div = document.createElement('div');
        calGrid.appendChild(div);
    }
    
    // Find subscriptions for this month
    // A subscription is due this month if its calculated nextDate falls in this month/year
    let subsThisMonth = {}; // key: day, value: array of subs
    
    subscriptions.forEach(sub => {
        if (sub.isActive === false) return; // skip paused
        if (!sub.date) return;
        
        let subDate = new Date(sub.date);
        subDate.setHours(0, 0, 0, 0);
        
        // Advance the subDate to the current calendar month/year
        // For monthly cycle, we check if it can land in this month
        let loopCount = 0;
        let testDate = new Date(subDate);
        while (testDate.getFullYear() < year || (testDate.getFullYear() === year && testDate.getMonth() < month)) {
            if (sub.cycle === 'yearly') {
                testDate.setFullYear(testDate.getFullYear() + 1);
            } else {
                testDate.setMonth(testDate.getMonth() + 1);
            }
            loopCount++;
            if(loopCount > 1000) break; // safeguard
        }
        
        if (testDate.getFullYear() === year && testDate.getMonth() === month) {
            const day = testDate.getDate();
            if (!subsThisMonth[day]) subsThisMonth[day] = [];
            subsThisMonth[day].push(sub);
        }
    });

    for (let i = 1; i <= daysInMonth; i++) {
        const div = document.createElement('div');
        const isToday = (year === today.getFullYear() && month === today.getMonth() && i === today.getDate());
        
        div.className = `min-h-[50px] sm:min-h-[60px] p-1 border rounded-lg sm:rounded-xl relative flex flex-col transition-all cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 ${isToday ? 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-900/10 shadow-sm' : 'border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-800'}`;
        
        // Date Number
        let dateTextHtml = `<span class="text-xs sm:text-sm font-bold ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300'} mb-1">${i}</span>`;
        
        // Subscription Dots
        let dotsHtml = '';
        const daySubs = subsThisMonth[i];
        if (daySubs && daySubs.length > 0) {
            dotsHtml += `<div class="flex flex-wrap justify-center gap-1 mt-auto pb-1">`;
            // Maximum 3 dots to prevent overflow, then a +X
            const maxDots = 3;
            for (let j = 0; j < Math.min(daySubs.length, maxDots); j++) {
                const sub = daySubs[j];
                // Determine urgency
                const subDateForThisMonth = new Date(year, month, i);
                const diffTime = subDateForThisMonth - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                let dotColor = 'bg-emerald-500'; // Default green
                if (diffDays < 0) dotColor = 'bg-slate-400'; // Past
                else if (diffDays <= 3) dotColor = 'bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,0.5)]'; // Urgent
                else if (diffDays <= 7) dotColor = 'bg-amber-500'; // Soon
                
                dotsHtml += `<div class="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${dotColor}" title="${sub.name}"></div>`;
            }
            if (daySubs.length > maxDots) {
                dotsHtml += `<div class="text-[8px] font-bold text-slate-500">+${daySubs.length - maxDots}</div>`;
            }
            dotsHtml += `</div>`;
        }
        
        div.innerHTML = dateTextHtml + dotsHtml;
        
        // Click to filter list by this date? 
        // For now, clicking simply highlights it or scrolls to it
        div.addEventListener('click', () => {
            if (daySubs && daySubs.length > 0) {
                viewMode = 'list';
                updateViewButtons();
                // Find first sub element and scroll to it smoothly
                setTimeout(() => {
                    const el = document.getElementById(`sub-item-${daySubs[0].id}`);
                    if(el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        });
        
        calGrid.appendChild(div);
    }
    
    // Render the list of subscriptions for this month
    if (calMonthList) {
        calMonthList.innerHTML = '';
        
        // Flatten the subsThisMonth object into a sorted array
        let allMonthSubs = [];
        for (let i = 1; i <= daysInMonth; i++) {
            if (subsThisMonth[i]) {
                subsThisMonth[i].forEach(sub => {
                    allMonthSubs.push({ day: i, sub: sub });
                });
            }
        }
        
        if (allMonthSubs.length === 0) {
            calMonthList.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400 text-center py-4">ไม่มีรายการบิลในเดือนนี้</p>`;
        } else {
            allMonthSubs.forEach(item => {
                const sub = item.sub;
                const isUSD = sub.currency === 'USD';
                let displayPrice = isUSD ? `$${sub.price}` : `${sub.price} บ.`;
                const logoUrl = getServiceLogo(sub.name);
                
                // Calculate urgency for the list item
                const subDateForThisMonth = new Date(year, month, item.day);
                const diffTime = subDateForThisMonth - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                let dotColor = 'bg-emerald-500'; // Default green
                let bgStyle = 'bg-white dark:bg-slate-800';
                let borderStyle = 'border-slate-100 dark:border-slate-700';

                if (diffDays < 0) {
                    dotColor = 'bg-slate-400';
                } else if (diffDays <= 3) {
                    dotColor = 'bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,0.5)]';
                    bgStyle = 'bg-rose-50/50 dark:bg-rose-900/10';
                    borderStyle = 'border-l-4 border-l-rose-500 border-t-rose-100 border-r-rose-100 border-b-rose-100 dark:border-t-rose-900/30 dark:border-r-rose-900/30 dark:border-b-rose-900/30';
                } else if (diffDays <= 7) {
                    dotColor = 'bg-amber-500';
                    bgStyle = 'bg-amber-50/50 dark:bg-amber-900/10';
                    borderStyle = 'border-l-4 border-l-amber-500 border-t-amber-100 border-r-amber-100 border-b-amber-100 dark:border-t-amber-900/30 dark:border-r-amber-900/30 dark:border-b-amber-900/30';
                }
                
                const div = document.createElement('div');
                div.className = `flex items-center justify-between p-3 rounded-xl hover:shadow-sm transition-all ${bgStyle} ${borderStyle} ${diffDays <= 7 ? 'border-y border-r' : 'border'}`;
                div.innerHTML = `
                    <div class="flex items-center space-x-3">
                        <div class="w-8 h-8 rounded-full overflow-hidden bg-indigo-50 flex items-center justify-center border border-slate-100 dark:border-slate-700">
                            ${logoUrl ? `<img src="${logoUrl}" class="w-full h-full object-cover">` : `<div class="font-bold text-indigo-500">${sub.name.charAt(0)}</div>`}
                        </div>
                        <div>
                            <p class="text-sm font-bold text-slate-800 dark:text-slate-100">${sub.name}</p>
                            <p class="text-[10px] text-slate-500 dark:text-slate-400 flex items-center">
                                วันที่ ${item.day} ${monthNames[month]}
                                <span class="w-1.5 h-1.5 rounded-full ${dotColor} ml-1.5 inline-block"></span>
                            </p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-sm font-bold text-slate-800 dark:text-slate-100">${displayPrice}</p>
                    </div>
                `;
                
                // Allow clicking to jump to the item in list mode
                div.classList.add('cursor-pointer');
                div.addEventListener('click', () => {
                    viewMode = 'list';
                    updateViewButtons();
                    setTimeout(() => {
                        const el = document.getElementById(`sub-item-${sub.id}`);
                        if(el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                });
                
                calMonthList.appendChild(div);
            });
        }
    }
}

// Event Listeners for toggle
if(viewListBtn) viewListBtn.addEventListener('click', () => { viewMode = 'list'; updateViewButtons(); });
if(viewCalendarBtn) viewCalendarBtn.addEventListener('click', () => { viewMode = 'calendar'; updateViewButtons(); });
if(viewListBtnMobile) viewListBtnMobile.addEventListener('click', () => { viewMode = 'list'; updateViewButtons(); });
if(viewCalendarBtnMobile) viewCalendarBtnMobile.addEventListener('click', () => { viewMode = 'calendar'; updateViewButtons(); });

if(calPrev) calPrev.addEventListener('click', () => {
    currentCalDate.setMonth(currentCalDate.getMonth() - 1);
    renderCalendar();
});
if(calNext) calNext.addEventListener('click', () => {
    currentCalDate.setMonth(currentCalDate.getMonth() + 1);
    renderCalendar();
});

// Initialize view buttons
updateViewButtons();

themeToggle.addEventListener('click', () => {
    const htmlEl = document.documentElement;
    if (htmlEl.classList.contains('dark')) {
        htmlEl.classList.remove('dark');
        localStorage.setItem('theme', 'light');
        themeIcon.className = "fa-solid fa-moon text-indigo-600";
    } else {
        htmlEl.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        themeIcon.className = "fa-solid fa-sun text-amber-400";
    }

    // Redraw chart to update colors for dark/light mode
    if (subscriptions.length > 0) {
        updateDOM();
    }
});

// Init Theme Icon
if (document.documentElement.classList.contains('dark')) {
    themeIcon.className = "fa-solid fa-sun text-amber-400";
} else {
    themeIcon.className = "fa-solid fa-moon text-indigo-100";
}

