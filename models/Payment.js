// models/Payment.js
import { DataTypes } from 'sequelize';
import sequelize from '../database/connection.js';

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
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
  // مبلغ الدفعة
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    validate: {
      min: 0.01,
      notNull: true
    }
  },
  // تاريخ الدفعة
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    validate: {
      isDate: true,
      notNull: true
    }
  },
  // ملاحظات الدفعة
  notes: {
    type: DataTypes.TEXT
  },
  // معلومات النظام
  processedBy: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'processed_by'
  }
}, {
  tableName: 'payments',
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
      fields: ['processed_by']
    },
    {
      fields: ['amount']
    },
    {
      fields: ['created_at']
    }
  ],
  // Virtual fields
  getterMethods: {
    // صيغة عرض المبلغ
    formattedAmount() {
      return `${parseFloat(this.amount).toLocaleString('ar-SA')} ر.س`;
    },
    
    // صيغة عرض التاريخ
    formattedDate() {
      return new Date(this.date).toLocaleDateString('ar-SA');
    },
    
    // نوع المعاملة (للعرض)
    transactionType() {
      return 'دفعة';
    }
  },
  
  // Hooks للتحقق من صحة البيانات
  hooks: {
    beforeCreate: (payment, options) => {
      // التأكد أن التاريخ ليس في المستقبل
      const today = new Date();
      const paymentDate = new Date(payment.date);
      
      if (paymentDate > today) {
        throw new Error('لا يمكن إدخال دفعة بتاريخ مستقبلي');
      }
    },
    
    beforeUpdate: (payment, options) => {
      // نفس التحقق عند التحديث
      const today = new Date();
      const paymentDate = new Date(payment.date);
      
      if (paymentDate > today) {
        throw new Error('لا يمكن تحديث الدفعة بتاريخ مستقبلي');
      }
    }
  }
});

export default Payment;
