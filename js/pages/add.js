// add-invoice.js - JavaScript لصفحة إضافة الفاتورة

// قائمة الموردين (يمكن استبدالها بـ API لاحقاً)
const suppliers = [
    'شركة الرياض للتجارة',
    'مؤسسة النور التجارية',
    'شركة السلام للتوريدات',
    'مؤسسة الأمانة',
    'شركة الخليج للمواد الغذائية',
    'مؤسسة البناء الحديث',
    'شركة التقنية المتقدمة',
    'مؤسسة الجودة العالية'
];

// تهيئة الصفحة عند التحميل
document.addEventListener('DOMContentLoaded', function() {
    initializeForm();
    setupEventListeners();
    setupDragAndDrop();
});

// تهيئة النموذج
function initializeForm() {
    // تعيين التاريخ الحالي
    const dateInput = document.getElementById('date');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }
    
    // تهيئة الإكمال التلقائي للموردين
    setupAutocomplete();
}

// إعداد مستمعي الأحداث
function setupEventListeners() {
    // حساب الإجمالي تلقائياً
    const amountBeforeTax = document.getElementById('amountBeforeTax');
    const taxAmount = document.getElementById('taxAmount');
    
    if (amountBeforeTax && taxAmount) {
        amountBeforeTax.addEventListener('input', calculateTotal);
        taxAmount.addEventListener('input', calculateTotal);
    }
    
    // معالجة رفع الملف
    const fileInput = document.getElementById('pdfFile');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
    
    // زر تحليل الفاتورة
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', analyzeInvoice);
    }
    
    // إرسال النموذج
    const form = document.getElementById('invoiceForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
}

// إعداد الإكمال التلقائي
function setupAutocomplete() {
    const supplierInput = document.getElementById('supplier');
    const suggestionsDiv = document.getElementById('supplierSuggestions');
    const warningDiv = document.getElementById('supplierWarning');
    
    if (!supplierInput || !suggestionsDiv) return;
    
    let currentFocus = -1;
    
    supplierInput.addEventListener('input', function() {
        const value = this.value.toLowerCase();
        suggestionsDiv.innerHTML = '';
        currentFocus = -1;
        
        if (!value) {
            suggestionsDiv.classList.remove('show');
            warningDiv.classList.remove('show');
            return;
        }
        
        const matches = suppliers.filter(supplier => 
            supplier.toLowerCase().includes(value)
        );
        
        if (matches.length > 0) {
            suggestionsDiv.classList.add('show');
            
            matches.forEach((supplier, index) => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                
                // تمييز النص المطابق
                const regex = new RegExp(`(${value})`, 'gi');
                const highlightedText = supplier.replace(regex, '<span class="autocomplete-match">$1</span>');
                
                div.innerHTML = `
                    <svg class="autocomplete-icon w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
                    </svg>
                    ${highlightedText}
                `;
                
                div.addEventListener('click', function() {
                    supplierInput.value = supplier;
                    suggestionsDiv.classList.remove('show');
                    warningDiv.classList.remove('show');
                    supplierInput.parentElement.classList.add('selected');
                });
                
                suggestionsDiv.appendChild(div);
            });
        } else {
            suggestionsDiv.classList.remove('show');
            // عرض تحذير إذا لم يكن المورد موجوداً
            if (value.length >= 3) {
                warningDiv.innerHTML = `
                    <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                    </svg>
                    هذا المورد غير موجود في النظام. سيتم إضافته كمورد جديد.
                `;
                warningDiv.classList.add('show');
            }
        }
    });
    
    // التنقل بالأسهم
    supplierInput.addEventListener('keydown', function(e) {
        const items = suggestionsDiv.getElementsByClassName('autocomplete-item');
        
        if (e.keyCode === 40) { // سهم لأسفل
            currentFocus++;
            addActive(items);
        } else if (e.keyCode === 38) { // سهم لأعلى
            currentFocus--;
            addActive(items);
        } else if (e.keyCode === 13) { // Enter
            e.preventDefault();
            if (currentFocus > -1 && items[currentFocus]) {
                items[currentFocus].click();
            }
        } else if (e.keyCode === 27) { // Escape
            suggestionsDiv.classList.remove('show');
        }
    });
    
    function addActive(items) {
        if (!items) return false;
        removeActive(items);
        
        if (currentFocus >= items.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = items.length - 1;
        
        items[currentFocus].classList.add('highlighted');
    }
    
    function removeActive(items) {
        for (let i = 0; i < items.length; i++) {
            items[i].classList.remove('highlighted');
        }
    }
    
    // إغلاق القائمة عند النقر خارجها
    document.addEventListener('click', function(e) {
        if (e.target !== supplierInput) {
            suggestionsDiv.classList.remove('show');
        }
    });
}

