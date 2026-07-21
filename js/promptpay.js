// ==========================================
// PromptPay QR Code Generation
// ==========================================

export function crc16(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) > 0) crc = (crc << 1) ^ 0x1021;
            else crc = crc << 1;
        }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

export function generatePromptPayPayload(promptpayId, amount) {
    let target = promptpayId.replace(/[^0-9]/g, '');
    let idType = '0113'; 
    if (target.length >= 13) {
        idType = '0213';
    } else {
        if (target.startsWith('0')) target = '66' + target.slice(1);
        target = target.padStart(13, '0');
    }
    let accInfo = `0016A000000677010111${idType}${target}`;
    let accInfoLen = accInfo.length.toString().padStart(2, '0');
    let amountStr = amount.toFixed(2);
    let amountLen = amountStr.length.toString().padStart(2, '0');
    let payload = `00020101021129${accInfoLen}${accInfo}5802TH530376454${amountLen}${amountStr}6304`;
    return payload + crc16(payload);
}
