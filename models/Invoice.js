// models/Invoice.js
import { DataTypes } from 'sequelize';
import sequelize from '../database/connection.js';

const Invoice = sequelize.define('Invoice', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  invoiceNumber: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'invoice_number',
    validate: {
      notEmpty: true
    }
  },
  // ربط بالمورد
  supplierId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'supplier_id',
    references: {
      model: 'suppliers',
      key: 'id'
    }
  },
  // denormalized للأداء (نسخة من اسم المورد)
  supplierName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'supplier_name'
  },
  type: {
    type: DataTypes.STRING(100),
    validate: {
      notEmpty: true
    }
  },
  category: {
    type: DataTypes.STRING(100)
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    validate: {
      isDate: true
    }
  },
  // المبالغ المالية
  amountBeforeTax: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00,
    field: 'amount_before_tax',
    validate: {
      min: 0
    }
  },
  taxAmount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00,
    field: 'tax_amount',
    validate: {
      min: 0
    }
  },
  totalAmount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00,
    field: 'total_amount',
    validate: {
      min: 0
    }
  },
  notes: {
    type: DataTypes.TEXT
  },
  // بيانات الملف
  fileData: {
    type: DataTypes.TEXT, // base64 encoded
    field: 'file_data'
  },
  fileType: {
    type: DataTypes.STRING(50),
    field: 'file_type'
  },
  fileName: {
    type: DataTypes.STRING(255),
    field: 'file_name'
  },
  fileSize: {
    type: DataTypes.INTEGER,
    field: 'file_size'
  },
  // حالة الفاتورة
  status: {
    type: DataTypes.ENUM('active', 'paid', 'cancelled'),
    defaultValue: 'active'
  },
  // معلومات النظام
  processedBy: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'processed_by'
  },
  // ربط اختياري بأمر شراء
  purchaseOrderId: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'purchase_order_id',
    references: {
      model: 'purchase_orders',
      key: 'id'
    }
  }
}, {
  tableName: 'invoices',
  indexes: [
    {
      fields: ['supplier_id']
    },
    {
      fields: ['supplier_name']
    },
    {
      fields: ['date']
    },
    {
      fields: ['invoice_number']
    },
    {
      unique: true,
      fields: ['invoice_number', 'supplier_name'],
      name: 'unique_invoice_per_supplier'
    },
    {
      fields: ['status']
    },
    {
      fields: ['processed_by']
    },
    {
      fields: ['type']
    },
    {
      fields: ['category']
    },
    {
      fields: ['total_amount']
    },
    {
      fields: ['created_at']
    }
  ],
  // Hooks لحساب totalAmount تلقائياً
  hooks: {
    beforeSave: (invoice, options) => {
      // حساب الإجمالي تلقائياً
      const beforeTax = parseFloat(invoice.amountBeforeTax) || 0;
      const tax = parseFloat(invoice.taxAmount) || 0;
      invoice.totalAmount = beforeTax + tax;
    }
  },
  // Virtual fields
  getterMethods: {
    // صيغة عرض المبلغ
    formattedAmount() {
      return `${parseFloat(this.totalAmount).toLocaleString('ar-SA')} ر.س`;
    },
    
    // صيغة عرض التاريخ
    formattedDate() {
      return new Date(this.date).toLocaleDateString('ar-SA');
    },
    
    // حجم الملف بصيغة قابلة للقراءة
    formattedFileSize() {
      if (!this.fileSize) return '';
      const size = this.fileSize;
      if (size < 1024) return `${size} B`;
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }
  }
});

export default Invoice;
