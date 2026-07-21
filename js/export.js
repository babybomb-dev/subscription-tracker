import { getCategoryName } from './utils.js';

// ==========================================
// Export Data Functions
// ==========================================

export function exportToCSV(subscriptions) {
    if (!subscriptions || subscriptions.length === 0) {
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
}

export function exportToICS(subscriptions) {
    if (!subscriptions || subscriptions.length === 0) {
        alert('ไม่มีข้อมูลให้ดาวน์โหลด');
        return;
    }

    let icsContent = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//SubTracker//TH\r\n";
    
    subscriptions.forEach(sub => {
        if (!sub.date || sub.isActive === false) return;
        
        // Generate an event for the next upcoming date
        const targetDate = new Date(sub.date);
        const today = new Date();
        today.setHours(0,0,0,0);
        
        // If the date has passed this month, we shift it by month/year depending on cycle
        let eventDate = new Date(targetDate);
        while (eventDate < today) {
            if (sub.cycle === 'yearly') {
                eventDate.setFullYear(eventDate.getFullYear() + 1);
            } else {
                eventDate.setMonth(eventDate.getMonth() + 1);
            }
        }
        
        // Format date to YYYYMMDD
        const yyyy = eventDate.getFullYear();
        const mm = String(eventDate.getMonth() + 1).padStart(2, '0');
        const dd = String(eventDate.getDate()).padStart(2, '0');
        const dateString = `${yyyy}${mm}${dd}`;
        
        // Description
        const price = sub.currency === 'USD' ? `$${sub.price}` : `${sub.price} บาท`;
        const note = sub.note ? `\\nโน้ต: ${sub.note}` : '';
        
        icsContent += "BEGIN:VEVENT\r\n";
        icsContent += `DTSTART;VALUE=DATE:${dateString}\r\n`;
        // For all day events, DTEND should be the day after
        const endEventDate = new Date(eventDate);
        endEventDate.setDate(endEventDate.getDate() + 1);
        const endYyyy = endEventDate.getFullYear();
        const endMm = String(endEventDate.getMonth() + 1).padStart(2, '0');
        const endDd = String(endEventDate.getDate()).padStart(2, '0');
        
        icsContent += `DTEND;VALUE=DATE:${endYyyy}${endMm}${endDd}\r\n`;
        icsContent += `SUMMARY:จ่ายค่า ${sub.name}\r\n`;
        icsContent += `DESCRIPTION:ถึงเวลาชำระค่าบริการ ${sub.name} จำนวน ${price}${note}\r\n`;
        icsContent += `UID:subtracker-${sub.id}-${dateString}@subtracker.app\r\n`;
        
        // Add recurrence rule
        if (sub.cycle === 'yearly') {
            icsContent += "RRULE:FREQ=YEARLY\r\n";
        } else {
            icsContent += "RRULE:FREQ=MONTHLY\r\n";
        }
        
        icsContent += "END:VEVENT\r\n";
    });
    
    icsContent += "END:VCALENDAR\r\n";
    
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "subtracker_calendar.ics");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
