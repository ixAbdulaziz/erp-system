// ملف home.js - الصفحة الرئيسية مع الإحصائيات

// متغيرات عامة
let dashboardData = {
    totalOrders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    totalAmount: 0
};

// تحميل البيانات عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
    loadDashboardStats();
    loadRecentOrders();
});

// تهيئة الصفحة الرئيسية
function initializeDashboard() {
    console.log('تم تحميل الصفحة الرئيسية');
    
    // إضافة أحداث الأزرار إذا كانت موجودة
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            loadDashboardStats();
            loadRecentOrders();
        });
    }
    
    // تحديث البيانات كل دقيقة
    setInterval(() => {
        loadDashboardStats();
    }, 60000);
}

// جلب إحصائيات الداشبورد
async function loadDashboardStats() {
    try {
        showLoading('stats');
        
        const response = await fetch('/api/dashboard/stats');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const stats = await response.json();
        dashboardData = stats;
        
        updateStatsDisplay(stats);
        hideLoading('stats');
        
    } catch (error) {
        console.error('خطأ في جلب إحصائيات الداشبورد:', error);
        showError('فشل في تحميل الإحصائيات');
        hideLoading('stats');
    }
}

// تحديث عرض الإحصائيات
function updateStatsDisplay(stats) {
    // تحديث عدد الطلبات الإجمالي
    const totalOrdersElement = document.getElementById('total-orders');
    if (totalOrdersElement) {
        animateNumber(totalOrdersElement, stats.totalOrders || 0);
    }
    
    // تحديث الطلبات المعلقة
    const pendingOrdersElement = document.getElementById('pending-orders');
    if (pendingOrdersElement) {
        animateNumber(pendingOrdersElement, stats.pendingOrders || 0);
    }
    
    // تحديث الطلبات المكتملة
    const completedOrdersElement = document.getElementById('completed-orders');
    if (completedOrdersElement) {
        animateNumber(completedOrdersElement, stats.completedOrders || 0);
    }
    
    // تحديث المبلغ الإجمالي
    const totalAmountElement = document.getElementById('total-amount');
    if (totalAmountElement) {
        const formattedAmount = formatCurrency(stats.totalAmount || 0);
        totalAmountElement.textContent = formattedAmount;
    }
    
    // تحديث النسب المئوية
    updateProgressBars(stats);
}

// تحديث أشرطة التقدم
function updateProgressBars(stats) {
    const total = stats.totalOrders || 1; // تجنب القسمة على صفر
    
    // نسبة الطلبات المعلقة
    const pendingPercentage = (stats.pendingOrders / total) * 100;
    const pendingBar = document.getElementById('pending-progress');
    if (pendingBar) {
        pendingBar.style.width = `${pendingPercentage}%`;
        pendingBar.setAttribute('aria-valuenow', pendingPercentage);
    }
    
    // نسبة الطلبات المكتملة
    const completedPercentage = (stats.completedOrders / total) * 100;
    const completedBar = document.getElementById('completed-progress');
    if (completedBar) {
        completedBar.style.width = `${completedPercentage}%`;
        completedBar.setAttribute('aria-valuenow', completedPercentage);
    }
}

// جلب آخر الطلبات
async function loadRecentOrders() {
    try {
        showLoading('recent-orders');
        
        const response = await fetch('/api/purchase-orders?limit=5');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const orders = await response.json();
        displayRecentOrders(orders.slice(0, 5)); // أحدث 5 طلبات
        hideLoading('recent-orders');
        
    } catch (error) {
        console.error('خطأ في جلب آخر الطلبات:', error);
        showError('فشل في تحميل آخر الطلبات');
        hideLoading('recent-orders');
    }
}

// عرض آخر الطلبات
function displayRecentOrders(orders) {
    const container = document.getElementById('recent-orders-list');
    if (!container) return;
    
    if (orders.length === 0) {
        container.innerHTML = '<p class="text-center text-muted">لا توجد طلبات حديثة</p>';
        return;
    }
    
    const ordersHTML = orders.map(order => `
        <div class="recent-order-item d-flex justify-content-between align-items-center p-3 border-bottom">
            <div class="order-info">
                <h6 class="mb-1">${escapeHtml(order.supplier_name)}</h6>
                <small class="text-muted">
                    ${formatDate(order.order_date)} • 
                    ${order.items_count || 0} عنصر • 
                    ${formatCurrency(order.total_amount || 0)}
                </small>
            </div>
            <div class="order-status">
                <span class="badge badge-${getStatusClass(order.status)}">
                    ${getStatusText(order.status)}
                </span>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = ordersHTML;
}

// الوظائف المساعدة

// تحريك الأرقام
function animateNumber(element, targetNumber) {
    const currentNumber = parseInt(element.textContent) || 0;
    const increment = Math.ceil((targetNumber - currentNumber) / 20);
    
    if (currentNumber < targetNumber) {
        element.textContent = currentNumber + increment;
        setTimeout(() => animateNumber(element, targetNumber), 50);
    } else {
        element.textContent = targetNumber;
    }
}

// تنسيق العملة
function formatCurrency(amount) {
    return new Intl.NumberFormat('ar-SA', {
        style: 'currency',
        currency: 'SAR',
        minimumFractionDigits: 2
    }).format(amount);
}

// تنسيق التاريخ
function formatDate(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }).format(date);
}

// الحصول على فئة CSS حسب الحالة
function getStatusClass(status) {
    const statusClasses = {
        'pending': 'warning',
        'confirmed': 'info',
        'shipped': 'primary',
        'delivered': 'success',
        'completed': 'success',
        'cancelled': 'danger'
    };
    return statusClasses[status] || 'secondary';
}

// الحصول على نص الحالة بالعربية
function getStatusText(status) {
    const statusTexts = {
        'pending': 'في الانتظار',
        'confirmed': 'مؤكد',
        'shipped': 'تم الشحن',
        'delivered': 'تم التسليم',
        'completed': 'مكتمل',
        'cancelled': 'ملغى'
    };
    return statusTexts[status] || status;
}

// تأمين النص من XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// إظهار مؤشر التحميل
function showLoading(section) {
    const loader = document.getElementById(`${section}-loader`);
    if (loader) {
        loader.style.display = 'block';
    }
}

// إخفاء مؤشر التحميل
function hideLoading(section) {
    const loader = document.getElementById(`${section}-loader`);
    if (loader) {
        loader.style.display = 'none';
    }
}

// إظهار رسالة خطأ
function showError(message) {
    // يمكنك تخصيص هذه الوظيفة حسب نظام الإشعارات لديك
    console.error(message);
    
    // مثال على إظهار إشعار
    const toast = document.createElement('div');
    toast.className = 'alert alert-danger position-fixed';
    toast.style.top = '20px';
    toast.style.right = '20px';
    toast.style.zIndex = '9999';
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // إزالة الإشعار بعد 5 ثواني
    setTimeout(() => {
        document.body.removeChild(toast);
    }, 5000);
}

// تصدير الوظائف للاستخدام في ملفات أخرى
window.DashboardAPI = {
    loadDashboardStats,
    loadRecentOrders,
    formatCurrency,
    formatDate,
    getStatusText,
    getStatusClass
};
