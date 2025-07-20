document.addEventListener('DOMContentLoaded', () => {
  try {
    // Global Variables - No localStorage
    let invoices = [];
    let payments = [];
    let currentSupplier = '';
    let currentEditingInvoice = null;
    let currentDeletingInvoice = null;
    let currentEditingPayment = null;
    let currentDeletingPayment = null;
    let filteredSuppliers = {};
    let filteredInvoices = [];
    let currentSort = { column: null, direction: 'asc' };
    let pinnedSuppliers = [];
    
    // Store for file data - keeps file data in memory to avoid long HTML attributes
    let fileDataStore = {};

    // DOM Elements
    const elements = {
      supplierList: document.getElementById('supplier-list'),
      suppliersContainer: document.getElementById('suppliers-container'),
      invoicesSection: document.getElementById('supplier-invoices'),
      supplierTitle: document.getElementById('supplier-title'),
      invoicesTableBody: document.querySelector('#invoices-table tbody'),
      totalAllEl: document.getElementById('total-all'),
      exportBtn: document.getElementById('export-btn'),
      backBtn: document.getElementById('back-btn'),
      editSupplierBtn: document.getElementById('edit-supplier-btn'),
      editModal: document.getElementById('edit-modal'),
      newSupplierName: document.getElementById('new-supplier-name'),
      saveSupplierBtn: document.getElementById('save-supplier-btn'),
      cancelEditBtn: document.getElementById('cancel-edit-btn'),
      // Search Elements
      supplierSearch: document.getElementById('supplier-search'),
      invoiceSearch: document.getElementById('invoice-search'),
      // Invoice Edit Elements
      editInvoiceModal: document.getElementById('edit-invoice-modal'),
      editInvoiceNumber: document.getElementById('edit-invoice-number'),
      editInvoiceDate: document.getElementById('edit-invoice-date'),
      editInvoiceType: document.getElementById('edit-invoice-type'),
      editInvoiceCategory: document.getElementById('edit-invoice-category'),
      editAmountBeforeTax: document.getElementById('edit-amount-before-tax'),
      editTaxAmount: document.getElementById('edit-tax-amount'),
      editSupplier: document.getElementById('edit-supplier'),
      editNotes: document.getElementById('edit-notes'),
      updateInvoiceBtn: document.getElementById('update-invoice-btn'),
      cancelEditInvoiceBtn: document.getElementById('cancel-edit-invoice-btn'),
      // Delete Elements
      deleteModal: document.getElementById('delete-modal'),
      invoiceDetails: document.getElementById('invoice-details'),
      confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
      cancelDeleteBtn: document.getElementById('cancel-delete-btn'),
      // Payment Elements
      addPaymentBtn: document.getElementById('add-payment-btn'),
      addPaymentModal: document.getElementById('add-payment-modal'),
      paymentAmount: document.getElementById('payment-amount'),
      paymentDate: document.getElementById('payment-date'),
      paymentNotes: document.getElementById('payment-notes'),
      savePaymentBtn: document.getElementById('save-payment-btn'),
      cancelPaymentBtn: document.getElementById('cancel-payment-btn'),
      paymentsTableBody: document.getElementById('payments-table-body'),
      // Edit Payment Elements
      editPaymentModal: document.getElementById('edit-payment-modal'),
      editPaymentAmount: document.getElementById('edit-payment-amount'),
      editPaymentDate: document.getElementById('edit-payment-date'),
      editPaymentNotes: document.getElementById('edit-payment-notes'),
      updatePaymentBtn: document.getElementById('update-payment-btn'),
      cancelEditPaymentBtn: document.getElementById('cancel-edit-payment-btn'),
      // Delete Payment Elements
      deletePaymentModal: document.getElementById('delete-payment-modal'),
      paymentDetails: document.getElementById('payment-details'),
      confirmDeletePaymentBtn: document.getElementById('confirm-delete-payment-btn'),
      cancelDeletePaymentBtn: document.getElementById('cancel-delete-payment-btn'),
      // Payment Stats Elements
      supplierInvoicesTotal: document.getElementById('supplier-invoices-total'),
      supplierPaymentsTotal: document.getElementById('supplier-payments-total'),
      supplierOutstandingTotal: document.getElementById('supplier-outstanding-total'),
      // File Viewer Elements
      fileViewerModal: document.getElementById('file-viewer-modal'),
      fileViewerTitle: document.getElementById('file-viewer-title'),
      fileViewerBody: document.getElementById('file-viewer-body'),
      fileViewerClose: document.getElementById('file-viewer-close')
    };

    // File Viewer Functions
    function openFileViewer(invoiceId, fileName) {
      const invoice = invoices.find(inv => 
        (inv.id || `${inv.invoiceNumber}-${inv.date}-${inv.supplier}`) === invoiceId
      );
      
      if (!invoice || !invoice.fileData) {
        showFileError('الملف غير متوفر أو تالف');
        return;
      }

      elements.fileViewerTitle.textContent = fileName || 'عرض الملف';
      elements.fileViewerModal.classList.add('show');
      
      try {
        const fileType = invoice.fileType || '';
        const fileData = invoice.fileData;
        
        if (fileType.includes('pdf')) {
          // عرض PDF
          elements.fileViewerBody.innerHTML = `
            <iframe 
              src="${fileData}" 
              class="file-viewer-iframe"
              title="PDF Viewer"
            ></iframe>
          `;
        } else if (fileType.includes('image') || fileType.includes('jpeg') || fileType.includes('jpg') || fileType.includes('png')) {
          // عرض الصورة
          elements.fileViewerBody.innerHTML = `
            <img 
              src="${fileData}" 
              class="file-viewer-image" 
              alt="${fileName || 'صورة الفاتورة'}"
              onload="console.log('تم تحميل الصورة بنجاح')"
              onerror="console.error('خطأ في تحميل الصورة'); showFileError('خطأ في تحميل الصورة')"
            />
          `;
        } else {
          // نوع ملف غير مدعوم
          showFileError('نوع الملف غير مدعوم للعرض المباشر');
        }
      } catch (error) {
        console.error('خطأ في عرض الملف:', error);
        showFileError('حدث خطأ في عرض الملف');
      }
    }

    function showFileError(message) {
      elements.fileViewerBody.innerHTML = `
        <div class="file-viewer-error">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
          </svg>
          <h4 class="text-lg font-semibold mb-2">لا يمكن عرض الملف</h4>
          <p class="text-slate-400">${message}</p>
        </div>
      `;
    }

    function closeFileViewer() {
      elements.fileViewerModal.classList.remove('show');
      elements.fileViewerBody.innerHTML = '';
    }

    // إغلاق File Viewer
    elements.fileViewerClose.addEventListener('click', closeFileViewer);
    elements.fileViewerModal.addEventListener('click', (e) => {
      if (e.target === elements.fileViewerModal) {
        closeFileViewer();
      }
    });

    // Payment Management Functions
    function calculateSupplierStats(supplierName) {
      const supplierInvoices = invoices.filter(inv => inv.supplier === supplierName);
      const supplierPayments = payments.filter(pay => pay.supplier === supplierName);
      
      const totalInvoices = supplierInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
      const totalPayments = supplierPayments.reduce((sum, pay) => sum + (pay.amount || 0), 0);
      const outstanding = totalInvoices - totalPayments;
      
      return {
        totalInvoices,
        totalPayments,
        outstanding: Math.max(0, outstanding)
      };
    }

    function updatePaymentStats() {
      if (!currentSupplier) return;
      
      const stats = calculateSupplierStats(currentSupplier);
      
      elements.supplierInvoicesTotal.textContent = formatCurrency(stats.totalInvoices);
      elements.supplierPaymentsTotal.textContent = formatCurrency(stats.totalPayments);
      elements.supplierOutstandingTotal.textContent = formatCurrency(stats.outstanding);
    }

    function renderPaymentsTable() {
      if (!currentSupplier) return;
      
      const supplierPayments = payments.filter(pay => pay.supplier === currentSupplier);
      elements.paymentsTableBody.innerHTML = '';
      
      if (supplierPayments.length === 0) {
        elements.paymentsTableBody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-12 text-slate-400">
              <div class="flex flex-col items-center gap-4">
                <svg class="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
                </svg>
                <div>
                  <p class="font-semibold mb-1">لا توجد مدفوعات مسجلة</p>
                  <p class="text-sm">اضغط على "إضافة دفعة جديدة" لتسجيل أول دفعة</p>
                </div>
              </div>
            </td>
          </tr>
        `;
        return;
      }
      
      // Sort payments by date (newest first)
      supplierPayments.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      supplierPayments.forEach((payment, index) => {
        const row = document.createElement('tr');
        row.className = 'fade-up';
        row.style.animationDelay = `${index * 0.05}s`;
        
        row.innerHTML = `
          <td class="font-semibold text-white">${payment.date}</td>
          <td class="font-bold text-green-300">${formatCurrency(payment.amount)}</td>
          <td class="text-slate-300">${payment.notes || 'لا توجد ملاحظات'}</td>
          <td>
            <div class="flex gap-1 justify-center">
              <button class="action-btn edit" onclick="editPayment('${payment.id}')" title="تعديل">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
              </button>
              <button class="action-btn delete" onclick="deletePayment('${payment.id}')" title="حذف">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
              </button>
            </div>
          </td>
        `;
        
        elements.paymentsTableBody.appendChild(row);
      });
    }

    function addPayment() {
      // Set today's date as default
      elements.paymentDate.value = new Date().toISOString().split('T')[0];
      elements.paymentAmount.value = '';
      elements.paymentNotes.value = '';
      elements.addPaymentModal.classList.add('show');
      setTimeout(() => elements.paymentAmount.focus(), 100);
    }

    function savePayment() {
      const amount = parseFloat(elements.paymentAmount.value);
      const date = elements.paymentDate.value;
      const notes = elements.paymentNotes.value.trim();
      
      if (!amount || amount <= 0 || !date) {
        alert('يرجى إدخال مبلغ صحيح وتاريخ صحيح');
        return;
      }
      
      const newPayment = {
        id: 'pay' + Date.now(),
        supplier: currentSupplier,
        amount: amount,
        date: date,
        notes: notes,
        createdAt: new Date().toISOString()
      };
      
      payments.push(newPayment);
      
      elements.addPaymentModal.classList.remove('show');
      renderPaymentsTable();
      updatePaymentStats();
      
      // Show success feedback
      const originalText = elements.savePaymentBtn.innerHTML;
      elements.savePaymentBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        تم الحفظ
      `;
      setTimeout(() => {
        elements.savePaymentBtn.innerHTML = originalText;
      }, 2000);
    }

    // Global payment functions
    window.editPayment = function(paymentId) {
      const payment = payments.find(pay => pay.id === paymentId);
      if (!payment) return;
      
      currentEditingPayment = payment;
      
      elements.editPaymentAmount.value = payment.amount;
      elements.editPaymentDate.value = payment.date;
      elements.editPaymentNotes.value = payment.notes || '';
      
      elements.editPaymentModal.classList.add('show');
    };

    function updatePayment() {
      if (!currentEditingPayment) return;
      
      const amount = parseFloat(elements.editPaymentAmount.value);
      const date = elements.editPaymentDate.value;
      const notes = elements.editPaymentNotes.value.trim();
      
      if (!amount || amount <= 0 || !date) {
        alert('يرجى إدخال مبلغ صحيح وتاريخ صحيح');
        return;
      }
      
      const index = payments.findIndex(pay => pay.id === currentEditingPayment.id);
      if (index !== -1) {
        payments[index] = {
          ...currentEditingPayment,
          amount: amount,
          date: date,
          notes: notes,
          updatedAt: new Date().toISOString()
        };
        
        elements.editPaymentModal.classList.remove('show');
        renderPaymentsTable();
        updatePaymentStats();
        
        // Show success feedback
        const originalText = elements.updatePaymentBtn.innerHTML;
        elements.updatePaymentBtn.innerHTML = `
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
          تم التحديث
        `;
        setTimeout(() => {
          elements.updatePaymentBtn.innerHTML = originalText;
        }, 2000);
      }
    }

    window.deletePayment = function(paymentId) {
      const payment = payments.find(pay => pay.id === paymentId);
      if (!payment) return;
      
      currentDeletingPayment = payment;
      
      elements.paymentDetails.innerHTML = `
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-slate-400">تاريخ الدفعة:</span>
            <span class="text-slate-200">${payment.date}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">المبلغ:</span>
            <span class="text-slate-200 font-bold">${formatCurrency(payment.amount)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">المورد:</span>
            <span class="text-slate-200">${payment.supplier}</span>
          </div>
          ${payment.notes ? `
            <div class="flex justify-between">
              <span class="text-slate-400">الملاحظات:</span>
              <span class="text-slate-200">${payment.notes}</span>
            </div>
          ` : ''}
        </div>
      `;
      
      elements.deletePaymentModal.classList.add('show');
    };

    function confirmDeletePayment() {
      if (!currentDeletingPayment) return;
      
      payments = payments.filter(pay => pay.id !== currentDeletingPayment.id);
      
      elements.deletePaymentModal.classList.remove('show');
      renderPaymentsTable();
      updatePaymentStats();
      currentDeletingPayment = null;
    }

    // Formatting utility
    function formatCurrency(amount) {
      return new Intl.NumberFormat('en-US').format(amount || 0) + ' ر.س';
    }
    
    // Sorting functionality
    function sortInvoices(column, direction) {
      filteredInvoices.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];
        
        // Handle different data types
        if (column === 'date') {
          aVal = new Date(aVal);
          bVal = new Date(bVal);
        } else if (column === 'amountBeforeTax' || column === 'taxAmount' || column === 'totalAmount') {
          aVal = parseFloat(aVal);
          bVal = parseFloat(bVal);
        } else if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }
        
        if (direction === 'asc') {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        } else {
          return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
        }
      });
      
      renderFilteredInvoices();
    }
    
    // Handle sort header clicks
    function handleSortClick(e) {
      const header = e.currentTarget;
      const column = header.dataset.column;
      
      // Remove existing sort classes from all headers
      document.querySelectorAll('.sortable-header').forEach(h => {
        h.classList.remove('sort-asc', 'sort-desc');
      });
      
      // Determine sort direction
      let direction = 'asc';
      if (currentSort.column === column && currentSort.direction === 'asc') {
        direction = 'desc';
      }
      
      // Update current sort state
      currentSort = { column, direction };
      
      // Add sort class to current header
      header.classList.add(direction === 'asc' ? 'sort-asc' : 'sort-desc');
      
      // Perform sort
      sortInvoices(column, direction);
    }
    
    // Add event listeners to sortable headers
    function initializeSortHandlers() {
      document.querySelectorAll('.sortable-header').forEach(header => {
        header.addEventListener('click', handleSortClick);
      });
    }
    
    // Pin/Unpin supplier functions
    function isSupplierPinned(supplierName) {
      return pinnedSuppliers.includes(supplierName);
    }
    
    // Filter suppliers by name
    function filterSuppliers(searchTerm) {
      const bySupplier = invoices.reduce((acc, inv) => { 
        acc[inv.supplier] = acc[inv.supplier] || []; 
        acc[inv.supplier].push(inv); 
        return acc; 
      }, {});
      
      if (!searchTerm.trim()) {
        filteredSuppliers = bySupplier;
      } else {
        filteredSuppliers = {};
        Object.keys(bySupplier).forEach(supplier => {
          if (supplier.toLowerCase().includes(searchTerm.toLowerCase())) {
            filteredSuppliers[supplier] = bySupplier[supplier];
          }
        });
      }
      
      renderFilteredSuppliers();
    }
    
    // Filter invoices by invoice number
    function filterInvoices(searchTerm) {
      const supplierInvoices = invoices.filter(inv => inv.supplier === currentSupplier);
      
      if (!searchTerm.trim()) {
        filteredInvoices = supplierInvoices;
      } else {
        filteredInvoices = supplierInvoices.filter(inv => 
          inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      
      // Apply current sort if any
      if (currentSort.column) {
        sortInvoices(currentSort.column, currentSort.direction);
      } else {
        renderFilteredInvoices();
      }
    }
    
    // Create file download link
    function createFileLink(invoice) {
      const invoiceId = invoice.id || `${invoice.invoiceNumber}-${invoice.date}-${invoice.supplier}`;
      
      // Handle both new fileData format and old fileURL format
      if (invoice.fileData && invoice.fileData.startsWith('data:')) {
        // Store file data in memory to avoid long HTML attributes
        fileDataStore[invoiceId] = {
          data: invoice.fileData,
          type: invoice.fileType || 'application/pdf',
          name: invoice.fileName || `${invoice.invoiceNumber}.pdf`,
          size: invoice.fileSize
        };
        
        const fileSize = invoice.fileSize ? `(${(invoice.fileSize / 1024 / 1024).toFixed(2)} MB)` : '';
        const fileType = invoice.fileType?.includes('pdf') ? 'PDF' : 'صورة';
        
        return `
          <div class="pdf-actions">
            <button class="pdf-btn view file-info" 
                    data-info="${invoice.fileName || 'ملف'} - ${fileType} ${fileSize}"
                    onclick="viewFile('${invoiceId}', '${invoice.fileName || 'ملف'}')"
                    title="عرض الملف">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
              </svg>
            </button>
            <button class="pdf-btn download" 
                    onclick="downloadFile('${invoiceId}')"
                    title="تحميل الملف">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
            </button>
          </div>
        `;
      } else if (invoice.fileURL) {
        // Legacy support for old fileURL format
        return `
          <div class="pdf-actions">
            <button class="pdf-btn view file-info" 
                    data-info="${invoice.fileName || 'ملف قديم'}"
                    onclick="viewLegacyFile('${invoice.fileURL}')"
                    title="عرض الملف">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
              </svg>
            </button>
            <span class="text-xs text-slate-500">ملف قديم</span>
          </div>
        `;
      } else {
        return `
          <div class="pdf-actions">
            <span class="text-xs text-slate-500">لا يوجد ملف</span>
          </div>
        `;
      }
    }
    
    // View file function
    window.viewFile = function(invoiceId, fileName) {
      console.log('🔍 محاولة عرض الملف:', { invoiceId, fileName });
      
      // Try to get file from store first
      const fileInfo = fileDataStore[invoiceId];
      if (fileInfo) {
        console.log('✅ تم العثور على الملف في المخزن:', fileInfo.name);
        openFileViewer(invoiceId, fileName || fileInfo.name);
        return;
      }
      
      // Fallback: get from invoice data directly
      const invoice = invoices.find(inv => 
        (inv.id || `${inv.invoiceNumber}-${inv.date}-${inv.supplier}`) === invoiceId
      );
      
      if (invoice && invoice.fileData) {
        console.log('✅ تم العثور على الملف في الفاتورة مباشرة');
        openFileViewer(invoiceId, fileName || invoice.fileName || 'ملف');
      } else {
        console.error('❌ لم يتم العثور على الملف');
        alert('عذراً، لا يمكن العثور على الملف المطلوب');
      }
    };
    
    // Download file function
    window.downloadFile = function(invoiceId) {
      console.log('⬇️ محاولة تحميل الملف:', invoiceId);
      
      // Try to get file from store first
      let fileInfo = fileDataStore[invoiceId];
      let fileData, fileName, fileType;
      
      if (fileInfo) {
        fileData = fileInfo.data;
        fileName = fileInfo.name;
        fileType = fileInfo.type;
      } else {
        // Fallback: get from invoice data directly
        const invoice = invoices.find(inv => 
          (inv.id || `${inv.invoiceNumber}-${inv.date}-${inv.supplier}`) === invoiceId
        );
        
        if (invoice && invoice.fileData) {
          fileData = invoice.fileData;
          fileName = invoice.fileName || `invoice_${invoiceId}.pdf`;
          fileType = invoice.fileType || 'application/pdf';
        } else {
          console.error('❌ لم يتم العثور على الملف للتحميل');
          alert('عذراً، لا يمكن العثور على الملف للتحميل');
          return;
        }
      }
      
      if (!fileData) {
        alert('عذراً، بيانات الملف غير متوفرة');
        return;
      }
      
      try {
        // Create download link
        const link = document.createElement('a');
        link.href = fileData;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('✅ تم بدء تحميل الملف:', fileName);
      } catch (error) {
        console.error('❌ خطأ في تحميل الملف:', error);
        alert('حدث خطأ أثناء تحميل الملف');
      }
    };
    
    // Legacy file view function
    window.viewLegacyFile = function(fileURL) {
      if (!fileURL) return;
      
      try {
        const link = document.createElement('a');
        link.href = fileURL;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.click();
      } catch (error) {
        console.error('Cannot open legacy file:', error);
        alert('لا يمكن فتح الملف القديم. قد يكون الملف غير متاح بعد الآن.');
      }
    };
    
    // Format notes for display
    function formatNotes(notes) {
      if (!notes || notes.trim() === '') {
        return '<span class="notes-cell empty">لا توجد ملاحظات</span>';
      }
      
      const truncated = notes.length > 30 ? notes.substring(0, 30) + '...' : notes;
      
      return `
        <div class="notes-cell" title="${notes}" style="color: #ffffff; text-align: right; direction: rtl;">
          ${truncated}
          ${notes.length > 30 ? `<div class="notes-tooltip">${notes}</div>` : ''}
        </div>
      `;
    }
    
    // Render filtered suppliers
    function renderFilteredSuppliers() {
      elements.suppliersContainer.innerHTML = '';
      
      const suppliers = Object.keys(filteredSuppliers);
      
      // إذا لم توجد موردين، اعرض رسالة ترحيبية
      if (suppliers.length === 0) {
        const searchTerm = elements.supplierSearch.value.trim();
        elements.suppliersContainer.innerHTML = `
          <div class="glass-card text-center py-16">
            <div class="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-r from-slate-500 to-slate-400 flex items-center justify-center">
              <svg class="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                ${invoices.length === 0 ? 
                  '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>' :
                  '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>'
                }
              </svg>
            </div>
            <h3 class="text-2xl font-bold text-slate-200 mb-4">
              ${invoices.length === 0 ? 'مرحباً بك في نظام إدارة الفواتير والمدفوعات!' : 
                searchTerm ? `لا توجد نتائج للبحث: "${searchTerm}"` : 'لا توجد موردين'}
            </h3>
            <p class="text-slate-400 mb-6 max-w-md mx-auto leading-relaxed">
              ${invoices.length === 0 ? 
                'لم يتم إضافة أي فواتير بعد. ابدأ بإضافة فاتورة جديدة لتظهر الموردين والتقارير والمدفوعات هنا.' : 
                searchTerm ? 'تأكد من كتابة اسم المورد بشكل صحيح أو جرب مصطلحات بحث أخرى.' :
                'لا توجد موردين حالياً. قد تكون البيانات فارغة أو تحتاج لإعادة تحميل.'
              }
            </p>
            
            ${invoices.length === 0 ? `
              <div class="bg-slate-800/30 rounded-xl p-6 mb-6 max-w-sm mx-auto">
                <div class="text-slate-300 text-sm space-y-2">
                  <div class="flex justify-between">
                    <span>📊 الفواتير:</span>
                    <span class="font-mono">0</span>
                  </div>
                  <div class="flex justify-between">
                    <span>🏢 الموردين:</span>
                    <span class="font-mono">0</span>
                  </div>
                  <div class="flex justify-between">
                    <span>💰 إجمالي المبلغ:</span>
                    <span class="font-mono">0 ر.س</span>
                  </div>
                  <div class="flex justify-between">
                    <span>💳 المدفوعات:</span>
                    <span class="font-mono">0 ر.س</span>
                  </div>
                </div>
              </div>
              
              <div class="flex flex-col sm:flex-row gap-4 justify-center">
                <a href="add.html" class="modern-btn success inline-flex">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                  </svg>
                  إضافة فاتورة جديدة
                </a>
              </div>
            ` : searchTerm ? `
              <button onclick="clearSearch()" class="modern-btn">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
                مسح البحث
              </button>
            ` : `
              <button onclick="location.reload()" class="modern-btn">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                إعادة تحميل الصفحة
              </button>
            `}
          </div>
        `;
        return;
      }
      
      // Separate pinned and unpinned suppliers with outstanding amounts
      const suppliersWithStats = suppliers.map(supplier => {
        const stats = calculateSupplierStats(supplier);
        return {
          name: supplier,
          invoices: filteredSuppliers[supplier],
          ...stats
        };
      });
      
      const pinned = suppliersWithStats.filter(supplier => isSupplierPinned(supplier.name));
      const unpinned = suppliersWithStats.filter(supplier => !isSupplierPinned(supplier.name));
      
      let index = 0;
      
      // Render pinned suppliers section
      if (pinned.length > 0) {
        const pinnedSection = document.createElement('div');
        pinnedSection.className = 'pinned-section';
        pinnedSection.innerHTML = `
          <div class="section-header">
            <h3>
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
              </svg>
              الموردين المثبتين
            </h3>
          </div>
        `;
        
        const pinnedGrid = document.createElement('div');
        pinnedGrid.className = 'grid sm:grid-cols-2 lg:grid-cols-3 gap-8';
        
        pinned.forEach(supplier => {
          const card = createSupplierCard(supplier, index++, true);
          pinnedGrid.appendChild(card);
        });
        
        pinnedSection.appendChild(pinnedGrid);
        elements.suppliersContainer.appendChild(pinnedSection);
      }
      
      // Render unpinned suppliers section
      if (unpinned.length > 0) {
        if (pinned.length > 0) {
          const unpinnedSection = document.createElement('div');
          unpinnedSection.className = 'my-8';
          unpinnedSection.innerHTML = `
            <div class="section-header">
              <h3>
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
                </svg>
                باقي الموردين
              </h3>
            </div>
          `;
          
          const unpinnedGrid = document.createElement('div');
          unpinnedGrid.className = 'grid sm:grid-cols-2 lg:grid-cols-3 gap-8';
          
          unpinned.forEach(supplier => {
            const card = createSupplierCard(supplier, index++, false);
            unpinnedGrid.appendChild(card);
          });
          
          unpinnedSection.appendChild(unpinnedGrid);
          elements.suppliersContainer.appendChild(unpinnedSection);
        } else {
          // If no pinned suppliers, just show a simple grid
          const simpleGrid = document.createElement('div');
          simpleGrid.className = 'grid sm:grid-cols-2 lg:grid-cols-3 gap-8';
          
          unpinned.forEach(supplier => {
            const card = createSupplierCard(supplier, index++, false);
            simpleGrid.appendChild(card);
          });
          
          elements.suppliersContainer.appendChild(simpleGrid);
        }
      }
    }
    
    // Create supplier card with payment stats
    function createSupplierCard(supplierData, index, isPinned) {
      const card = document.createElement('div'); 
      card.className = `supplier-card slide-right ${isPinned ? 'pinned' : ''}`;
      card.style.animationDelay = `${index * 0.1}s`;
      
      const invoiceCount = supplierData.invoices.length;
      const outstandingClass = supplierData.outstanding > 0 ? 'text-yellow-300' : 'text-green-300';
      const outstandingIcon = supplierData.outstanding > 0 ? '⚠️' : '✅';
      
      card.innerHTML = `
        <button class="pin-btn ${isPinned ? 'active' : ''}" title="${isPinned ? 'إلغاء التثبيت' : 'تثبيت المورد'}" onclick="togglePinSupplier('${supplierData.name}', event)">
          <svg class="w-4 h-4" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
          </svg>
        </button>
        <div class="mb-6">
          <div class="flex items-center gap-4 mb-4">
            <div class="w-12 h-12 supplier-icon rounded-2xl flex items-center justify-center">
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
              </svg>
            </div>
            <div>
              <h3 class="text-xl font-bold text-slate-100 flex items-center gap-2">
                ${supplierData.name}
                ${isPinned ? '<svg class="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path></svg>' : ''}
              </h3>
              <div class="w-16 h-1 bg-gradient-to-r from-slate-500 to-slate-400 rounded-full mt-1"></div>
            </div>
          </div>
        </div>
        <div class="space-y-4 text-slate-300">
          <div class="stat-item">
            <div class="flex justify-between items-center">
              <span class="text-sm text-slate-400">عدد الفواتير:</span>
              <span class="font-bold text-slate-200 text-lg">${invoiceCount}</span>
            </div>
          </div>
          <div class="stat-item">
            <div class="flex justify-between items-center">
              <span class="text-sm text-slate-400">إجمالي الفواتير:</span>
              <span class="font-bold text-blue-300 text-lg">${formatCurrency(supplierData.totalInvoices)}</span>
            </div>
          </div>
          <div class="stat-item">
            <div class="flex justify-between items-center">
              <span class="text-sm text-slate-400">المدفوعات:</span>
              <span class="font-bold text-green-300 text-lg">${formatCurrency(supplierData.totalPayments)}</span>
            </div>
          </div>
          <div class="stat-item">
            <div class="flex justify-between items-center">
              <span class="text-sm text-slate-400">المستحق ${outstandingIcon}:</span>
              <span class="font-bold ${outstandingClass} text-lg">${formatCurrency(supplierData.outstanding)}</span>
            </div>
          </div>
        </div>
        <div class="mt-8 pt-6 border-t border-slate-600/30">
          <div class="flex items-center justify-center text-slate-400 font-semibold">
            <span class="text-sm">عرض التفاصيل</span>
            <svg class="w-5 h-5 mr-2 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </div>
        </div>
      `;
      
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.pin-btn')) {
          showInvoices(supplierData.name);
        }
      });
      
      return card;
    }
    
    // Render filtered invoices
    function renderFilteredInvoices() {
      elements.invoicesTableBody.innerHTML = '';
      let sum = 0;
      
      filteredInvoices.forEach((inv, index) => {
        sum += inv.totalAmount;
        const row = document.createElement('tr');
        row.style.animationDelay = `${index * 0.05}s`;
        row.className = 'fade-up';
        
        // Create unique invoice ID if not exists
        const invoiceId = inv.id || `${inv.invoiceNumber}-${inv.date}-${inv.supplier}`;
        row.dataset.invoiceId = invoiceId;
        
        row.innerHTML = `
          <td class="font-semibold text-white">${inv.invoiceNumber}</td>
          <td class="text-white">${inv.date}</td>
          <td class="text-white">${inv.type}</td>
          <td class="text-white">${inv.category}</td>
          <td class="text-white">${formatCurrency(inv.amountBeforeTax)}</td>
          <td class="text-white">${formatCurrency(inv.taxAmount)}</td>
          <td class="text-white font-bold">${formatCurrency(inv.totalAmount)}</td>
          <td>${formatNotes(inv.notes)}</td>
          <td>${createFileLink(inv)}</td>
          <td>
            <div class="flex gap-1 justify-center">
              <button class="action-btn edit" onclick="editInvoice('${invoiceId}')" title="تعديل">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
              </button>
              <button class="action-btn delete" onclick="deleteInvoice('${invoiceId}')" title="حذف">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
              </button>
            </div>
          </td>
        `;
        
        elements.invoicesTableBody.appendChild(row);
      });
      
      elements.totalAllEl.textContent = formatCurrency(sum);
    }
    
    // Render suppliers
    function renderSuppliers() {
      console.log('🔄 جاري تحميل الموردين...', { invoicesCount: invoices.length });
      
      const bySupplier = invoices.reduce((acc, inv) => { 
        acc[inv.supplier] = acc[inv.supplier] || []; 
        acc[inv.supplier].push(inv); 
        return acc; 
      }, {});
      
      console.log('📊 الموردين المعالجة:', Object.keys(bySupplier));
      
      filteredSuppliers = bySupplier;
      renderFilteredSuppliers();
    }
    
    // Show invoices for specific supplier
    function showInvoices(supplier) {
      currentSupplier = supplier;
      elements.supplierList.classList.add('hidden'); 
      elements.invoicesSection.classList.remove('hidden');
      elements.supplierTitle.textContent = `فواتير ومدفوعات: ${supplier}`; 
      
      // Reset search and sort state
      elements.invoiceSearch.value = '';
      currentSort = { column: null, direction: 'asc' };
      
      // Remove sort classes from headers
      document.querySelectorAll('.sortable-header').forEach(h => {
        h.classList.remove('sort-asc', 'sort-desc');
      });
      
      const supplierInvoices = invoices.filter(inv => inv.supplier === supplier);
      filteredInvoices = supplierInvoices;
      renderFilteredInvoices();
      renderPaymentsTable();
      updatePaymentStats();
    }
    
    // Edit invoice function
    window.editInvoice = function(invoiceId) {
      const invoice = invoices.find(inv => 
        (inv.id || `${inv.invoiceNumber}-${inv.date}-${inv.supplier}`) === invoiceId
      );
      if (!invoice) return;
      
      currentEditingInvoice = invoice;
      
      // Populate form
      elements.editInvoiceNumber.value = invoice.invoiceNumber;
      elements.editInvoiceDate.value = invoice.date;
      elements.editInvoiceType.value = invoice.type;
      elements.editInvoiceCategory.value = invoice.category;
      elements.editAmountBeforeTax.value = invoice.amountBeforeTax;
      elements.editTaxAmount.value = invoice.taxAmount;
      elements.editSupplier.value = invoice.supplier;
      elements.editNotes.value = invoice.notes || '';
      
      elements.editInvoiceModal.classList.add('show');
    };
    
    // Toggle pin supplier function (global)
    window.togglePinSupplier = function(supplierName, event) {
      event.stopPropagation(); // Prevent card click
      
      const index = pinnedSuppliers.indexOf(supplierName);
      if (index > -1) {
        // Unpin supplier
        pinnedSuppliers.splice(index, 1);
      } else {
        // Pin supplier
        pinnedSuppliers.push(supplierName);
      }
      
      // Re-render suppliers with current search
      const searchTerm = elements.supplierSearch.value;
      filterSuppliers(searchTerm);
    };
    
    // Delete invoice function
    window.deleteInvoice = function(invoiceId) {
      const invoice = invoices.find(inv => 
        (inv.id || `${inv.invoiceNumber}-${inv.date}-${inv.supplier}`) === invoiceId
      );
      if (!invoice) return;
      
      currentDeletingInvoice = invoice;
      
      // Show invoice details
      elements.invoiceDetails.innerHTML = `
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-slate-400">رقم الفاتورة:</span>
            <span class="text-slate-200 font-semibold">${invoice.invoiceNumber}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">التاريخ:</span>
            <span class="text-slate-200">${invoice.date}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">المورد:</span>
            <span class="text-slate-200">${invoice.supplier}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">المبلغ الإجمالي:</span>
            <span class="text-slate-200 font-bold">${formatCurrency(invoice.totalAmount)}</span>
          </div>
        </div>
      `;
      
      elements.deleteModal.classList.add('show');
    };
    
    // Edit supplier name
    function editSupplier() {
      elements.newSupplierName.value = currentSupplier;
      elements.editModal.classList.add('show');
      setTimeout(() => {
        elements.newSupplierName.focus();
        elements.newSupplierName.select();
      }, 100);
    }
    
    // Save supplier name
    function saveSupplier() {
      const newName = elements.newSupplierName.value.trim();
      if (!newName || newName === currentSupplier) {
        elements.editModal.classList.remove('show');
        return;
      }
      
      // Update invoices with new supplier name
      invoices = invoices.map(inv => 
        inv.supplier === currentSupplier ? {...inv, supplier: newName} : inv
      );
      
      // Update payments with new supplier name
      payments = payments.map(pay => 
        pay.supplier === currentSupplier ? {...pay, supplier: newName} : pay
      );
      
      currentSupplier = newName;
      elements.supplierTitle.textContent = `فواتير ومدفوعات: ${newName}`;
      elements.editModal.classList.remove('show');
      
      // Update filtered invoices with new supplier name
      filteredInvoices = filteredInvoices.map(inv => ({...inv, supplier: newName}));
      
      // Refresh payment stats and table
      updatePaymentStats();
      renderPaymentsTable();
      
      // Show success feedback
      const originalText = elements.saveSupplierBtn.innerHTML;
      elements.saveSupplierBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        تم الحفظ
      `;
      setTimeout(() => {
        elements.saveSupplierBtn.innerHTML = originalText;
      }, 2000);
    }
    
    // Update invoice
    function updateInvoice() {
      if (!currentEditingInvoice) return;
      
      const updatedInvoice = {
        ...currentEditingInvoice,
        invoiceNumber: elements.editInvoiceNumber.value,
        date: elements.editInvoiceDate.value,
        type: elements.editInvoiceType.value,
        category: elements.editInvoiceCategory.value,
        amountBeforeTax: parseFloat(elements.editAmountBeforeTax.value),
        taxAmount: parseFloat(elements.editTaxAmount.value),
        supplier: elements.editSupplier.value,
        notes: elements.editNotes.value.trim(),
        totalAmount: parseFloat(elements.editAmountBeforeTax.value) + parseFloat(elements.editTaxAmount.value),
        updatedAt: new Date().toISOString()
      };
      
      // Update invoice in array
      const index = invoices.findIndex(inv => 
        (inv.id || `${inv.invoiceNumber}-${inv.date}-${inv.supplier}`) === 
        (currentEditingInvoice.id || `${currentEditingInvoice.invoiceNumber}-${currentEditingInvoice.date}-${currentEditingInvoice.supplier}`)
      );
      
      if (index !== -1) {
        invoices[index] = updatedInvoice;
        
        // Refresh the view if supplier changed
        if (updatedInvoice.supplier !== currentSupplier) {
          elements.invoicesSection.classList.add('hidden');
          elements.supplierList.classList.remove('hidden');
          elements.supplierSearch.value = ''; // Reset search
          renderSuppliers();
        } else {
          // Refresh current supplier view with current search and sort
          const searchTerm = elements.invoiceSearch.value;
          const supplierInvoices = invoices.filter(inv => inv.supplier === currentSupplier);
          if (!searchTerm.trim()) {
            filteredInvoices = supplierInvoices;
          } else {
            filteredInvoices = supplierInvoices.filter(inv => 
              inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase())
            );
          }
          
          // Apply current sort if any
          if (currentSort.column) {
            sortInvoices(currentSort.column, currentSort.direction);
          } else {
            renderFilteredInvoices();
          }
          
          // Update payment stats
          updatePaymentStats();
        }
        
        elements.editInvoiceModal.classList.remove('show');
        
        // Show success feedback
        const originalText = elements.updateInvoiceBtn.innerHTML;
        elements.updateInvoiceBtn.innerHTML = `
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
          تم التحديث
        `;
        setTimeout(() => {
          elements.updateInvoiceBtn.innerHTML = originalText;
        }, 2000);
      }
    }
    
    // Confirm delete invoice
    function confirmDelete() {
      if (!currentDeletingInvoice) return;
      
      // Remove invoice from array
      invoices = invoices.filter(inv => 
        (inv.id || `${inv.invoiceNumber}-${inv.date}-${inv.supplier}`) !== 
        (currentDeletingInvoice.id || `${currentDeletingInvoice.invoiceNumber}-${currentDeletingInvoice.date}-${currentDeletingInvoice.supplier}`)
      );
      
      // Check if supplier still has invoices
      const supplierInvoices = invoices.filter(inv => inv.supplier === currentSupplier);
      if (supplierInvoices.length === 0) {
        // Go back to suppliers list if no invoices left
        elements.invoicesSection.classList.add('hidden');
        elements.supplierList.classList.remove('hidden');
        elements.supplierSearch.value = ''; // Reset search
        renderSuppliers();
      } else {
        // Refresh current supplier view with current search and sort
        const searchTerm = elements.invoiceSearch.value;
        if (!searchTerm.trim()) {
          filteredInvoices = supplierInvoices;
        } else {
          filteredInvoices = supplierInvoices.filter(inv => 
            inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase())
          );
        }
        
        // Apply current sort if any
        if (currentSort.column) {
          sortInvoices(currentSort.column, currentSort.direction);
        } else {
          renderFilteredInvoices();
        }
        
        // Update payment stats
        updatePaymentStats();
      }
      
      elements.deleteModal.classList.remove('show');
      currentDeletingInvoice = null;
    }
    
    // Export to CSV
    function exportToCSV() {
      let csvContent = '\uFEFF';
      csvContent += 'رقم الفاتورة,التاريخ,نوع الفاتورة,الفئة,المبلغ قبل الضريبة,الضريبة,الإجمالي,الملاحظات\n';
      
      filteredInvoices.forEach(inv => {
        const notes = (inv.notes || '').replace(/"/g, '""'); // Escape quotes
        csvContent += `"${inv.invoiceNumber}","${inv.date}","${inv.type}","${inv.category}",${inv.amountBeforeTax},${inv.taxAmount},${inv.totalAmount},"${notes}"\n`;
      });
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `فواتير_${currentSupplier}_${new Date().toLocaleDateString('ar-SA')}.csv`;
      link.click();
    }
    
    // Event listeners
    elements.editSupplierBtn.addEventListener('click', editSupplier);
    elements.saveSupplierBtn.addEventListener('click', saveSupplier);
    elements.cancelEditBtn.addEventListener('click', () => elements.editModal.classList.remove('show'));
    elements.updateInvoiceBtn.addEventListener('click', updateInvoice);
    elements.cancelEditInvoiceBtn.addEventListener('click', () => elements.editInvoiceModal.classList.remove('show'));
    elements.confirmDeleteBtn.addEventListener('click', confirmDelete);
    elements.cancelDeleteBtn.addEventListener('click', () => elements.deleteModal.classList.remove('show'));
    elements.exportBtn.addEventListener('click', exportToCSV);
    elements.backBtn.addEventListener('click', () => { 
      elements.invoicesSection.classList.add('hidden'); 
      elements.supplierList.classList.remove('hidden');
      elements.supplierSearch.value = ''; // Reset search
      renderSuppliers();
    });

    // Payment event listeners
    elements.addPaymentBtn.addEventListener('click', addPayment);
    elements.savePaymentBtn.addEventListener('click', savePayment);
    elements.cancelPaymentBtn.addEventListener('click', () => elements.addPaymentModal.classList.remove('show'));
    elements.updatePaymentBtn.addEventListener('click', updatePayment);
    elements.cancelEditPaymentBtn.addEventListener('click', () => elements.editPaymentModal.classList.remove('show'));
    elements.confirmDeletePaymentBtn.addEventListener('click', confirmDeletePayment);
    elements.cancelDeletePaymentBtn.addEventListener('click', () => elements.deletePaymentModal.classList.remove('show'));
    
    // زر تحديث البيانات
    document.getElementById('refresh-data-btn').addEventListener('click', () => {
      console.log('🔄 إعادة تحميل البيانات...');
      
      // إعادة تعيين البحث
      elements.supplierSearch.value = '';
      
      // إعادة رندر الموردين
      renderSuppliers();
      
      // إشعار المستخدم
      const btn = document.getElementById('refresh-data-btn');
      const originalText = btn.innerHTML;
      btn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        تم التحديث
      `;
      setTimeout(() => {
        btn.innerHTML = originalText;
      }, 2000);
    });
    
    // Search event listeners
    elements.supplierSearch.addEventListener('input', (e) => {
      filterSuppliers(e.target.value);
    });
    
    elements.invoiceSearch.addEventListener('input', (e) => {
      filterInvoices(e.target.value);
    });
    
    // Close modals on outside click
    [elements.editModal, elements.editInvoiceModal, elements.deleteModal, 
     elements.addPaymentModal, elements.editPaymentModal, elements.deletePaymentModal].forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('show');
        }
      });
    });
    
    // Handle enter key in modals
    elements.newSupplierName.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') saveSupplier();
    });
    
    elements.paymentAmount.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') savePayment();
    });
    
    // Auto-calculate total amount in edit form
    [elements.editAmountBeforeTax, elements.editTaxAmount].forEach(input => {
      input.addEventListener('input', () => {
        const beforeTax = parseFloat(elements.editAmountBeforeTax.value) || 0;
        const tax = parseFloat(elements.editTaxAmount.value) || 0;
        // Could add a total display field here if needed
      });
    });
    
    // Initialize sort handlers and render suppliers
    initializeSortHandlers();
    renderSuppliers();
    
    // دوال مساعدة عامة
    window.clearSearch = function() {
      elements.supplierSearch.value = '';
      filterSuppliers('');
    };
    
    console.log('✅ تم تحميل النظام بنجاح - نسخة نظيفة بدون localStorage أو بيانات تجريبية');
    
  } catch (error) {
    console.error('❌ خطأ في تحميل النظام:', error);
    
    // عرض رسالة خطأ للمستخدم
    document.body.innerHTML = `
      <div style="
        display: flex; 
        align-items: center; 
        justify-content: center; 
        min-height: 100vh; 
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #334155 100%);
        color: white;
        font-family: 'Tajawal', sans-serif;
        text-align: center;
        padding: 20px;
      ">
        <div style="
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 24px;
          padding: 40px;
          max-width: 500px;
          backdrop-filter: blur(20px);
        ">
          <div style="
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
          ">
            <svg width="40" height="40" fill="white" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>
          <h2 style="color: #f1f5f9; margin-bottom: 16px; font-size: 24px;">خطأ في تحميل النظام</h2>
          <p style="color: #cbd5e1; margin-bottom: 24px; line-height: 1.6;">
            حدث خطأ غير متوقع أثناء تحميل نظام إدارة الفواتير والمدفوعات. يرجى إعادة تحميل الصفحة.
          </p>
          <div style="margin-bottom: 20px; padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 8px; font-family: monospace; font-size: 12px; color: #fca5a5; text-align: left;">
            ${error.message}
          </div>
          <button onclick="location.reload()" style="
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
          ">
            إعادة تحميل الصفحة
          </button>
        </div>
      </div>
    `;
  }
});
