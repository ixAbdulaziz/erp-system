// home.js - JavaScript للصفحة الرئيسية

// تهيئة الصفحة عند التحميل
document.addEventListener('DOMContentLoaded', function() {
    loadDashboardData();
    loadRecentInvoices();
    startDataRefresh();
});

// تحميل بيانات لوحة المعلومات
function loadDashboardData() {
    // تحميل البيانات من localStorage
    const invoices = JSON.parse(localStorage.getItem('invoices') || '[]');
    const purchaseOrders = JSON.parse(localStorage.getItem('purchaseOrders') || '[]');
    
    // حساب الإحصائيات
    const suppliersSet = new Set();
    let totalAmount = 0;
    
    invoices.forEach(invoice => {
        suppliersSet.add(invoice.supplier);
        totalAmount += invoice.totalAmount || 0;
    });
    
    // تحديث العدادات مع تأثير الرقم المتزايد
    animateCounter('suppliersCount', suppliersSet.size);
    animateCounter('invoicesCount', invoices.length);
    animateCounter('ordersCount', purchaseOrders.length);
    animateCounter('totalAmount', totalAmount, true);
}

// تحميل آخر الفواتير
function loadRecentInvoices() {
    const invoices = JSON.parse(localStorage.getItem('invoices') || '[]');
    const tbody = document.getElementById('recentInvoicesBody');
    
    if (invoices.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-8 text-gray-500">
                    <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    لا توجد فواتير حتى الآن
                    <br>
                    <a href="add.html" class="text-blue-400 hover:text-blue-300 mt-2 inline-block">أضف أول فاتورة</a>
                </td>
            </tr>
        `;
        return;
    }
    
    // ترتيب الفواتير حسب التاريخ (الأحدث أولاً)
    const sortedInvoices = [...invoices].sort((a, b) => {
        return new Date(b.date) - new Date(a.date);
    });
    
    // عرض آخر 5 فواتير
    const recentInvoices = sortedInvoices.slice(0, 5);
    
    tbody.innerHTML = recentInvoices.map((invoice, index) => `
        <tr class="border-b border-gray-800 hover:bg-gray-800/50 transition-colors fade-up" style="animation-delay: ${index * 0.1}s;">
            <td class="py-3 px-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-gradient-to-r from-slate-600 to-slate-700 flex items-center justify-center">
                        <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
                        </svg>
                    </div>
                    <span class="font-medium text-slate-200">${invoice.supplier}</span>
                </div>
            </td>
            <td class="py-3 px-4 text-slate-300">${invoice.invoiceNumber}</td>
            <td class="py-3 px-4 text-slate-400">${formatDate(invoice.date)}</td>
            <td class="py-3 px-4">
                <span class="font-semibold text-green-400">${formatCurrency(invoice.totalAmount)}</span>
            </td>
            <td class="py-3 px-4 text-center">
                ${getInvoiceStatus(invoice)}
            </td>
        </tr>
    `).join('');
}

// الحصول على حالة الفاتورة
function getInvoiceStatus(invoice) {
    // يمكن تحديد الحالة بناءً على معايير مختلفة
    const isPaid = Math.random() > 0.5; // محاكاة للحالة
    
    if (isPaid) {
        return `
            <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                مدفوعة
            </span>
        `;
    } else {
        return `
            <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                معلقة
            </span>
        `;
    }
}

// تأثير العداد المتزايد
function animateCounter(elementId, targetValue, isCurrency = false) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const duration = 1500; // مدة الحركة بالميلي ثانية
    const steps = 60; // عدد الخطوات
    const stepDuration = duration / steps;
    const increment = targetValue / steps;
    
    let currentValue = 0;
    
    const timer = setInterval(() => {
        currentValue += increment;
        
        if (currentValue >= targetValue) {
            currentValue = targetValue;
            clearInterval(timer);
        }
        
        if (isCurrency) {
            element.textContent = formatCurrency(currentValue);
        } else {
            element.textContent = Math.floor(currentValue);
        }
    }, stepDuration);
}

// بدء تحديث البيانات التلقائي
function startDataRefresh() {
    // تحديث البيانات كل 30 ثانية
    setInterval(() => {
        loadDashboardData();
        loadRecentInvoices();
    }, 30000);
}

// إضافة تأثيرات إضافية عند التمرير فوق الكروت
document.addEventListener('DOMContentLoaded', function() {
    const kpiCards = document.querySelectorAll('.kpi-card');
    
    kpiCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            const icon = this.querySelector('.kpi-icon');
            icon.style.transform = 'scale(1.1) rotate(5deg)';
        });
        
        card.addEventListener('mouseleave', function() {
            const icon = this.querySelector('.kpi-icon');
            icon.style.transform = 'scale(1) rotate(0deg)';
        });
    });
    
    // إضافة تأثير النقر على الكروت
    const actionCards = document.querySelectorAll('.glass-card[href]');
    
    actionCards.forEach(card => {
        card.addEventListener('click', function(e) {
            e.preventDefault();
            this.style.transform = 'scale(0.95)';
            
            setTimeout(() => {
                window.location.href = this.getAttribute('href');
            }, 200);
        });
    });
});
