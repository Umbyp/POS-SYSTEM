import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Lang = 'th' | 'en';

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
}

/** App language, persisted. Defaults to Thai (primary audience). */
export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: 'th',
      setLang: (lang) => set({ lang }),
      toggle: () => set((s) => ({ lang: s.lang === 'th' ? 'en' : 'th' })),
    }),
    { name: 'pos-lang' }
  )
);

type Entry = { th: string; en: string };

// Flat, dot-namespaced dictionary. Add keys here as more screens are localized.
const DICT: Record<string, Entry> = {
  // Sidebar navigation
  'nav.dashboard': { th: 'แดชบอร์ด', en: 'Dashboard' },
  'nav.pos': { th: 'ขายหน้าร้าน', en: 'POS' },
  'nav.kitchen': { th: 'ครัว', en: 'Kitchen' },
  'nav.tables': { th: 'โต๊ะ', en: 'Tables' },
  'nav.orders': { th: 'ออเดอร์', en: 'Orders' },
  'nav.products': { th: 'สินค้า', en: 'Products' },
  'nav.inventory': { th: 'สต๊อก', en: 'Inventory' },
  'nav.customers': { th: 'ลูกค้า', en: 'Customers' },
  'nav.staff': { th: 'พนักงาน', en: 'Staff' },
  'nav.reports': { th: 'รายงาน', en: 'Reports' },
  'nav.activity': { th: 'ประวัติการใช้งาน', en: 'Activity' },
  'nav.settings': { th: 'ตั้งค่า', en: 'Settings' },
  'nav.analytics': { th: 'วิเคราะห์ข้อมูล', en: 'Analytics' },
  'nav.logout': { th: 'ออกจากระบบ', en: 'Log out' },

  // POS screen
  'pos.searchPlaceholder': { th: 'ค้นหาสินค้า... (F2)', en: 'Search products... (F2)' },
  'pos.all': { th: 'ทั้งหมด', en: 'All' },
  'pos.noProducts': { th: 'ไม่พบสินค้า', en: 'No products found' },
  'pos.recent': { th: 'ล่าสุด', en: 'Recent' },
  'pos.barcodeNotFound': { th: 'ไม่พบบาร์โค้ด', en: 'Barcode not found' },
  'pos.added': { th: 'เพิ่มแล้ว', en: 'Added' },

  // Cart
  'cart.selectCustomer': { th: '+ เลือกลูกค้า', en: '+ Select customer' },
  'cart.dineIn': { th: 'ทานที่ร้าน', en: 'Dine-in' },
  'cart.takeaway': { th: 'กลับบ้าน', en: 'Takeaway' },
  'cart.delivery': { th: 'เดลิเวอรี่', en: 'Delivery' },
  'cart.deliveryNetProfit': { th: 'กำไรสุทธิเดลิเวอรี่', en: 'Delivery net profit' },
  'cart.revenue': { th: 'รายรับ', en: 'Revenue' },
  'cart.gpFee': { th: 'ค่า GP', en: 'GP fee' },
  'cart.netProfit': { th: 'กำไรสุทธิ', en: 'Net profit' },
  'cart.selectTable': { th: 'เลือกโต๊ะ (ไม่บังคับ)', en: 'Select table (optional)' },
  'cart.tableWord': { th: 'โต๊ะ', en: 'Table' },
  'cart.seats': { th: 'ที่นั่ง', en: 'seats' },
  'cart.reserved': { th: 'จองแล้ว', en: 'Reserved' },
  'cart.occupied': { th: 'ไม่ว่าง', en: 'Occupied' },
  'cart.tablesHidden': { th: 'โต๊ะไม่ว่างถูกซ่อน', en: 'occupied tables hidden' },
  'cart.empty': { th: 'แตะหรือสแกนสินค้าเพื่อเริ่มบิล', en: 'Tap or scan a product to start' },
  'cart.subtotal': { th: 'ยอดรวม', en: 'Subtotal' },
  'cart.discount': { th: 'ส่วนลด', en: 'Discount' },
  'cart.discountsPromos': { th: 'ส่วนลด & โปรโมชั่น', en: 'Discounts & promotions' },
  'cart.promoPlaceholder': { th: 'โค้ดส่วนลด (ถ้ามี)', en: 'Promo code (optional)' },
  'cart.redeemPoints': { th: 'ใช้แต้ม', en: 'Redeem points' },
  'cart.pointsYouHave': { th: 'คุณมี', en: 'you have' },
  'cart.points': { th: 'แต้ม', en: 'pts' },
  'cart.pointsRemaining': { th: 'แต้มคงเหลือ', en: 'pts remaining' },
  'cart.useMax': { th: 'ใช้สูงสุด', en: 'Use max' },
  'cart.clear': { th: 'ล้าง', en: 'Clear' },
  'cart.pointsRedeemed': { th: 'ใช้แต้มแล้ว', en: 'Points redeemed' },
  'cart.serviceCharge': { th: 'ค่าบริการ', en: 'Service charge' },
  'cart.vat': { th: 'ภาษี', en: 'VAT' },
  'cart.inclVat': { th: 'รวมภาษี', en: 'incl. VAT' },
  'cart.total': { th: 'ยอดสุทธิ', en: 'Total' },
  'cart.park': { th: 'พักบิล', en: 'Park' },
  'cart.pay': { th: 'รับเงิน', en: 'Pay' },
  'cart.parked': { th: 'พักบิลแล้ว', en: 'Order parked' },
  'cart.sendKitchen': { th: 'ส่งครัว', en: 'Send to kitchen' },
  'cart.sentToKitchen': { th: 'ส่งเข้าครัวแล้ว', en: 'Sent to kitchen' },
  'cart.runningBill': { th: 'บิลโต๊ะนี้ (ส่งครัวแล้ว)', en: 'Table bill (sent)' },
  'cart.newRound': { th: 'รอบใหม่', en: 'New round' },
  'cart.sendFirst': { th: 'กด "ส่งครัว" ก่อนรับเงิน', en: 'Send to kitchen before paying' },
  'cart.sendFailed': { th: 'ส่งครัวไม่สำเร็จ', en: 'Failed to send to kitchen' },

  // Tables
  'tables.title': { th: 'โต๊ะ', en: 'Tables' },
  'tables.showOccupied': { th: 'แสดงโต๊ะไม่ว่าง', en: 'Show occupied' },
  'tables.hideOccupied': { th: 'ซ่อนโต๊ะไม่ว่าง', en: 'Hide occupied' },
  'tables.addTable': { th: 'เพิ่มโต๊ะ', en: 'Add table' },
  'tables.addFirst': { th: 'เพิ่มโต๊ะแรก', en: 'Add first table' },
  'tables.seats': { th: 'ที่นั่ง', en: 'seats' },
  'tables.currentStatus': { th: 'สถานะปัจจุบัน:', en: 'Current status:' },
  'tables.seated': { th: 'นั่งมาแล้ว', en: 'seated' },
  'tables.editTable': { th: 'แก้ไขโต๊ะ', en: 'Edit table' },
  'tables.goToBill': { th: 'ไปที่บิล (ขาย)', en: 'Go to bill (POS)' },
  'tables.openBill': { th: 'เปิดบิล / สั่งอาหาร', en: 'Open bill / order' },
  'tables.noTables': { th: 'ยังไม่มีโต๊ะ', en: 'No tables yet' },
  'tables.noMatch': { th: 'ไม่มีโต๊ะตรงกับตัวกรอง', en: 'No tables match the current filter' },
  'tables.status.AVAILABLE': { th: 'ว่าง', en: 'Available' },
  'tables.status.RESERVED': { th: 'จองแล้ว', en: 'Reserved' },
  'tables.status.OCCUPIED': { th: 'มีลูกค้า', en: 'Occupied' },
  'tables.status.BILLING': { th: 'คิดเงิน', en: 'Billing' },
  'tables.status.DIRTY': { th: 'รอเก็บโต๊ะ', en: 'Cleaning' },
  'tables.desc.AVAILABLE': { th: 'พร้อมรับลูกค้า', en: 'Open for customers' },
  'tables.desc.RESERVED': { th: 'จองไว้ล่วงหน้า', en: 'Booked in advance' },
  'tables.desc.OCCUPIED': { th: 'ลูกค้ากำลังนั่ง', en: 'Guests are seated' },
  'tables.desc.BILLING': { th: 'กำลังชำระเงิน', en: 'Payment in progress' },
  'tables.desc.DIRTY': { th: 'ต้องเก็บโต๊ะ', en: 'Needs cleaning' },

  // Barcode scanner
  'scan.title': { th: 'สแกนบาร์โค้ด', en: 'Scan barcode' },
  'scan.starting': { th: 'กำลังเปิดกล้อง…', en: 'Starting camera…' },
  'scan.denied': { th: 'ไม่ได้รับสิทธิ์ใช้กล้อง', en: 'Camera permission denied' },
  'scan.deniedHint': { th: 'อนุญาตการใช้กล้อง หรือพิมพ์เลขด้านล่าง', en: 'Allow camera access, or type the code below.' },
  'scan.noCamera': { th: 'ไม่พบกล้อง', en: 'No camera available' },
  'scan.noCameraHint': { th: 'พิมพ์บาร์โค้ดด้านล่าง', en: 'Enter the barcode manually below.' },
  'scan.hintNative': { th: 'เล็งไปที่บาร์โค้ดหรือ QR ของสินค้า', en: 'Point at a product barcode or QR code' },
  'scan.hintQr': { th: 'เบราว์เซอร์นี้อ่านได้เฉพาะ QR — ใช้ช่องพิมพ์สำหรับบาร์โค้ด 1D', en: 'This browser reads QR codes only — use manual entry for 1D barcodes' },
  'scan.manualPlaceholder': { th: 'พิมพ์บาร์โค้ดเอง', en: 'Enter barcode manually' },
  'common.add': { th: 'เพิ่ม', en: 'Add' },
  'common.cancel': { th: 'ยกเลิก', en: 'Cancel' },

  // Void item (remove an already-fired item from an unpaid bill)
  'void.title': { th: 'ยกเลิกรายการ', en: 'Void item' },
  'void.qty': { th: 'จำนวนที่ยกเลิก', en: 'Quantity to void' },
  'void.maxHint': { th: 'ยกเลิกได้สูงสุด', en: 'Max' },
  'void.reason': { th: 'เหตุผล (จำเป็น)', en: 'Reason (required)' },
  'void.reasonPlaceholder': { th: 'เช่น ลูกค้าสั่งผิด, ทำผิด', en: 'e.g. wrong order, kitchen mistake' },
  'void.confirm': { th: 'ยืนยันยกเลิก', en: 'Confirm void' },
  'void.success': { th: 'ยกเลิกรายการแล้ว', en: 'Item voided' },
  'void.failed': { th: 'ยกเลิกรายการไม่สำเร็จ', en: 'Failed to void item' },

  // Payment dialog
  'pay.title': { th: 'ชำระเงิน', en: 'Payment' },
  'pay.amountDue': { th: 'ยอดที่ต้องชำระ', en: 'Amount due' },
  'pay.methodLabel': { th: 'วิธีชำระเงิน', en: 'Payment method' },
  'pay.cash': { th: 'เงินสด', en: 'Cash' },
  'pay.promptpay': { th: 'พร้อมเพย์', en: 'PromptPay' },
  'pay.creditCard': { th: 'บัตรเครดิต/เดบิต', en: 'Credit/debit card' },
  'pay.bankTransfer': { th: 'โอนเงิน', en: 'Bank transfer' },
  'pay.cashReceived': { th: 'รับเงินสด', en: 'Cash received' },
  'pay.exact': { th: 'พอดี', en: 'Exact' },
  'pay.change': { th: 'เงินทอน', en: 'Change' },
  'pay.addPaymentLine': { th: '+ เพิ่มวิธีชำระเงิน', en: '+ Add payment method' },
  'pay.splitEvenly': { th: 'แบ่งบิลเท่า ๆ กัน', en: 'Split evenly' },
  'pay.people': { th: 'คน', en: 'people' },
  'pay.splitApply': { th: 'แบ่ง', en: 'Split' },
  'pay.perPerson': { th: 'ต่อคน', en: 'each' },
  'pay.remove': { th: 'ลบ', en: 'Remove' },
  'pay.remaining': { th: 'ยอดคงเหลือ', en: 'Remaining' },
  'pay.fullyPaid': { th: 'ครบยอดแล้ว', en: 'Fully paid' },
  'pay.issueTaxInvoice': { th: 'ออกใบกำกับภาษีเต็มรูป', en: 'Issue full tax invoice' },
  'pay.customerName': { th: 'ชื่อลูกค้า / บริษัท', en: 'Customer / Company name' },
  'pay.taxId': { th: 'เลขผู้เสียภาษี (13 หลัก)', en: 'Tax ID (13 digits)' },
  'pay.address': { th: 'ที่อยู่', en: 'Address' },
  'pay.confirmPayment': { th: 'ยืนยันรับเงิน', en: 'Confirm payment' },
  'pay.success': { th: 'ชำระเงินสำเร็จ', en: 'Payment successful' },
  'pay.orderNumber': { th: 'เลขที่ออเดอร์', en: 'Order number' },
  'pay.close': { th: 'ปิด', en: 'Close' },
  'pay.viewReceipt': { th: 'ดูใบเสร็จ', en: 'View receipt' },
  'pay.openFullInvoice': { th: 'เปิดแท็บใหม่ (สำหรับพิมพ์ A4 / ใบกำกับเต็ม)', en: 'Open in new tab (for A4 / full invoice)' },
  'pay.receiptTitle': { th: 'ใบเสร็จ', en: 'Receipt' },
  'pay.back': { th: 'ย้อนกลับ', en: 'Back' },
  'pay.print': { th: 'พิมพ์', en: 'Print' },
  'pay.offlineSaved': { th: 'บันทึกออฟไลน์ไว้แล้ว — จะซิงค์เมื่อออนไลน์', en: 'Saved offline — will sync when online' },
  'pay.failed': { th: 'ชำระเงินไม่สำเร็จ', en: 'Payment failed' },
  'pay.openCustomerDisplay': { th: 'เปิดจอลูกค้า', en: 'Open customer display' },
  'pay.copyDisplayLink': { th: 'คัดลอกลิงก์จอลูกค้า (เครื่องอื่น)', en: 'Copy display link (other device)' },
  'pay.linkCopied': { th: 'คัดลอกลิงก์แล้ว', en: 'Link copied' },
  'pay.linkCopiedLocalhostHint': {
    th: 'คัดลอกลิงก์แล้ว — ถ้าเปิดจากเครื่องอื่น ให้เปลี่ยน localhost เป็น IP ของเครื่องนี้ในวง WiFi เดียวกัน',
    en: 'Link copied — if opening on another device, replace "localhost" with this machine\'s IP on the same network',
  },
  'pay.copyLinkFailed': { th: 'คัดลอกลิงก์ไม่สำเร็จ', en: 'Failed to copy link' },

  // Customer-facing display
  'display.welcome': { th: 'ยินดีต้อนรับ', en: 'Welcome' },
  'display.idleHint': { th: 'รายการสั่งซื้อของคุณจะแสดงที่นี่', en: 'Your order will appear here' },
  'display.yourOrder': { th: 'รายการของคุณ', en: 'Your order' },
  'display.items': { th: 'รายการ', en: 'items' },
  'display.total': { th: 'ยอดรวม', en: 'Total' },
  'display.scanToPay': { th: 'สแกนเพื่อชำระเงิน', en: 'Scan to pay' },
  'display.thankYou': { th: 'ขอบคุณที่ใช้บริการ', en: 'Thank you for your order' },
  'display.paidAmount': { th: 'ชำระแล้ว', en: 'Amount paid' },
};

/** Hook returning a translator bound to the current language. */
export function useT() {
  const lang = useLangStore((s) => s.lang);
  return (key: string, fallback?: string) => DICT[key]?.[lang] ?? fallback ?? key;
}
