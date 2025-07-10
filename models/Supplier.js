// models/Supplier.js
import { DataTypes } from 'sequelize';
import sequelize from '../database/connection.js';

const Supplier = sequelize.define('Supplier', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true,
      len: [2, 100]
    }
  },
  contactInfo: {
    type: DataTypes.TEXT,
    field: 'contact_info'
  },
  notes: {
    type: DataTypes.TEXT
  },
  // إحصائيات تُحدث تلقائياً عبر triggers
  totalInvoices: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_invoices'
  },
  totalAmount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00,
    field: 'total_amount'
  },
  totalPaid: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00,
    field: 'total_paid'
  },
  outstandingAmount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00,
    field: 'outstanding_amount'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  }
}, {
  tableName: 'suppliers',
  indexes: [
    {
      unique: true,
      fields: ['name']
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['total_amount']
    },
    {
      fields: ['outstanding_amount']
    },
    {
      fields: ['created_at']
    }
  ],
  // Virtual fields للحسابات
  getterMethods: {
    // نسبة الدفع
    paymentRatio() {
      const total = parseFloat(this.totalAmount) || 0;
      const paid = parseFloat(this.totalPaid) || 0;
      return total > 0 ? (paid / total * 100).toFixed(2) : 0;
    },
    
    // حالة الدفع
    paymentStatus() {
      const outstanding = parseFloat(this.outstandingAmount) || 0;
      if (outstanding <= 0) return 'مدفوع بالكامل';
      if (outstanding === parseFloat(this.totalAmount)) return 'غير مدفوع';
      return 'مدفوع جزئياً';
    }
  }
});

export default Supplier;
