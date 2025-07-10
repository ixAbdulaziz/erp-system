// models/index.js
import sequelize from '../database/connection.js';
import User from './User.js';
import Supplier from './Supplier.js';
import Invoice from './Invoice.js';
import Payment from './Payment.js';
import PurchaseOrder from './PurchaseOrder.js';
import Session from './Session.js';

// ===================================================================
// تعريف العلاقات بين النماذج
// ===================================================================

// 👤 علاقات المستخدمين والجلسات
User.hasMany(Session, {
  foreignKey: 'userId',
  as: 'sessions',
  onDelete: 'CASCADE'
});

Session.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// 🏢 علاقات الموردين
Supplier.hasMany(Invoice, {
  foreignKey: 'supplierId',
  as: 'invoices',
  onDelete: 'CASCADE'
});

Supplier.hasMany(Payment, {
  foreignKey: 'supplierId',
  as: 'payments',
  onDelete: 'CASCADE'
});

Supplier.hasMany(PurchaseOrder, {
  foreignKey: 'supplierId',
  as: 'purchaseOrders',
  onDelete: 'CASCADE'
});

// 📄 علاقات الفواتير
Invoice.belongsTo(Supplier, {
  foreignKey: 'supplierId',
  as: 'supplier'
});

// 💰 علاقات الدفعات
Payment.belongsTo(Supplier, {
  foreignKey: 'supplierId',
  as: 'supplier'
});

// 📋 علاقات أوامر الشراء
PurchaseOrder.belongsTo(Supplier, {
  foreignKey: 'supplierId',
  as: 'supplier'
});

// 🔗 علاقة اختيارية بين أوامر الشراء والفواتير
PurchaseOrder.belongsTo(Invoice, {
  foreignKey: 'linkedInvoiceId',
  as: 'linkedInvoice',
  constraints: false // علاقة اختيارية
});

Invoice.hasOne(PurchaseOrder, {
  foreignKey: 'linkedInvoiceId',
  as: 'purchaseOrder',
  constraints: false // علاقة اختيارية
});

// ===================================================================
// دوال مساعدة لإدارة قاعدة البيانات
// ===================================================================

// مزامنة قاعدة البيانات
export const syncDatabase = async (options = {}) => {
  try {
    console.log('🔄 بدء مزامنة قاعدة البيانات...');
    
    await sequelize.sync({
      alter: process.env.NODE_ENV === 'development',
      force: options.force || false,
      ...options
    });
    
    console.log('✅ تم مزامنة جداول قاعدة البيانات بنجاح');
    return true;
  } catch (error) {
    console.error('❌ خطأ في مزامنة قاعدة البيانات:', error.message);
    throw error;
  }
};

// إنشاء بيانات افتراضية
export const seedDatabase = async () => {
  try {
    console.log('🌱 بدء إنشاء البيانات الافتراضية...');
    
    // إنشاء مستخدم admin افتراضي
    const adminExists = await User.findOne({ where: { username: 'admin' } });
    if (!adminExists) {
      await User.create({
        username: 'admin',
        passwordHash: 'admin_password_hash', // سيتم تشفيره في server.js
        role: 'admin'
      });
      console.log('👤 تم إنشاء مستخدم admin افتراضي');
    }
    
    // إنشاء مورد تجريبي
    const supplierExists = await Supplier.findOne({ where: { name: 'مورد تجريبي' } });
    if (!supplierExists) {
      await Supplier.create({
        name: 'مورد تجريبي',
        contactInfo: 'معلومات اتصال تجريبية',
        notes: 'مورد تجريبي للاختبار'
      });
      console.log('🏢 تم إنشاء مورد تجريبي');
    }
    
    console.log('✅ تم إنشاء البيانات الافتراضية بنجاح');
    return true;
  } catch (error) {
    console.error('❌ خطأ في إنشاء البيانات الافتراضية:', error.message);
    return false;
  }
};

// تنظيف الجلسات المنتهية دورياً
export const startSessionCleanup = () => {
  // تنظيف كل 10 دقائق
  setInterval(async () => {
    try {
      await Session.cleanupExpiredSessions();
    } catch (error) {
      console.error('❌ خطأ في تنظيف الجلسات:', error.message);
    }
  }, 10 * 60 * 1000); // 10 دقائق
  
  console.log('🧹 تم تفعيل تنظيف الجلسات التلقائي (كل 10 دقائق)');
};

// إحصائيات النظام
export const getSystemStats = async () => {
  try {
    const stats = {
      users: await User.count(),
      suppliers: await Supplier.count({ where: { isActive: true } }),
      invoices: await Invoice.count(),
      payments: await Payment.count(),
      purchaseOrders: await PurchaseOrder.count(),
      activeSessions: await Session.count({ where: { isActive: true } }),
      totalInvoiceAmount: await Invoice.sum('totalAmount') || 0,
      totalPaymentAmount: await Payment.sum('amount') || 0
    };
    
    // حساب المبالغ المستحقة
    stats.outstandingAmount = stats.totalInvoiceAmount - stats.totalPaymentAmount;
    
    return stats;
  } catch (error) {
    console.error('❌ خطأ في جلب إحصائيات النظام:', error.message);
    return null;
  }
};

// ===================================================================
// تصدير جميع النماذج والدوال
// ===================================================================

export {
  sequelize,
  User,
  Supplier,
  Invoice,
  Payment,
  PurchaseOrder,
  Session
};

export default {
  sequelize,
  User,
  Supplier,
  Invoice,
  Payment,
  PurchaseOrder,
  Session,
  syncDatabase,
  seedDatabase,
  startSessionCleanup,
  getSystemStats
};
