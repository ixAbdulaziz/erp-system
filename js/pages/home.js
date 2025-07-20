/*
==========================================
  ملف JavaScript الرئيسي - app.js
  نظام إدارة المشتريات - محدث للاتصال بالخادم
==========================================
*/

// =================== //
//   دوال مساعدة       //
// =================== //

/**
 * تنسيق العملة بالريال السعودي
 * @param {number} num - المبلغ
 * @returns {string} - المبلغ منسق
 */
const formatCurrency = (num) => {
  if (!num || num === 0) return '0 ر.س';
  return new Intl.NumberFormat('en-US').format(num) + ' ر.س';
};

/**
 * تنسيق التاريخ بالعربية
 * @param {string} dateString - التاريخ
 * @returns {string} - التاريخ منسق
 */
const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('ar-SA');
};

/**
 * إنشاء عنصر HTML من نص
 * @param {string} htmlString - نص HTML
 * @returns {Element} - عنصر HTML
 */
const createElementFromHTML = (htmlString) => {
  const div = document.createElement('div');
  div.innerHTML = htmlString.trim();
  return div.firstChild;
};

// =================== //
//   APIs الخادم        //
// =================== //

/**
 * جلب الإحصائيات من الخادم
 */
async function fetchDashboardStats() {
  try {
    const response = await fetch('/api/dashboard/stats');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('خطأ في جلب الإحصائيات:', error);
    return {
      supplierCount: 0,
      invoiceCount: 0,
      orderCount: 0,
      totalAmount: 0
    };
  }
}

/**
 * جلب الفواتير من الخادم
 */
async function fetchInvoices() {
  try {
    const response = await fetch('/api/invoices');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('خطأ في جلب الفواتير:', error);
    return [];
  }
}

/**
 * جلب أوامر الشراء من الخادم
 */
async function fetchPurchaseOrders() {
  try {
    const response = await fetch('/api/purchase-orders');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('خطأ في جلب أوامر الشراء:', error);
    return [];
  }
}

// =================== //
//   تحديث المؤشرات    //
// =================== //

/**
 * تحديث مؤشرات الأداء (KPI)
 * @param {Object} data - بيانات المؤشرات
 */
const updateKPICards = (data = {}) => {
  const {
    supplierCount = 0,
    invoiceCount = 0,
    orderCount = 0,
    totalAmount = 0
  } = data;

  // تحديث عدد الموردين
  const supplierElement = document.querySelector('.kpi-card.suppliers .kpi-value');
  if (supplierElement) {
    animateNumber(supplierElement, supplierCount);
  }

  // تحديث عدد الفواتير
  const invoiceElement = document.querySelector('.kpi-card.unpaid .kpi-value');
  if (invoiceElement) {
    animateNumber(invoiceElement, invoiceCount);
  }

  // تحديث عدد أوامر الشراء
  const orderElement = document.querySelector('.kpi-card.orders .kpi-value');
  if (orderElement) {
    animateNumber(orderElement, orderCount);
  }

  // تحديث المبالغ المستحقة
  const outstandingElement = document.querySelector('.kpi-card.outstanding .kpi-value');
  if (outstandingElement) {
    setTimeout(() => {
      outstandingElement.textContent = formatCurrency(totalAmount);
    }, 400);
  }
};

/**
 * حركة عد الأرقام
 * @param {Element} element - عنصر العرض
 * @param {number} targetValue - القيمة المستهدفة
 * @param {string} suffix - لاحقة النص
 */
const animateNumber = (element, targetValue, suffix = '') => {
  const startValue = 0;
  const duration = 1000;
  const startTime = Date.now();
  
  const updateNumber = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const currentValue = Math.floor(startValue + (targetValue - startValue) * progress);
    
    element.textContent = currentValue.toLocaleString() + suffix;
    
    if (progress < 1) {
      requestAnimationFrame(updateNumber);
    }
  };
  
  updateNumber();
};

// =================== //
//   إدارة الموردين    //
// =================== //

/**
 * معالجة بيانات الموردين من الفواتير
 * @param {Array} invoices - قائمة الفواتير
 * @returns {Array} - قائمة الموردين مع الإحصائيات
 */
function processSuppliers(invoices) {
  const suppliersMap = {};
  
  invoices.forEach(invoice => {
    const supplier = invoice.supplier;
    if (!supplier) return;
    
    if (!suppliersMap[supplier]) {
      suppliersMap[supplier] = {
        name: supplier,
        invoiceCount: 0,
        totalAmount: 0,
        lastInvoiceDate: null
      };
    }
    
    suppliersMap[supplier].invoiceCount++;
    suppliersMap[supplier].totalAmount += parseFloat(invoice.totalAmount || 0);
    
    const invoiceDate = new Date(invoice.date);
    if (!suppliersMap[supplier].lastInvoiceDate || 
        invoiceDate > new Date(suppliersMap[supplier].lastInvoiceDate)) {
      suppliersMap[supplier].lastInvoiceDate = invoice.date;
    }
  });
  
  return Object.values(suppliersMap)
    .sort((a, b) => new Date(b.lastInvoiceDate) - new Date(a.lastInvoiceDate));
}

