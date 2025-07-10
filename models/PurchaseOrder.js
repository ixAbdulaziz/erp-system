// models/PurchaseOrder.js
import { DataTypes } from 'sequelize';
import sequelize from '../database/connection.js';

const PurchaseOrder = sequelize.define('PurchaseOrder', {
  // معرف الأمر (مثل PO-001, PO-002)
  id: {
    type: DataTypes.STRING(20),
    primaryKey: true,
    validate: {
      notEmpty: true,
      is: /^PO-\d{3,}$/ // يجب أن يكون بصيغة PO-XXX
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
  // وصف تفصيلي للطلب
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [10, 2000] // على الأقل 10 أحرف
    }
  },
  // سعر أمر الشراء
  price: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    validate: {
      min: 0.01,
      notNull: true
    }
  },
  // تاريخ إنشاء الأمر
  createdDate: {
    type: DataTypes.DATEONLY,
    defaultValue: DataTypes.NOW,
    field: 'created_date'
  },
  // حالة الأمر
  status: {
    type: DataTypes.ENUM('active', 'completed', 'cancelled'),
    defaultValue: 'active',
    allowNull: false
  },
  // ملف PDF اختياري
  pdfFile: {
    type: DataTypes.TEXT, // base64 encoded
    allowNull: true,
    field: 'pdf_file'
  },
  pdfFileName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'pdf_file_name'
  },
  pdfFileSize: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'pdf_file_size'
  },
  // ربط اختياري بفاتورة
  linkedInvoiceId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'linked_invoice_id',
    references: {
      model: 'invoices',
      key: 'id'
    }
  },
  // معلومات النظام
  processedBy: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'processed_by'
  }
}, {
  tableName: 'purchase_orders',
  indexes: [
    {
      fields: ['supplier_id']
    },
    {
      fields: ['supplier_name']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created_date']
    },
    {
      fields: ['processed_by']
    },
    {
      fields: ['price']
    },
    {
      fields: ['linked_invoice_id']
    }
  ],
  
  // Virtual fields
  getterMethods: {
    // صيغة عرض السعر
    formattedPrice() {
      return `${parseFloat(this.price).toLocaleString('ar-SA')} ر.س`;
    },
    
    // صيغة عرض التاريخ
    formattedDate() {
      return new Date(this.createdDate).toLocaleDateString('ar-SA');
    },
    
    // حالة باللغة العربية
    statusInArabic() {
      const statusMap = {
        'active': 'نشط',
        'completed': 'مكتمل',
        'cancelled': 'ملغى'
      };
      return statusMap[this.status] || this.status;
    },
    
    // حجم ملف PDF بصيغة قابلة للقراءة
    formattedPdfSize() {
      if (!this.pdfFileSize) return '';
      const size = this.pdfFileSize;
      if (size < 1024) return `${size} B`;
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    },
    
    // هل مربوط بفاتورة؟
    isLinkedToInvoice() {
      return !!this.linkedInvoiceId;
    }
  },
  
  // Hooks
  hooks: {
    beforeValidate: (purchaseOrder, options) => {
      // إنشاء ID تلقائي إذا لم يكن موجود
      if (!purchaseOrder.id) {
        purchaseOrder.id = generatePONumber();
      }
    }
  }
});

// دالة مساعدة لإنشاء رقم أمر الشراء
function generatePONumber() {
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  return `PO-${timestamp.toString().slice(-6)}${randomSuffix}`;
}

export default PurchaseOrder;
