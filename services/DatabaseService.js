// services/DatabaseService.js - نسخة مبسطة للإصلاح السريع
import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// ===================================================================
// إعداد الاتصال المبسط
// ===================================================================

let sequelize = null;

try {
  if (process.env.DATABASE_URL) {
    sequelize = new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      dialectOptions: {
        ssl: process.env.NODE_ENV === 'production' ? {
          require: true,
          rejectUnauthorized: false
        } : false
      },
      logging: false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    });
    console.log('🔄 محاولة الاتصال بـ PostgreSQL...');
  } else {
    console.log('⚠️ DATABASE_URL غير موجود');
  }
} catch (error) {
  console.error('❌ خطأ في إنشاء sequelize:', error.message);
}

// ===================================================================
// نماذج مبسطة
// ===================================================================

let User, Supplier, Invoice, Payment, PurchaseOrder, Session;

try {
  if (sequelize) {
    // نموذج المستخدمين
    User = sequelize.define('User', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      username: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      role: {
        type: DataTypes.ENUM('user', 'admin'),
        defaultValue: 'user'
      }
    }, {
      tableName: 'users'
    });

    // نموذج الموردين
    Supplier = sequelize.define('Supplier', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
      },
      totalInvoices: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      totalAmount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00
      },
      totalPaid: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00
      },
      outstandingAmount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00
      }
    }, {
      tableName: 'suppliers'
    });

    // نموذج الفواتير
    Invoice = sequelize.define('Invoice', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      invoiceNumber: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      supplierId: {
        type: DataTypes.UUID,
        allowNull: false
      },
      supplierName: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      type: DataTypes.STRING(100),
      category: DataTypes.STRING(100),
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false
      },
      amountBeforeTax: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00
      },
      taxAmount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00
      },
      totalAmount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00
      },
      notes: DataTypes.TEXT,
      fileData: DataTypes.TEXT,
      fileType: DataTypes.STRING(50),
      fileName: DataTypes.STRING(255),
      fileSize: DataTypes.INTEGER,
      processedBy: {
        type: DataTypes.STRING(50),
        allowNull: false
      }
    }, {
      tableName: 'invoices'
    });

    console.log('✅ تم تعريف النماذج بنجاح');
  }
} catch (error) {
  console.error('❌ خطأ في تعريف النماذج:', error.message);
}

// ===================================================================
// خدمات مبسطة
// ===================================================================

export class UserService {
  static async createUser(userData) {
    try {
      if (!User) throw new Error('User model not available');
      const user = await User.create(userData);
      return { success: true, data: user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async findUser(criteria) {
    try {
      if (!User) throw new Error('User model not available');
      const user = await User.findOne({ where: criteria });
      return { success: true, data: user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async updateLastLogin(userId) {
    try {
      if (!User) throw new Error('User model not available');
      await User.update({ lastLogin: new Date() }, { where: { id: userId } });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export class SupplierService {
  static async findOrCreateSupplier(name) {
    try {
      if (!Supplier) throw new Error('Supplier model not available');
      const [supplier, created] = await Supplier.findOrCreate({
        where: { name: name.trim() },
        defaults: { name: name.trim() }
      });
      return { success: true, data: supplier, created };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async getAllSuppliers() {
    try {
      if (!Supplier) throw new Error('Supplier model not available');
      const suppliers = await Supplier.findAll({ order: [['name', 'ASC']] });
      return { success: true, data: suppliers };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async updateSupplierStats(supplierId) {
    return { success: true }; // مبسط للآن
  }
}

export class InvoiceService {
  static async createInvoice(invoiceData) {
    try {
      if (!Invoice || !Supplier) throw new Error('Models not available');
      
      // البحث عن المورد أو إنشاؤه
      const supplierResult = await SupplierService.findOrCreateSupplier(invoiceData.supplier);
      if (!supplierResult.success) throw new Error(supplierResult.error);

      const supplier = supplierResult.data;

      // إنشاء الفاتورة
      const invoice = await Invoice.create({
        ...invoiceData,
        supplierId: supplier.id,
        supplierName: supplier.name
      });

      return { success: true, data: invoice };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async getAllInvoices() {
    try {
      if (!Invoice) throw new Error('Invoice model not available');
      const invoices = await Invoice.findAll({ order: [['createdAt', 'DESC']] });
      return { success: true, data: invoices };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// خدمات فارغة للآن (تجنب أخطاء import)
export class SessionService {
  static async createSession() { return { success: false, error: 'Not implemented' }; }
  static async findActiveSession() { return { success: false, error: 'Not implemented' }; }
  static async updateActivity() { return { success: false, error: 'Not implemented' }; }
  static async endSession() { return { success: false, error: 'Not implemented' }; }
}

export class PaymentService {
  static async createPayment() { return { success: false, error: 'Not implemented' }; }
  static async getPaymentsBySupplier() { return { success: true, data: [] }; }
}

export class PurchaseOrderService {
  static async createPurchaseOrder() { return { success: false, error: 'Not implemented' }; }
  static async getAllPurchaseOrders() { return { success: true, data: [] }; }
}

export class StatsService {
  static async getSystemStats() {
    return {
      success: true,
      data: {
        users: 0,
        suppliers: 0,
        invoices: 0,
        payments: 0,
        purchaseOrders: 0,
        activeSessions: 0,
        totalInvoiceAmount: 0,
        totalPaymentAmount: 0,
        outstandingAmount: 0
      }
    };
  }
}

// ===================================================================
// دالة التهيئة
// ===================================================================

export const initializeDatabase = async () => {
  try {
    if (!sequelize) {
      console.log('⚠️ PostgreSQL غير متاح - DATABASE_URL مفقود');
      return false;
    }

    console.log('🔄 اختبار الاتصال بـ PostgreSQL...');
    await sequelize.authenticate();
    console.log('✅ تم الاتصال بـ PostgreSQL بنجاح');

    console.log('🔄 مزامنة الجداول...');
    await sequelize.sync({ alter: true });
    console.log('✅ تم مزامنة الجداول بنجاح');

    return true;
  } catch (error) {
    console.error('❌ خطأ في تهيئة PostgreSQL:', error.message);
    console.log('🔄 سيتم استخدام localStorage كـ fallback');
    return false;
  }
};

// تصدير النماذج (للتوافق)
export { sequelize, User, Supplier, Invoice, Payment, PurchaseOrder, Session };

export default {
  UserService,
  SessionService,
  SupplierService,
  InvoiceService,
  PaymentService,
  PurchaseOrderService,
  StatsService,
  initializeDatabase
};
