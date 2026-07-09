import { auth, db } from './firebase-config.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup
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

// Form & Inputs
const subForm = document.getElementById('sub-form');
const customNameContainer = document.getElementById('custom-name-container');
const subName = document.getElementById('sub-name');
const subPrice = document.getElementById('sub-price');
const subDate = document.getElementById('sub-date');
const submitBtnText = document.getElementById('submit-btn-text');
const submitBtn = document.getElementById('submit-btn');
const formError = document.getElementById('form-error');

// List & Controls
const subCountEl = document.getElementById('sub-count');
const searchSub = document.getElementById('search-sub');
const sortSub = document.getElementById('sort-sub');
const subList = document.getElementById('sub-list');
const emptyState = document.getElementById('empty-state');
const chartSection = document.getElementById('chart-section');

// Modal
const deleteModal = document.getElementById('delete-modal');
const deleteModalContent = document.getElementById('delete-modal-content');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

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

    const presetValue = presetRadio.value;
    let finalName = presetValue;

    if (presetValue === 'other') {
        finalName = subName.value.trim();
        if (!finalName) {
            showFormError('กรุณากรอกชื่อบริการ');
            return;
        }
    }

    const price = parseFloat(subPrice.value);
    if (isNaN(price) || price <= 0) {
        showFormError('ราคาต้องมากกว่า 0 บาท');
        return;
    }

    const cycleRadio = document.querySelector('input[name="sub-cycle"]:checked');
    const cycle = cycleRadio ? cycleRadio.value : 'monthly';
    const dateValue = subDate.value;

    if (!dateValue) {
        showFormError('กรุณาเลือกวันตัดรอบบิล');
        return;
    }

    const newSubData = {
        userId: currentUserId,
        name: finalName,
        price: price,
        cycle: cycle,
        date: dateValue,
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
// 6. UI Update & Calculations
// ==========================================

function updateDOM() {
    subList.innerHTML = '';
    let totalMonthly = 0;

    // Filter & Sort
    let filteredSubs = [...subscriptions];
    const searchTerm = searchSub.value.toLowerCase().trim();

    if (searchTerm) {
        filteredSubs = filteredSubs.filter(sub => sub.name.toLowerCase().includes(searchTerm));
    }

    const sortBy = sortSub.value;
    if (sortBy === 'price-high') filteredSubs.sort((a, b) => b.price - a.price);
    else if (sortBy === 'price-low') filteredSubs.sort((a, b) => a.price - b.price);
    else if (sortBy === 'name') filteredSubs.sort((a, b) => a.name.localeCompare(b.name));
    // default leaves it as is

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

    let chartLabels = [];
    let chartData = [];

    filteredSubs.forEach((sub) => {
        // Safe check
        if (!sub || !sub.price) return;

        const monthlyPrice = sub.cycle === 'yearly' ? sub.price / 12 : sub.price;
        totalMonthly += monthlyPrice;

        const priceForChart = isYearlyView ? (sub.cycle === 'yearly' ? sub.price : sub.price * 12) : monthlyPrice;
        chartLabels.push(sub.name);
        chartData.push(priceForChart.toFixed(2));

        const logoUrl = getServiceLogo(sub.name);

        // Due Date Logic
        const dueDateInfo = calculateDueDate(sub.date);

        // Build DOM Element
        const div = document.createElement('div');
        div.id = `sub-item-${sub.id}`;
        div.className = 'bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/30 p-4 rounded-2xl shadow-sm flex justify-between items-center border-l-4 border-l-indigo-500 transition-all duration-300';

        div.innerHTML = `
            <div class="flex items-center space-x-3 flex-1 min-w-0">
                <div class="w-11 h-11 shrink-0 rounded-full overflow-hidden border border-slate-100 dark:border-slate-700 shadow-sm bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center relative">
                    ${logoUrl
                ? `<img src="${logoUrl}" class="w-full h-full object-cover bg-white" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                           <div class="hidden absolute inset-0 text-indigo-600 dark:text-indigo-300 font-bold text-lg uppercase flex items-center justify-center">${sub.name.charAt(0)}</div>`
                : `<div class="w-full h-full flex items-center justify-center text-indigo-600 dark:text-indigo-300 font-bold text-lg uppercase">${sub.name.charAt(0)}</div>`
            }
                </div>
                <div class="min-w-0 flex-1">
                    <h3 class="font-bold text-slate-800 dark:text-slate-100 truncate">${sub.name}</h3>
                    <div class="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-2 text-xs">
                        <span class="text-slate-400 dark:text-slate-500 whitespace-nowrap">${sub.price.toLocaleString()} บาท / ${sub.cycle === 'monthly' ? 'เดือน' : 'ปี'}</span>
                        <span class="${dueDateInfo.colorClass} font-medium flex items-center mt-1 sm:mt-0 whitespace-nowrap">
                            <i class="fa-regular fa-calendar mr-1"></i>${dueDateInfo.text}
                        </span>
                    </div>
                </div>
            </div>
            <div class="flex items-center space-x-1 shrink-0 ml-4">
                <span class="font-semibold text-slate-700 dark:text-slate-300 text-sm hidden sm:inline-block mr-2">${monthlyPrice.toFixed(2)} บ.</span>
                <button onclick="editSub('${sub.id}')" class="text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 p-2 rounded-xl transition-colors"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteSub('${sub.id}')" class="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 p-2 rounded-xl transition-colors"><i class="fa-regular fa-trash-can"></i></button>
            </div>
        `;
        subList.appendChild(div);
    });

    // Update Total Cost
    const displayTotal = isYearlyView ? totalMonthly * 12 : totalMonthly;
    totalCostEl.innerText = `${displayTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท`;

    // Draw Chart
    drawChart(chartLabels, chartData);
}

function calculateDueDate(dateString) {
    if (!dateString) return { text: "ไม่ระบุ", colorClass: "text-slate-400" };

    const targetDate = new Date(dateString);
    targetDate.setHours(0, 0, 0, 0); // Normalize time
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = targetDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return { text: `เลยกำหนด ${Math.abs(diffDays)} วัน!`, colorClass: "text-rose-500" }; // Red
    } else if (diffDays === 0) {
        return { text: "ครบกำหนดวันนี้!", colorClass: "text-amber-500" }; // Yellow/Orange
    } else if (diffDays <= 3) {
        return { text: `อีก ${diffDays} วัน`, colorClass: "text-amber-500" }; // Yellow/Orange
    } else {
        return { text: `อีก ${diffDays} วัน`, colorClass: "text-emerald-500" }; // Green
    }
}


