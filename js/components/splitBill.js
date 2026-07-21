/**
 * js/components/splitBill.js
 * Handles Split Bill Calculator and PromptPay QR generation
 */
import { generatePromptPayPayload, formatMoney } from '../utils/helpers.js';

let qrcode = null;
let currentTotal = 0;

export function initSplitBill() {
    const peopleInput = document.getElementById('split-people');
    const btnMinus = document.getElementById('split-minus');
    const btnPlus = document.getElementById('split-plus');
    const resultText = document.getElementById('split-result');
    
    const ppInput = document.getElementById('split-promptpay');
    const qrPlaceholder = document.getElementById('qr-placeholder');
    const qrContainer = document.getElementById('qr-container');
    const qrAmount = document.getElementById('qr-amount');
    const qrDiv = document.getElementById('qrcode');

    if (!peopleInput) return;

    function calculateAndGenerate() {
        const people = parseInt(peopleInput.value) || 2;
        if (people < 1) return;
        
        const perPerson = currentTotal / people;
        resultText.innerHTML = `${formatMoney(perPerson)} <span class="text-lg">บ.</span>`;
        
        const ppId = ppInput.value.replace(/[^0-9]/g, ''); // strip non-numeric
        
        // Auto-generate QR if PromptPay ID looks somewhat valid (10 or 13 digits)
        if (ppId.length >= 10 && perPerson > 0) {
            const payload = generatePromptPayPayload(ppId, perPerson);
            if (payload) {
                qrDiv.innerHTML = '';
                
                qrcode = new QRCode(qrDiv, {
                    text: payload,
                    width: 200,
                    height: 200,
                    colorDark : "#000000",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.M
                });

                qrAmount.textContent = formatMoney(perPerson);
                qrPlaceholder.classList.add('hidden');
                qrContainer.classList.remove('hidden');
                return;
            }
        }
        
        // Hide QR if invalid
        qrContainer.classList.add('hidden');
        qrPlaceholder.classList.remove('hidden');
    }

    peopleInput.addEventListener('input', calculateAndGenerate);
    ppInput.addEventListener('input', calculateAndGenerate);

    btnMinus.addEventListener('click', () => {
        let p = parseInt(peopleInput.value) || 2;
        if (p > 1) {
            peopleInput.value = p - 1;
            calculateAndGenerate();
        }
    });

    btnPlus.addEventListener('click', () => {
        let p = parseInt(peopleInput.value) || 2;
        peopleInput.value = p + 1;
        calculateAndGenerate();
    });
    
    // Store the function globally so it can be used if needed
    window.__splitBillCalculateAndGenerate = calculateAndGenerate;
}

export function openSplitBillModal(sub, thbPrice, openModalFn) {
    currentTotal = thbPrice;
    
    // Reset UI
    document.getElementById('split-total-display').textContent = formatMoney(thbPrice);
    document.getElementById('split-people').value = '2';
    document.getElementById('split-promptpay').value = '';
    
    const qrPlaceholder = document.getElementById('qr-placeholder');
    const qrContainer = document.getElementById('qr-container');
    const qrDiv = document.getElementById('qrcode');
    
    qrPlaceholder.classList.remove('hidden');
    qrContainer.classList.add('hidden');
    qrDiv.innerHTML = '';
    
    if(window.__splitBillCalculateAndGenerate) {
        window.__splitBillCalculateAndGenerate();
    }
    
    openModalFn(document.getElementById('modal-split-bill'));
}
