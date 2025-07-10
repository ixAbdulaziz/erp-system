// services/DatabaseService.js
import { Op } from 'sequelize';
import {
  sequelize,
  User,
  Supplier,
  Invoice,
  Payment,
  PurchaseOrder,
  Session,
  syncDatabase,
  getSystemStats
} from '../models/index.js';

// ===================================================================
// خدمات المستخدمين والمصادقة
// ===================================================================

export class UserService {
  // إنشاء مستخدم جديد
  static async createUser(userData) {
    try {
      const user = await User.create(userData);
      return { success: true, data: user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // البحث عن مستخدم
  static async findUser(criteria) {
    try {
      const user = await User.findOne({ where: criteria });
      return { success: true, data: user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // تحديث آخر تسجيل دخول
  static async updateLastLogin(userId) {
    try {
      await User.update(
        { 
          lastLogin: new Date(),
          loginCount: sequelize.literal('login_count + 1')
        },
        { where: { id: userId } }
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// ===================================================================
// خدمات الجلسات
// ===================================================================

export class SessionService {
  // إنشاء جلسة جديدة
  static async createSession(sessionData) {
    try {
      const session = await Session.create(sessionData);
      return { success: true, data: session };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // البحث عن جلسة نشطة
  static async findActiveSession(token) {
    try {
      const session = await Session.findOne({
        where: {
          token: token,
          isActive: true
        },
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'role']
        }]
      });

      // تحقق من انتهاء الصلاحية
      if (session && session.isExpired) {
        await session.update({ isActive: false });
        return { success: false, error: 'انتهت صلاحية الجلسة' };
      }

      return { success: true, data: session };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // تحديث نشاط الجلسة
  static async updateActivity(sessionId) {
    try {
      await Session.update(
        { lastActivity: new Date() },
        { where: { id: sessionId, isActive: true } }
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // إنهاء الجلسة
  static async endSession(token) {
    try {
      await Session.update(
        { isActive: false },
        { where: { token: token } }
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// ===================================================================
// خدمات الموردين
// ===================================================================

export class SupplierService {
  // جلب جميع الموردين
  static async getAllSuppliers() {
    try {
      const suppliers = await Supplier.findAll({
        where: { isActive: true },
        order: [['name', 'ASC']]
      });
      return { success: true, data: suppliers };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // البحث عن مورد أو إنشاؤه
  static async findOrCreateSupplier(name) {
    try {
      const [supplier, created] = await Supplier.findOrCreate({
        where: { name: name.trim() },
        defaults: {
          name: name.trim(),
          isActive: true
        }
      });
      return { success: true, data: supplier, created };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // تحديث إحصائيات المورد
  static async updateSupplierStats(supplierId) {
    try {
      const invoiceStats = await Invoice.findOne({
        where: { supplierId },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total_amount')), 'total']
        ],
        raw: true
      });

      const paymentStats = await Payment.findOne({
        where: { supplierId },
        attributes: [
          [sequelize.fn('SUM', sequelize.col('amount')), 'total']
        ],
        raw: true
      });

      const totalInvoices = parseInt(invoiceStats.count) || 0;
      const totalAmount = parseFloat(invoiceStats.total) || 0;
      const totalPaid = parseFloat(paymentStats.total) || 0;
      const outstandingAmount = totalAmount - totalPaid;

      await Supplier.update({
        totalInvoices,
        totalAmount,
        totalPaid,
        outstandingAmount
      }, {
        where: { id: supplierId }
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// ===================================================================
// خدمات الفواتير
// ===================================================================

export class InvoiceService {
  // إضافة فاتورة جديدة
  static async createInvoice(invoiceData) {
    const transaction = await sequelize.transaction();
    
    try {
      // البحث عن المورد أو إنشاؤه
      const supplierResult = await SupplierService.findOrCreateSupplier(invoiceData.supplier);
      if (!supplierResult.success) {
        throw new Error(supplierResult.error);
      }

      const supplier = supplierResult.data;

      // إنشاء الفاتورة
      const invoice = await Invoice.create({
        ...invoiceData,
        supplierId: supplier.id,
        supplierName: supplier.name
      }, { transaction });

      // تحديث إحصائيات المورد
      await SupplierService.updateSupplierStats(supplier.id);

      await transaction.commit();
      return { success: true, data: invoice };
    } catch (error) {
      await transaction.rollback();
      return { success: false, error: error.message };
    }
  }

  // جلب جميع الفواتير
  static async getAllInvoices(options = {}) {
    try {
      const whereClause = {};
      if (options.supplier) {
        whereClause.supplierName = { [Op.iLike]: `%${options.supplier}%` };
      }

      const invoices = await Invoice.findAll({
        where: whereClause,
        include: [{
          model: Supplier,
          as: 'supplier',
          attributes: ['id', 'name', 'outstandingAmount']
        }],
        order: [['createdAt', 'DESC']]
      });

      return { success: true, data: invoices };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // تحديث فاتورة
  static async updateInvoice(id, updateData) {
    const transaction = await sequelize.transaction();
    
    try {
      const invoice = await Invoice.findByPk(id);
      if (!invoice) {
        throw new Error('الفاتورة غير موجودة');
      }

      const oldSupplierId = invoice.supplierId;
      let newSupplierId = oldSupplierId;

      // إذا تغير المورد
      if (updateData.supplier && updateData.supplier !== invoice.supplierName) {
        const supplierResult = await SupplierService.findOrCreateSupplier(updateData.supplier);
        if (!supplierResult.success) {
          throw new Error(supplierResult.error);
        }
        newSupplierId = supplierResult.data.id;
        updateData.supplierId = newSupplierId;
        updateData.supplierName = supplierResult.data.name;
      }

      // تحديث الفاتورة
      await invoice.update(updateData, { transaction });

      // تحديث إحصائيات الموردين
      await SupplierService.updateSupplierStats(oldSupplierId);
      if (newSupplierId !== oldSupplierId) {
        await SupplierService.updateSupplierStats(newSupplierId);
      }

      await transaction.commit();
      return { success: true, data: invoice };
    } catch (error) {
      await transaction.rollback();
      return { success: false, error: error.message };
    }
  }

  // حذف فاتورة
  static async deleteInvoice(id) {
    const transaction = await sequelize.transaction();
    
    try {
      const invoice = await Invoice.findByPk(id);
      if (!invoice) {
        throw new Error('الفاتورة غير موجودة');
      }

      const supplierId = invoice.supplierId;
      await invoice.destroy({ transaction });

      // تحديث إحصائيات المورد
      await SupplierService.updateSupplierStats(supplierId);

      await transaction.commit();
      return { success: true };
    } catch (error) {
      await transaction.rollback();
      return { success: false, error: error.message };
    }
  }
}

// ===================================================================
// خدمات الدفعات
// ===================================================================

export class PaymentService {
  // إضافة دفعة جديدة
  static async createPayment(paymentData) {
    const transaction = await sequelize.transaction();
    
    try {
      // البحث عن المورد
      const supplierResult = await SupplierService.findOrCreateSupplier(paymentData.supplier);
      if (!supplierResult.success) {
        throw new Error(supplierResult.error);
      }

      const supplier = supplierResult.data;

      // إنشاء الدفعة
      const payment = await Payment.create({
        ...paymentData,
        supplierId: supplier.id,
        supplierName: supplier.name
      }, { transaction });

      // تحديث إحصائيات المورد
      await SupplierService.updateSupplierStats(supplier.id);

      await transaction.commit();
      return { success: true, data: payment };
    } catch (error) {
      await transaction.rollback();
      return { success: false, error: error.message };
    }
  }

  // جلب دفعات مورد معين
  static async getPaymentsBySupplier(supplierName) {
    try {
      const payments = await Payment.findAll({
        where: { supplierName },
        order: [['date', 'DESC']]
      });
      return { success: true, data: payments };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // تحديث دفعة
  static async updatePayment(id, updateData) {
    const transaction = await sequelize.transaction();
    
    try {
      const payment = await Payment.findByPk(id);
      if (!payment) {
        throw new Error('الدفعة غير موجودة');
      }

      const oldSupplierId = payment.supplierId;
      await payment.update(updateData, { transaction });

      // تحديث إحصائيات المورد
      await SupplierService.updateSupplierStats(oldSupplierId);

      await transaction.commit();
      return { success: true, data: payment };
    } catch (error) {
      await transaction.rollback();
      return { success: false, error: error.message };
    }
  }

  // حذف دفعة
  static async deletePayment(id) {
    const transaction = await sequelize.transaction();
    
    try {
      const payment = await Payment.findByPk(id);
      if (!payment) {
        throw new Error('الدفعة غير موجودة');
      }

      const supplierId = payment.supplierId;
      await payment.destroy({ transaction });

      // تحديث إحصائيات المورد
      await SupplierService.updateSupplierStats(supplierId);

      await transaction.commit();
      return { success: true };
    } catch (error) {
      await transaction.rollback();
      return { success: false, error: error.message };
    }
  }
}

// ===================================================================
// خدمات أوامر الشراء
// ===================================================================

export class PurchaseOrderService {
  // إضافة أمر شراء جديد
  static async createPurchaseOrder(poData) {
    const transaction = await sequelize.transaction();
    
    try {
      // البحث عن المورد أو إنشاؤه
      const supplierResult = await SupplierService.findOrCreateSupplier(poData.supplier);
      if (!supplierResult.success) {
        throw new Error(supplierResult.error);
      }

      const supplier = supplierResult.data;

      // إنشاء رقم أمر الشراء تلقائياً إذا لم يكن موجود
      if (!poData.id) {
        const lastPO = await PurchaseOrder.findOne({
          order: [['createdAt', 'DESC']],
          attributes: ['id']
        });
        
        let nextNumber = 1;
        if (lastPO && lastPO.id) {
          const match = lastPO.id.match(/PO-(\d+)/);
          if (match) {
            nextNumber = parseInt(match[1]) + 1;
          }
        }
        
        poData.id = `PO-${nextNumber.toString().padStart(3, '0')}`;
      }

      // إنشاء أمر الشراء
      const purchaseOrder = await PurchaseOrder.create({
        ...poData,
        supplierId: supplier.id,
        supplierName: supplier.name
      }, { transaction });

      await transaction.commit();
      return { success: true, data: purchaseOrder };
    } catch (error) {
      await transaction.rollback();
      return { success: false, error: error.message };
    }
  }

  // جلب جميع أوامر الشراء
  static async getAllPurchaseOrders() {
    try {
      const purchaseOrders = await PurchaseOrder.findAll({
        include: [{
          model: Supplier,
          as: 'supplier',
          attributes: ['id', 'name']
        }, {
          model: Invoice,
          as: 'linkedInvoice',
          attributes: ['id', 'invoiceNumber', 'totalAmount'],
          required: false
        }],
        order: [['createdAt', 'DESC']]
      });

      return { success: true, data: purchaseOrders };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ربط أمر شراء بفاتورة
  static async linkToInvoice(poId, invoiceId) {
    try {
      const result = await PurchaseOrder.update(
        { linkedInvoiceId: invoiceId },
        { where: { id: poId } }
      );

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// ===================================================================
// خدمات الإحصائيات والتقارير
// ===================================================================

export class StatsService {
  // إحصائيات عامة للنظام
  static async getSystemStats() {
    try {
      const stats = await getSystemStats();
      return { success: true, data: stats };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // إحصائيات مورد معين
  static async getSupplierStats(supplierName) {
    try {
      const supplier = await Supplier.findOne({
        where: { name: supplierName },
        include: [{
          model: Invoice,
          as: 'invoices',
          attributes: ['id', 'invoiceNumber', 'totalAmount', 'date']
        }, {
          model: Payment,
          as: 'payments',
          attributes: ['id', 'amount', 'date', 'notes']
        }]
      });

      if (!supplier) {
        throw new Error('المورد غير موجود');
      }

      return { success: true, data: supplier };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// ===================================================================
// دالة التهيئة الأساسية
// ===================================================================

export const initializeDatabase = async () => {
  try {
    console.log('🔄 تهيئة قاعدة البيانات...');
    
    // مزامنة الجداول
    await syncDatabase();
    
    // إنشاء البيانات الافتراضية إذا لزم الأمر
    const userCount = await User.count();
    if (userCount === 0) {
      console.log('🌱 إنشاء بيانات افتراضية...');
      // سيتم إنشاء المستخدمين في server.js
    }
    
    console.log('✅ تم تهيئة قاعدة البيانات بنجاح');
    return true;
  } catch (error) {
    console.error('❌ خطأ في تهيئة قاعدة البيانات:', error.message);
    return false;
  }
};

// تصدير جميع الخدمات
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