// حساب الإجمالي
function calculateTotal() {
    const amountBeforeTax = parseFloat(document.getElementById('amountBeforeTax').value) || 0;
    const taxAmount = parseFloat(document.getElementById('taxAmount').value) || 0;
    const totalAmount = document.getElementById('totalAmount');
    
    const total = amountBeforeTax + taxAmount;
    totalAmount.value = total.toFixed(2);
}

// إعداد السحب والإفلات
function setupDragAndDrop() {
    const fileContainer = document.getElementById('fileContainer');
    if (!fileContainer) return;
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        fileContainer.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        fileContainer.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        fileContainer.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight(e) {
        fileContainer.classList.add('drag-over');
        fileContainer.style.borderColor = 'rgba(100, 116, 139, 0.8)';
        fileContainer.style.background = 'rgba(100, 116, 139, 0.3)';
    }
    
    function unhighlight(e) {
        fileContainer.classList.remove('drag-over');
        fileContainer.style.borderColor = '';
        fileContainer.style.background = '';
    }
    
    fileContainer.addEventListener('drop', handleDrop, false);
}

// معالجة إسقاط الملف
function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length > 0) {
        const fileInput = document.getElementById('pdfFile');
        fileInput.files = files;
        handleFileSelect({ target: fileInput });
    }
}

// معالجة اختيار الملف
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // التحقق من نوع الملف
    const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
        showNotification('يرجى اختيار ملف PDF أو صورة فقط', 'error');
        event.target.value = '';
        return;
    }
    
    // التحقق من حجم الملف (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        showNotification('حجم الملف يجب أن يكون أقل من 10MB', 'error');
        event.target.value = '';
        return;
    }
    
    // عرض معلومات الملف
    const filePreview = document.getElementById('filePreview');
    const fileName = document.getElementById('fileName');
    
    if (filePreview && fileName) {
        fileName.textContent = file.name;
        filePreview.classList.remove('hidden');
    }
    
    // تحديث مظهر منطقة رفع الملف
    const fileContent = document.getElementById('fileContent');
    if (fileContent) {
        fileContent.innerHTML = `
            <div class="file-icon" style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
            </div>
            <h3 class="text-base font-semibold text-slate-200 mb-1">تم اختيار الملف</h3>
            <p class="text-sm text-slate-400">${file.name}</p>
            <p class="text-xs text-slate-500">${formatFileSize(file.size)}</p>
        `;
    }
}

// إزالة الملف
function removeFile() {
    const fileInput = document.getElementById('pdfFile');
    const filePreview = document.getElementById('filePreview');
    const fileContent = document.getElementById('fileContent');
    
    if (fileInput) {
        fileInput.value = '';
    }
    
    if (filePreview) {
        filePreview.classList.add('hidden');
    }
    
    if (fileContent) {
        fileContent.innerHTML = `
            <div class="file-icon">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                </svg>
            </div>
            <h3 class="text-base font-semibold text-slate-200 mb-1">اختر ملف PDF أو صورة</h3>
            <p class="text-sm text-slate-400 mb-1">اسحب الملف هنا أو انقر للاختيار</p>
            <p class="text-xs text-slate-500">يدعم PDF, JPG, PNG, JPEG • الحد الأقصى 10MB</p>
        `;
    }
}

