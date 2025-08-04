// API Helper Functions
const API_BASE_URL = window.location.origin;

// مساعد لإرسال طلبات API
const apiRequest = async (endpoint, method = 'GET', data = null) => {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

// Suppliers API
const suppliersAPI = {
  getAll: () => apiRequest('/api/suppliers'),
  create: (data) => apiRequest('/api/suppliers', 'POST', data),
  update: (id, data) => apiRequest(`/api/suppliers/${id}`, 'PUT', data),
  togglePin: (id, isPinned) => apiRequest(`/api/suppliers/${id}/pin`, 'PATCH', { is_pinned: isPinned })
};

// Invoices API
const invoicesAPI = {
  getAll: (supplierId = null) => {
    const endpoint = supplierId ? `/api/invoices?supplier_id=${supplierId}` : '/api/invoices';
    return apiRequest(endpoint);
  },
  create: (data) => apiRequest('/api/invoices', 'POST', data),
  update: (id, data) => apiRequest(`/api/invoices/${id}`, 'PUT', data),
  delete: (id) => apiRequest(`/api/invoices/${id}`, 'DELETE')
};

// Payments API
const paymentsAPI = {
  getAll: (supplierId = null) => {
    const endpoint = supplierId ? `/payments?supplier_id=${supplierId}` : '/payments';
    return apiRequest(endpoint);
  },
  create: (data) => apiRequest('/api/payments', 'POST', data),
  update: (id, data) => apiRequest(`/api/payments/${id}`, 'PUT', data),
  delete: (id) => apiRequest(`/api/payments/${id}`, 'DELETE')
};

// Purchase Orders API
const purchaseOrdersAPI = {
  getAll: () => apiRequest('/api/purchase-orders'),
  create: (data) => apiRequest('/api/purchase-orders', 'POST', data),
  update: (id, data) => apiRequest(`/api/purchase-orders/${id}`, 'PUT', data),
  delete: (id) => apiRequest(`/api/purchase-orders/${id}`, 'DELETE')
};

// Statistics API
const statisticsAPI = {
  getAll: () => apiRequest('/statistics')
};

// Storage Migration Functions
const migrationUtils = {
  // نقل البيانات من localStorage إلى قاعدة البيانات
  migrateFromLocalStorage: async () => {
    try {
      // نقل الفواتير
      const localInvoices = JSON.parse(localStorage.getItem('invoices') || '[]');
      for (const invoice of localInvoices) {
        try {
          await invoicesAPI.create({
            id: invoice.id || `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            invoice_number: invoice.invoiceNumber || invoice.invoiceNo || invoice.number,
            supplier_name: invoice.supplier,
            type: invoice.type,
            category: invoice.category,
            date: invoice.date,
            amount_before_tax: invoice.amountBeforeTax,
            tax_amount: invoice.taxAmount,
            total_amount: invoice.totalAmount,
            notes: invoice.notes,
            file_data: invoice.fileData,
            file_type: invoice.fileType,
            file_name: invoice.fileName,
            file_size: invoice.fileSize
          });
        } catch (err) {
          console.error('Error migrating invoice:', err);
        }
      }
      
      // نقل المدفوعات
      const localPayments = JSON.parse(localStorage.getItem('payments') || '[]');
      for (const payment of localPayments) {
        try {
          // البحث عن supplier_id من الاسم
          const suppliers = await suppliersAPI.getAll();
          const supplier = suppliers.find(s => s.name === payment.supplier);
          
          if (supplier) {
            await paymentsAPI.create({
              id: payment.id || `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              supplier_id: supplier.id,
              amount: payment.amount,
              date: payment.date,
              notes: payment.notes
            });
          }
        } catch (err) {
          console.error('Error migrating payment:', err);
        }
      }
      
      // نقل أوامر الشراء
      const localPOs = JSON.parse(localStorage.getItem('purchaseOrders') || '[]');
      for (const po of localPOs) {
        try {
          await purchaseOrdersAPI.create({
            id: po.id,
            supplier_name: po.supplier,
            description: po.description,
            price: po.price,
            pdf_file_data: po.pdfFile?.dataUrl,
            pdf_file_name: po.pdfFile?.name,
            pdf_file_size: po.pdfFile?.size,
            created_date: po.createdDate
          });
        } catch (err) {
          console.error('Error migrating purchase order:', err);
        }
      }
      
      // نقل الموردين المثبتين
      const pinnedSuppliers = JSON.parse(localStorage.getItem('pinnedSuppliers') || '[]');
      const suppliers = await suppliersAPI.getAll();
      
      for (const pinnedName of pinnedSuppliers) {
        const supplier = suppliers.find(s => s.name === pinnedName);
        if (supplier) {
          await suppliersAPI.togglePin(supplier.id, true);
        }
      }
      
      console.log('Migration completed successfully!');
      
      // مسح localStorage بعد النقل الناجح (اختياري)
      // localStorage.clear();
      
    } catch (error) {
      console.error('Migration error:', error);
    }
  }
};
