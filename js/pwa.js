/**
 * js/pwa.js
 * Handles Service Worker registration and PWA Installation Prompt
 */

let deferredPrompt;

export function initPWA() {
    // 1. Register Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('SW registered!', reg))
                .catch(err => console.error('SW registration failed!', err));
        });
    }

    // 2. Handle Install Prompt
    // We can show an install button if we want to
    const installBtn = document.getElementById('pwa-install-btn'); // Currently not in UI, but ready

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        if (installBtn) {
            installBtn.classList.remove('hidden');
            installBtn.addEventListener('click', async () => {
                installBtn.classList.add('hidden');
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response to the install prompt: ${outcome}`);
                deferredPrompt = null;
            });
        }
    });

    window.addEventListener('appinstalled', () => {
        if (installBtn) installBtn.classList.add('hidden');
        deferredPrompt = null;
        console.log('PWA was installed');
    });
}
