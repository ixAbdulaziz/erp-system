// ملف add.js - إضافة أوامر شراء جديدة

// متغيرات عامة
let orderItems = [];
let itemCounter = 0;

// تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
    initializeAddOrderPage();
    setupEventListeners();
});

// تهيئة صفحة إضافة الطلب
function initializeAddOrderPage() {
    console.log('تم تحميل صفحة إضافة طلب شراء جديد');
    
    // تعيين التاريخ الحالي
    const dateInput = document.getElementById('order_date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
    
    // إضافة أول عنصر افتراضي
    addNewItem();
}

// إعداد مستمعي الأحداث
function setupEventListeners() {
    // نموذج الطلب الرئيسي
    const orderForm = document.getElementById('purchase-order-form');
    if (orderForm) {
        orderForm.addEventListener('submit', handleOrderSubmit);
    }
    
    // زر إضافة عنصر جديد
    const addItemBtn = document.getElementById('add-item-btn');
    if (addItemBtn) {
        addItemBtn.addEventListener('click', addNewItem);
    }
    
    // زر حفظ وإضافة آخر
    const saveAndAddBtn = document.getElementById('save-and-add-btn');
    if (saveAndAddBtn) {
        saveAndAddBtn.addEventListener('click', function(e) {
            e.preventDefault();
            handleOrderSubmit(e, true);
        });
    }
    
    // زر إعادة تعيين النموذج
    const resetBtn = document.getElementById('reset-form-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetForm);
    }
}

// معالجة إرسال نموذج الطلب
async function handleOrderSubmit(event, saveAndContinue = false) {
    event.preventDefault();
    
    try {
        // جمع بيانات النموذج
        const formData = collectFormData();
        
        // التحقق من صحة البيانات
        if (!validateOrderData(formData)) {
            return;
        }
        
        // إظهار مؤشر التحميل
        showSubmitLoading(true);
        
        // إرسال البيانات إلى الخادم
        const response = await fetch('/api/purchase-orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // إظهار رسالة نجاح
        showSuccessMessage('تم إضافة طلب الشراء بنجاح!');
        
        if (saveAndContinue) {
            // إعادة تعيين النموذج للطلب التالي
            resetForm();
        } else {
            // الانتقال إلى صفحة العرض أو القائمة
            setTimeout(() => {
                window.location.href = '/view';
            }, 2000);
        }
        
    } catch (error) {
        console.error('خطأ في إضافة طلب الشراء:', error);
        showErrorMessage('فشل في إضافة طلب الشراء. حاول مرة أخرى.');
    } finally {
        showSubmitLoading(false);
    }
}

// جمع بيانات النموذج
function collectFormData() {
    const form = document.getElementById('purchase-order-form');
    const formData = new FormData(form);
    
    const orderData = {
        supplier_name: formData.get('supplier_name'),
        order_date: formData.get('order_date'),
        status: formData.get('status') || 'pending',
        notes: formData.get('notes'),
        items: collectItemsData()
    };
    
    return orderData;
}

// جمع بيانات العناصر
function collectItemsData() {
    const items = [];
    const itemRows = document.querySelectorAll('.item-row');
    
    itemRows.forEach(row => {
        const itemName = row.querySelector('[name="item_name"]')?.value;
        const quantity = parseFloat(row.querySelector('[name="quantity"]')?.value) || 0;
        const unitPrice = parseFloat(row.querySelector('[name="unit_price"]')?.value) || 0;
        const description = row.querySelector('[name="description"]')?.value;
        
        if (itemName && quantity > 0 && unitPrice > 0) {
            items.push({
                item_name: itemName,
                quantity: quantity,
                unit_price: unitPrice,
                description: description
            });
        }
    });
    
    return items;
}

// التحقق من صحة البيانات
function validateOrderData(data) {
    const errors = [];
    
    if (!data.supplier_name?.trim()) {
        errors.push('اسم المورد مطلوب');
    }
    
    if (!data.order_date) {
        errors.push('تاريخ الطلب مطلوب');
    }
    
    if (!data.items || data.items.length === 0) {
        errors.push('يجب إضافة عنصر واحد على الأقل');
    }
    
    // التحقق من صحة العناصر
    data.items.forEach((item, index) => {
        if (!item.item_name?.trim()) {
            errors.push(`اسم العنصر رقم ${index + 1} مطلوب`);
        }
        if (item.quantity <= 0) {
            errors.push(`كمية العنصر رقم ${index + 1} يجب أن تكون أكبر من صفر`);
        }
        if (item.unit_price <= 0) {
            errors.push(`سعر العنصر رقم ${index + 1} يجب أن يكون أكبر من صفر`);
        }
    });
    
    if (errors.length > 0) {
        showValidationErrors(errors);
        return false;
    }
    
    return true;
}

// إضافة عنصر جديد
function addNewItem() {
    itemCounter++;
    const itemsContainer = document.getElementById('items-container');
    if (!itemsContainer) return;
    
    const itemHTML = `
        <div class="item-row card mb-3" data-item-id="${itemCounter}">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h6 class="card-title mb-0">العنصر رقم ${itemCounter}</h6>
                    <button type="button" class="btn btn-danger btn-sm" onclick="removeItem(${itemCounter})">
                        <i class="fas fa-trash"></i> حذف
                    </button>
                </div>
                
                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label class="form-label">اسم الصنف <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" name="item_name" required>
                    </div>
                    
                    <div class="col-md-3 mb-3">
                        <label class="form-label">الكمية <span class="text-danger">*</span></label>
                        <input type="number" class="form-control" name="quantity" min="0" step="0.01" required onchange="calculateTotal(${itemCounter})">
                    </div>
                    
                    <div class="col-md-3 mb-3">
                        <label class="form-label">سعر الوحدة <span class="text-danger">*</span></label>
                        <input type="number" class="form-control" name="unit_price" min="0" step="0.01" required onchange="calculateTotal(${itemCounter})">
                    </div>
                </div>
                
                <div class="row">
                    <div class="col-md-9 mb-3">
                        <label class="form-label">وصف الصنف</label>
                        <textarea class="form-control" name="description" rows="2" placeholder="وصف اختياري للصنف"></textarea>
                    </div>
                    
                    <div class="col-md-3 mb-3">
                        <label class="form-label">الإجمالي</label>
                        <input type="text" class="form-control total-price" id="total-${itemCounter}" readonly>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    itemsContainer.insertAdjacentHTML('beforeend', itemHTML);
    updateOrderTotal();
}

// حذف عنصر
function removeItem(itemId) {
    const itemRow = document.querySelector(`[data-item-id="${itemId}"]`);
    if (itemRow) {
        itemRow.remove();
        updateOrderTotal();
        
        // إعادة ترقيم العناصر
        renumberItems();
    }
}

// إعادة ترقيم العناصر
function renumberItems() {
    const itemRows = document.querySelectorAll('.item-row');
    itemRows.forEach((row, index) => {
        const title = row.querySelector('.card-title');
        if (title) {
            title.textContent = `العنصر رقم ${index + 1}`;
        }
    });
}

// حساب إجمالي العنصر
function calculateTotal(itemId) {
    const itemRow = document.querySelector(`[data-item-id="${itemId}"]`);
    if (!itemRow) return;
    
    const quantity = parseFloat(itemRow.querySelector('[name="quantity"]').value) || 0;
    const unitPrice = parseFloat(itemRow.querySelector('[name="unit_price"]').value) || 0;
    const total = quantity * unitPrice;
    
    const totalInput = document.getElementById(`total-${itemId}`);
    if (totalInput) {
        totalInput.value = formatCurrency(total);
    }
    
    updateOrderTotal();
}

// تحديث إجمالي الطلب
function updateOrderTotal() {
    let grandTotal = 0;
    const itemRows = document.querySelectorAll('.item-row');
    
    itemRows.forEach(row => {
        const quantity = parseFloat(row.querySelector('[name="quantity"]').value) || 0;
        const unitPrice = parseFloat(row.querySelector('[name="unit_price"]').value) || 0;
        grandTotal += quantity * unitPrice;
    });
    
    const grandTotalElement = document.getElementById('grand-total');
    if (grandTotalElement) {
        grandTotalElement.textContent = formatCurrency(grandTotal);
    }
    
    const itemsCountElement = document.getElementById('items-count');
    if (itemsCountElement) {
        itemsCountElement.textContent = itemRows.length;
    }
}

// إعادة تعيين النموذج
function resetForm() {
    const form = document.getElementById('purchase-order-form');
    if (form) {
        form.reset();
    }
    
    // مسح جميع العناصر
    const itemsContainer = document.getElementById('items-container');
    if (itemsContainer) {
        itemsContainer.innerHTML = '';
    }
    
    // إعادة تعيين العداد
    itemCounter = 0;
    
    // إضافة عنصر جديد
    addNewItem();
    
    // تعيين التاريخ الحالي
    const dateInput = document.getElementById('order_date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
    
    updateOrderTotal();
}

// الوظائف المساعدة

// تنسيق العملة
function formatCurrency(amount) {
    return new Intl.NumberFormat('ar-SA', {
        style: 'currency',
        currency: 'SAR',
        minimumFractionDigits: 2
    }).format(amount);
}

// إظهار مؤشر التحميل للإرسال
function showSubmitLoading(show) {
    const submitBtn = document.getElementById('submit-btn');
    const saveAndAddBtn = document.getElementById('save-and-add-btn');
    
    if (show) {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        }
        if (saveAndAddBtn) {
            saveAndAddBtn.disabled = true;
        }
    } else {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> حفظ الطلب';
        }
        if (saveAndAddBtn) {
            saveAndAddBtn.disabled = false;
        }
    }
}

// إظهار رسالة نجاح
function showSuccessMessage(message) {
    showToast(message, 'success');
}

// إظهار رسالة خطأ
function showErrorMessage(message) {
    showToast(message, 'error');
}

// إظهار أخطاء التحقق
function showValidationErrors(errors) {
    const errorMessage = 'يرجى تصحيح الأخطاء التالية:\n' + errors.map(error => '• ' + error).join('\n');
    showToast(errorMessage, 'error');
}

// إظهار إشعار
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `alert alert-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'} position-fixed`;
    toast.style.top = '20px';
    toast.style.right = '20px';
    toast.style.zIndex = '9999';
    toast.style.maxWidth = '400px';
    toast.innerHTML = `
        <button type="button" class="btn-close" onclick="this.parentElement.remove()"></button>
        ${message.replace(/\n/g, '<br>')}
    `;
    
    document.body.appendChild(toast);
    
    // إزالة الإشعار بعد 5 ثواني
    setTimeout(() => {
        if (document.body.contains(toast)) {
            document.body.removeChild(toast);
        }
    }, 5000);
}

// جعل الوظائف متاحة عالمياً
window.addNewItem = addNewItem;
window.removeItem = removeItem;
window.calculateTotal = calculateTotal;
