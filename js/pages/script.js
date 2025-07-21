// script.js - الوظائف المشتركة لجميع الصفحات

// متغيرات عامة
let mobileMenuOpen = false;

// تهيئة الصفحة عند التحميل
document.addEventListener('DOMContentLoaded', function() {
    initializeCommonFeatures();
    setActiveNavLink();
});

// تهيئة المميزات المشتركة
function initializeCommonFeatures() {
    // إضافة تأثيرات التمرير
    setupScrollEffects();
    
    // تهيئة الـ tooltips
    setupTooltips();
    
    // إضافة تأثيرات الحركة
    animateElements();
}

// تعيين الرابط النشط في القائمة الجانبية
function setActiveNavLink() {
    const currentPage = window.location.pathname.split('/').pop() || 'home.html';
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// تبديل القائمة الجانبية للجوال
function toggleMobileMenu() {
    const mobileSidebar = document.getElementById('mobileSidebar');
    if (!mobileSidebar) return;
    
    mobileMenuOpen = !mobileMenuOpen;
    
    if (mobileMenuOpen) {
        mobileSidebar.classList.remove('translate-x-full');
        mobileSidebar.classList.add('translate-x-0');
        document.body.style.overflow = 'hidden';
        
        // إضافة طبقة خلفية
        const backdrop = document.createElement('div');
        backdrop.id = 'mobileBackdrop';
        backdrop.className = 'fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden';
        backdrop.onclick = toggleMobileMenu;
        document.body.appendChild(backdrop);
    } else {
        mobileSidebar.classList.add('translate-x-full');
        mobileSidebar.classList.remove('translate-x-0');
        document.body.style.overflow = '';
        
        // إزالة الطبقة الخلفية
        const backdrop = document.getElementById('mobileBackdrop');
        if (backdrop) backdrop.remove();
    }
}

// إعداد تأثيرات التمرير
function setupScrollEffects() {
    const scrollElements = document.querySelectorAll('.fade-up, .slide-right');
    
    const elementInView = (el, dividend = 1) => {
        const elementTop = el.getBoundingClientRect().top;
        return (
            elementTop <=
            (window.innerHeight || document.documentElement.clientHeight) / dividend
        );
    };
    
    const displayScrollElement = (element) => {
        element.classList.add('scrolled');
    };
    
    const hideScrollElement = (element) => {
        element.classList.remove('scrolled');
    };
    
    const handleScrollAnimation = () => {
        scrollElements.forEach((el) => {
            if (elementInView(el, 1.25)) {
                displayScrollElement(el);
            } else {
                hideScrollElement(el);
            }
        });
    };
    
    window.addEventListener('scroll', () => {
        handleScrollAnimation();
    });
}

// إعداد التلميحات
function setupTooltips() {
    const tooltipElements = document.querySelectorAll('[data-tooltip]');
    
    tooltipElements.forEach(element => {
        element.addEventListener('mouseenter', function() {
            const tooltipText = this.getAttribute('data-tooltip');
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip-popup';
            tooltip.textContent = tooltipText;
            
            document.body.appendChild(tooltip);
            
            const rect = this.getBoundingClientRect();
            tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
            tooltip.style.top = rect.top - tooltip.offsetHeight - 10 + 'px';
            
            setTimeout(() => tooltip.classList.add('show'), 10);
        });
        
        element.addEventListener('mouseleave', function() {
            const tooltips = document.querySelectorAll('.tooltip-popup');
            tooltips.forEach(tooltip => tooltip.remove());
        });
    });
}

// إضافة تأثيرات الحركة للعناصر
function animateElements() {
    // تأثير الظهور التدريجي
    const fadeElements = document.querySelectorAll('.fade-up:not(.animated)');
    fadeElements.forEach((el, index) => {
        setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
            el.classList.add('animated');
        }, index * 100);
    });
    
    // تأثير الانزلاق
    const slideElements = document.querySelectorAll('.slide-right:not(.animated)');
    slideElements.forEach((el, index) => {
        setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateX(0)';
            el.classList.add('animated');
        }, index * 100);
    });
}

// تنسيق التاريخ
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('ar-SA', options);
}

// تنسيق المبلغ
function formatCurrency(amount) {
    return new Intl.NumberFormat('ar-SA', {
        style: 'currency',
        currency: 'SAR',
        minimumFractionDigits: 2
    }).format(amount);
}