function getServiceLogo(name) {
    if (!name) return null;
    const n = name.toLowerCase();
    if (n.includes('netflix')) return 'https://icon.horse/icon/netflix.com';
    if (n.includes('spotify')) return 'https://icon.horse/icon/spotify.com';
    if (n.includes('youtube')) return 'https://icon.horse/icon/youtube.com';
    if (n.includes('disney')) return 'https://icon.horse/icon/disneyplus.com';
    if (n.includes('apple')) return 'https://icon.horse/icon/apple.com';
    if (n.includes('google')) return 'https://icon.horse/icon/google.com';
    if (n.includes('amazon') || n.includes('prime')) return 'https://icon.horse/icon/amazon.com';
    if (n.includes('hbo')) return 'https://icon.horse/icon/hbo.com';
    if (n.includes('canva')) return 'https://icon.horse/icon/canva.com';

    // Optional generic fallback for any unknown service if you assume name is a domain.
    // For safety, return null to use the first-letter fallback.
    return null;
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

    // Determine theme for chart text
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

    // Custom HTML Legend
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
        const hue = Math.floor(i * hueStep + (Math.random() * 20)); // Distribute hues evenly
        colors.push(`hsl(${hue}, 70%, 60%)`);
    }
    return colors;
}

// ==========================================
// 8. Edit / View / Form Controls
// ==========================================

window.editSub = function (id) {
    const sub = subscriptions.find(s => s.id === id);
    if (!sub) return;

    editTargetId = id;

    // Set Form Values
    const presets = ['Netflix', 'Spotify', 'YouTube Premium', 'Disney+'];
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
    const cycleRadio = document.querySelector(`input[name="sub-cycle"][value="${sub.cycle}"]`);
    if (cycleRadio) cycleRadio.checked = true;

    if (sub.date) subDate.value = sub.date;

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
}

window.toggleCustomInput = function () {
    const presetRadio = document.querySelector('input[name="sub-preset"]:checked');
    if (!presetRadio) return;

    const preset = presetRadio.value;

    if (preset === 'other') {
        customNameContainer.classList.remove('hidden');
        subName.required = true;
        subName.focus();
    } else {
        customNameContainer.classList.add('hidden');
        subName.required = false;
        subName.value = '';
    }
}

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
        totalLabelEl.innerText = "ยอดรวมต่อปี";
    } else {
        toggleKnob.classList.remove('translate-x-7');
        toggleKnob.classList.add('translate-x-1');
        totalLabelEl.innerText = "ยอดรวมต่อเดือน";
    }

    updateDOM();
});

// Search & Sort Listeners
searchSub.addEventListener('input', updateDOM);
sortSub.addEventListener('change', updateDOM);

// ==========================================
// 9. Dark Mode Handlers
// ==========================================

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

