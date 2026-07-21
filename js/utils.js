// ==========================================
// Utility Functions
// ==========================================

export function getCategoryName(cat) {
    switch(cat) {
        case 'entertainment': return '🎬 บันเทิง';
        case 'work': return '💻 การทำงาน';
        case 'utilities': return '⚡ สาธารณูปโภค';
        case 'others': return '🛍️ อื่นๆ';
        default: return '🛍️ อื่นๆ';
    }
}

export function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

export function calculateDueDate(dateString) {
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

export function getServiceLogo(name) {
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

export function getFallbackIcon(name) {
    if (!name) return '';
    const n = name.toLowerCase().trim();
    if (n.includes('มือถือ') || n.includes('โทรศัพท์') || n.includes('mobile') || n.includes('ais') || n.includes('true') || n.includes('dtac')) return '<i class="fa-solid fa-mobile-screen"></i>';
    if (n.includes('เน็ต') || n.includes('wifi') || n.includes('internet') || n.includes('3bb')) return '<i class="fa-solid fa-wifi"></i>';
    if (n.includes('น้ำ') || n.includes('water')) return '<i class="fa-solid fa-droplet text-blue-500"></i>';
    if (n.includes('ไฟ') || n.includes('electric')) return '<i class="fa-solid fa-bolt text-amber-500"></i>';
    if (n.includes('บัตร') || n.includes('card') || n.includes('credit')) return '<i class="fa-regular fa-credit-card"></i>';
    return name.charAt(0);
}

export function generateRandomColors(count) {
    const colors = [
        '#6366f1', // Indigo
        '#ec4899', // Pink
        '#8b5cf6', // Violet
        '#14b8a6', // Teal
        '#f59e0b', // Amber
        '#10b981', // Emerald
        '#3b82f6', // Blue
        '#ef4444', // Red
        '#f97316', // Orange
        '#06b6d4', // Cyan
    ];
    // If we need more colors than available, generate semi-random visually pleasing ones
    const result = [];
    for(let i=0; i<count; i++) {
        if(i < colors.length) {
            result.push(colors[i]);
        } else {
            // Generate random hue, saturation 70-90%, lightness 45-65%
            const h = Math.floor(Math.random() * 360);
            const s = Math.floor(Math.random() * 20) + 70; 
            const l = Math.floor(Math.random() * 20) + 45;
            result.push(`hsl(${h}, ${s}%, ${l}%)`);
        }
    }
    return result;
}