/**
 * عرض قائمة الموردين
 * @param {Array} suppliers - قائمة الموردين
 */
const renderSuppliers = (suppliers = []) => {
  const container = document.getElementById('supplier-container');
  if (!container) return;

  container.innerHTML = '';

  if (suppliers.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 text-slate-400">
        <div class="flex flex-col items-center gap-4">
          <svg class="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
          </svg>
          <div>
            <p class="font-semibold mb-1">لا يوجد موردون بعد</p>
            <p class="text-sm">ابدأ بإضافة أول فاتورة</p>
          </div>
          <a href="add.html" class="modern-btn info">إضافة فاتورة جديدة</a>
        </div>
      </div>
    `;
    return;
  }

  // تحويل الحاوي إلى شبكة (grid)
  container.className = 'grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  // عرض أول 3 موردين فقط
  const limitedSuppliers = suppliers.slice(0, 3);
  
  limitedSuppliers.forEach((supplier, index) => {
    const supplierCard = createSupplierCard(supplier, index);
    container.appendChild(supplierCard);
  });

  // إضافة رابط "عرض الكل" إذا كان هناك أكثر من 3 موردين
  if (suppliers.length > 3) {
    const viewAllContainer = document.createElement('div');
    viewAllContainer.className = 'col-span-full mt-6 text-center';
    viewAllContainer.innerHTML = `
      <a href="view.html" class="view-all-link">
        <span>عرض جميع الموردين</span>
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
        </svg>
      </a>
    `;
    container.appendChild(viewAllContainer);
  }
};

/**
 * إنشاء كرت مورد
 * @param {Object} supplier - بيانات المورد
 * @param {number} index - فهرس المورد
 * @returns {Element} - عنصر كرت المورد
 */
const createSupplierCard = (supplier, index) => {
  const card = document.createElement('div');
  card.className = 'supplier-card slide-right';
  card.style.animationDelay = `${index * 0.1}s`;
  
  card.innerHTML = `
    <div class="supplier-icon">
      <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
      </svg>
    </div>
    <h4 class="text-lg font-bold text-slate-200 mb-2 break-words">${supplier.name || 'غير معروف'}</h4>
    <div class="space-y-2 text-sm text-slate-400 mb-4">
      <div class="flex justify-between">
        <span>الفواتير:</span>
        <span class="text-slate-300 font-semibold">${supplier.invoiceCount || 0}</span>
      </div>
      <div class="flex justify-between">
        <span>الإجمالي:</span>
        <span class="text-slate-300 font-semibold">${formatCurrency(supplier.totalAmount || 0)}</span>
      </div>
      <div class="flex justify-between">
        <span>آخر فاتورة:</span>
        <span class="text-slate-300 font-semibold">${formatDate(supplier.lastInvoiceDate)}</span>
      </div>
    </div>
    <a href="view.html?supplier=${encodeURIComponent(supplier.name || '')}" class="modern-btn success w-full text-center justify-center">
      عرض الفواتير
    </a>
  `;
  
  return card;
};

// =================== //
//   إدارة الفواتير    //
// =================== //

/**
 * عرض قائمة الفواتير
 * @param {Array} invoices - قائمة الفواتير
 */
const renderInvoices = (invoices = []) => {
  const tbody = document.getElementById('invoice-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (invoices.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-12 text-slate-400">
          <div class="flex flex-col items-center gap-4">
            <svg class="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <div>
              <p class="font-semibold mb-1">لا توجد فواتير بعد</p>
              <p class="text-sm">ابدأ بإضافة أول فاتورة</p>
            </div>
            <a href="add.html" class="modern-btn info">إضافة فاتورة جديدة</a>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  // عرض أحدث 5 فواتير
  const limitedInvoices = invoices.slice(0, 5);
  
  limitedInvoices.forEach((invoice, index) => {
    const row = createInvoiceRow(invoice, index);
    tbody.appendChild(row);
  });
};

/**
 * إنشاء صف فاتورة
 * @param {Object} invoice - بيانات الفاتورة
 * @param {number} index - فهرس الفاتورة
 * @returns {Element} - عنصر صف الفاتورة
 */
const createInvoiceRow = (invoice, index) => {
  const row = document.createElement('tr');
  row.className = 'fade-up';
  row.style.animationDelay = `${index * 0.1}s`;
  
  const invoiceNumber = invoice.invoiceNumber || invoice.number || invoice.id || '-';
  
  row.innerHTML = `
    <td class="font-semibold text-slate-300">${invoiceNumber}</td>
    <td class="text-slate-400">${invoice.supplier || '-'}</td>
    <td class="text-slate-400">${formatDate(invoice.date)}</td>
    <td class="font-mono font-bold text-slate-300">${formatCurrency(invoice.totalAmount || 0)}</td>
  `;
  
  return row;
};

// =================== //
//   البحث والتصفية   //
// =================== //

/**
 * تفعيل وظيفة البحث في الفواتير
 */
const initializeSearch = () => {
  const searchInput = document.getElementById('invoiceSearch');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    const tableRows = document.querySelectorAll('#invoice-tbody tr');
    
    tableRows.forEach(row => {
      const rowText = row.textContent.toLowerCase();
      const isVisible = rowText.includes(searchTerm);
      row.style.display = isVisible ? '' : 'none';
    });
  });
};

// =================== //
//   تهيئة التطبيق     //
// =================== //

/**
 * تهيئة الصفحة الرئيسية
 */
const initializeDashboard = async () => {
  console.log('🚀 تم تحميل لوحة إدارة المشتريات');
  
  try {
    // عرض حالة التحميل
    showLoadingState();
    
    // جلب البيانات من الخادم
    const [stats, invoices, purchaseOrders] = await Promise.all([
      fetchDashboardStats(),
      fetchInvoices(),
      fetchPurchaseOrders()
    ]);
    
    // تحديث المؤشرات
    updateKPICards({
      supplierCount: stats.supplierCount || stats.supplier_count || 0,
      invoiceCount: stats.invoiceCount || stats.invoice_count || 0,
      orderCount: stats.orderCount || stats.order_count || 0,
      totalAmount: stats.totalAmount || stats.total_amount || 0
    });
    
    // معالجة وعرض الموردين
    const suppliers = processSuppliers(invoices);
    renderSuppliers(suppliers);
    
    // عرض الفواتير
    renderInvoices(invoices);
    
    // إخفاء حالة التحميل
    hideLoadingState();
    
  } catch (error) {
    console.error('خطأ في تهيئة اللوحة:', error);
    
    // عرض حالة الخطأ
    showErrorState();
  }
  
  // تفعيل وظيفة البحث
  initializeSearch();
  
  console.log('✅ تم تهيئة النظام بنجاح');
};

/**
 * عرض حالة التحميل
 */
function showLoadingState() {
  // تحديث KPI cards بحالة التحميل
  document.querySelectorAll('.kpi-value').forEach(el => {
    el.textContent = '...';
  });
  
  // تحديث الموردين بحالة التحميل
  const supplierContainer = document.getElementById('supplier-container');
  if (supplierContainer) {
    supplierContainer.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="animate-spin w-8 h-8 border-4 border-slate-600 border-t-slate-400 rounded-full mx-auto mb-4"></div>
        <p class="text-slate-400">جاري تحميل البيانات...</p>
      </div>
    `;
  }
  
  // تحديث الفواتير بحالة التحميل
  const invoiceTbody = document.getElementById('invoice-tbody');
  if (invoiceTbody) {
    invoiceTbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-12">
          <div class="animate-spin w-8 h-8 border-4 border-slate-600 border-t-slate-400 rounded-full mx-auto mb-4"></div>
          <p class="text-slate-400">جاري تحميل الفواتير...</p>
        </td>
      </tr>
    `;
  }
}

/**
 * إخفاء حالة التحميل
 */
function hideLoadingState() {
  // إزالة أي مؤشرات تحميل
  document.querySelectorAll('.animate-spin').forEach(el => {
    el.remove();
  });
}

/**
 * عرض حالة الخطأ
 */
function showErrorState() {
  // تحديث المؤشرات بقيم افتراضية
  updateKPICards();
  
  // عرض رسالة خطأ للموردين
  const supplierContainer = document.getElementById('supplier-container');
  if (supplierContainer) {
    supplierContainer.innerHTML = `
      <div class="col-span-full text-center py-12 text-red-400">
        <svg class="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
        </svg>
        <p class="font-semibold mb-2">خطأ في تحميل البيانات</p>
        <p class="text-sm mb-4">تأكد من اتصال الخادم وقاعدة البيانات</p>
        <button onclick="location.reload()" class="modern-btn info">إعادة المحاولة</button>
      </div>
    `;
  }
  
  // عرض رسالة خطأ للفواتير
  const invoiceTbody = document.getElementById('invoice-tbody');
  if (invoiceTbody) {
    invoiceTbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-12 text-red-400">
          <p>خطأ في تحميل الفواتير</p>
        </td>
      </tr>
    `;
  }
}

// =================== //
//   معالجة الأحداث    //
// =================== //

/**
 * معالج تحميل الصفحة
 */
document.addEventListener('DOMContentLoaded', () => {
  initializeDashboard();
});

/**
 * معالج إعادة تحميل النافذة
 */
window.addEventListener('load', () => {
  // إضافة تأثيرات بصرية إضافية عند التحميل الكامل
  document.body.classList.add('loaded');
});

// =================== //
//   تصدير الوظائف    //
// =================== //

// جعل الوظائف متاحة عالمياً للاستخدام الخارجي
window.ProcurementDashboard = {
  updateKPICards,
  renderSuppliers,
  renderInvoices,
  fetchDashboardStats,
  fetchInvoices,
  fetchPurchaseOrders,
  formatCurrency,
  formatDate
};