// تحليل الفاتورة (محاكاة)
async function analyzeInvoice() {
    const fileInput = document.getElementById('pdfFile');
    if (!fileInput.files[0]) {
        showNotification('يرجى اختيار ملف الفاتورة أولاً', 'warning');
        return;
    }
    
    const analyzeBtn = document.getElementById('analyzeBtn');
    const analyzeText = document.getElementById('analyzeText');
    
    // عرض حالة التحميل
    analyzeBtn.classList.add('loading');
    analyzeBtn.disabled = true;
    analyzeText.innerHTML = '<div class="loading-squares"><span></span><span></span><span></span></div> جاري التحليل...';
    
    // محاكاة تحليل الفاتورة
    setTimeout(() => {
        // ملء الحقول بقيم تجريبية
        document.getElementById('invoiceNumber').value = 'INV-2024-' + Math.floor(Math.random() * 10000);
        document.getElementById('amountBeforeTax').value = (Math.random() * 5000 + 1000).toFixed(2);
        document.getElementById('taxAmount').value = (parseFloat(document.getElementById('amountBeforeTax').value) * 0.15).toFixed(2);
        calculateTotal();
        
        // إزالة حالة التحميل
        analyzeBtn.classList.remove('loading');
        analyzeBtn.disabled = false;
        analyzeText.textContent = 'تم التحليل بنجاح';
        
        // إعادة النص الأصلي بعد ثانيتين
        setTimeout(() => {
            analyzeText.textContent = 'تحليل الفاتورة';
        }, 2000);
        
        showNotification('تم تحليل الفاتورة بنجاح!', 'success');
    }, 2000);
}

// معالجة إرسال النموذج
async function handleFormSubmit(event) {
    event.preventDefault();
    
    // جمع البيانات
    const formData = new FormData(event.target);
    const invoiceData = {
        supplier: formData.get('supplier'),
        type: document.getElementById('type').value,
        category: formData.get('category'),
        invoiceNumber: formData.get('invoiceNumber'),
        date: formData.get('date'),
        amountBeforeTax: parseFloat(formData.get('amountBeforeTax')),
        taxAmount: parseFloat(formData.get('taxAmount')),
        totalAmount: parseFloat(document.getElementById('totalAmount').value),
        notes: formData.get('notes'),
        hasFile: document.getElementById('pdfFile').files.length > 0
    };
    
    // التحقق من صحة البيانات
    if (!validateForm(invoiceData)) {
        return;
    }
    
    // عرض حالة التحميل
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.classList.add('loading');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<div class="loading-progress"></div> جاري الحفظ...';
    
    // محاكاة حفظ البيانات
    setTimeout(() => {
        // حفظ في localStorage (محاكاة)
        const invoices = JSON.parse(localStorage.getItem('invoices') || '[]');
        invoiceData.id = Date.now();
        invoices.push(invoiceData);
        localStorage.setItem('invoices', JSON.stringify(invoices));
        
        // إزالة حالة التحميل
        saveBtn.classList.remove('loading');
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<svg class="w-6 h-6 btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg><span class="btn-text">حفظ الفاتورة</span>';
        
        // عرض نافذة النجاح
        document.getElementById('successModal').classList.add('show');
    }, 1500);
}

// التحقق من صحة النموذج
function validateForm(data) {
    const errors = [];
    
    if (!data.supplier.trim()) {
        errors.push('اسم المورد مطلوب');
    }
    
    if (!data.type) {
        errors.push('نوع الفاتورة مطلوب');
    }
    
    if (!data.invoiceNumber.trim()) {
        errors.push('رقم الفاتورة مطلوب');
    }
    
    if (!data.date) {
        errors.push('التاريخ مطلوب');
    }
    
    if (data.amountBeforeTax <= 0) {
        errors.push('المبلغ بدون ضريبة يجب أن يكون أكبر من صفر');
    }
    
    if (data.taxAmount < 0) {
        errors.push('مبلغ الضريبة لا يمكن أن يكون سالباً');
    }
    
    if (!data.hasFile) {
        errors.push('يرجى إرفاق ملف الفاتورة');
    }
    
    if (errors.length > 0) {
        showNotification(errors.join('<br>'), 'error');
        return false;
    }
    
    return true;
}

// إغلاق نافذة النجاح
function closeSuccessModal() {
    document.getElementById('successModal').classList.remove('show');
    // إعادة تعيين النموذج
    document.getElementById('invoiceForm').reset();
    removeFile();
    // تعيين التاريخ الحالي مرة أخرى
    document.getElementById('date').value = new Date().toISOString().split('T')[0];
}

// تنسيق حجم الملف
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// عرض الإشعارات
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = message;
    
    document.body.appendChild(notification);
    
    // إزالة الإشعار بعد 5 ثواني
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// جعل الوظائف متاحة عالمياً
window.removeFile = removeFile;
window.closeSuccessModal = closeSuccessModal;