// تنسيق الرقم
function formatNumber(number) {
    return new Intl.NumberFormat('ar-SA').format(number);
}

// عرض الإشعارات
function showNotification(message, type = 'info', duration = 5000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const icon = getNotificationIcon(type);
    
    notification.innerHTML = `
        <div class="flex items-center gap-3">
            ${icon}
            <span>${message}</span>
        </div>
        <button onclick="this.parentElement.remove()" class="ml-4 text-white/80 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
        </button>
    `;
    
    document.body.appendChild(notification);
    
    // إضافة الرسوم المتحركة
    setTimeout(() => notification.classList.add('show'), 10);
    
    // إزالة الإشعار تلقائياً
    if (duration > 0) {
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }
}

// الحصول على أيقونة الإشعار
function getNotificationIcon(type) {
    const icons = {
        success: '<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>',
        error: '<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>',
        warning: '<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>',
        info: '<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
    };
    
    return icons[type] || icons.info;
}

// تحميل البيانات من localStorage
function loadData(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('خطأ في تحميل البيانات:', error);
        return null;
    }
}

// حفظ البيانات في localStorage
function saveData(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error('خطأ في حفظ البيانات:', error);
        return false;
    }
}

// البحث في المصفوفة
function searchArray(array, query, fields) {
    if (!query) return array;
    
    const lowerQuery = query.toLowerCase();
    
    return array.filter(item => {
        return fields.some(field => {
            const value = item[field];
            if (value === null || value === undefined) return false;
            return value.toString().toLowerCase().includes(lowerQuery);
        });
    });
}

// ترتيب المصفوفة
function sortArray(array, field, direction = 'asc') {
    return [...array].sort((a, b) => {
        let aVal = a[field];
        let bVal = b[field];
        
        // معالجة القيم الرقمية
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        // معالجة التواريخ
        if (field.includes('date') || field.includes('Date')) {
            aVal = new Date(aVal).getTime();
            bVal = new Date(bVal).getTime();
            return direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        // معالجة النصوص
        aVal = aVal?.toString() || '';
        bVal = bVal?.toString() || '';
        
        if (direction === 'asc') {
            return aVal.localeCompare(bVal, 'ar');
        } else {
            return bVal.localeCompare(aVal, 'ar');
        }
    });
}

// تصدير البيانات إلى CSV
function exportToCSV(data, filename = 'export.csv') {
    if (!data || data.length === 0) {
        showNotification('لا توجد بيانات للتصدير', 'warning');
        return;
    }
    
    // الحصول على رؤوس الأعمدة
    const headers = Object.keys(data[0]);
    
    // إنشاء محتوى CSV
    let csv = '\ufeff'; // BOM for UTF-8
    csv += headers.join(',') + '\n';
    
    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header];
            // معالجة القيم التي تحتوي على فواصل أو أسطر جديدة
            if (value && value.toString().includes(',')) {
                return `"${value}"`;
            }
            return value || '';
        });
        csv += values.join(',') + '\n';
    });
    
    // إنشاء وتحميل الملف
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('تم تصدير البيانات بنجاح', 'success');
}

// طباعة الصفحة أو عنصر معين
function printElement(elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
        showNotification('العنصر المطلوب غير موجود', 'error');
        return;
    }
    
    const printWindow = window.open('', '', 'width=800,height=600');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>طباعة</title>
            <link rel="stylesheet" href="styles.css">
            <style>
                body { background: white; color: black; }
                .no-print { display: none !important; }
                @media print {
                    body { margin: 0; }
                }
            </style>
        </head>
        <body>
            ${element.innerHTML}
        </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 250);
}

// التحقق من صحة البريد الإلكتروني
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// التحقق من صحة رقم الهاتف
function validatePhone(phone) {
    const re = /^[0-9]{10}$/;
    return re.test(phone);
}

// إنشاء معرف فريد
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// جعل الوظائف متاحة عالمياً
window.toggleMobileMenu = toggleMobileMenu;
window.showNotification = showNotification;
window.formatDate = formatDate;
window.formatCurrency = formatCurrency;
window.formatNumber = formatNumber;
window.loadData = loadData;
window.saveData = saveData;
window.exportToCSV = exportToCSV;
window.printElement = printElement;
