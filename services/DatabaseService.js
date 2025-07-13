// services/DatabaseService.js - نسخة كاملة مع جميع الوظائف
import { Sequelize, DataTypes, Op } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// ===================================================================
// إعداد الاتصال
// ===================================================================

let sequelize = null;
let isConnected = false;

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
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    });
    console.log('🔄 تم إنشاء اتصال PostgreSQL...');
  } else {
    console.log('⚠️ DATABASE_URL غير موجود');
  }
} catch (error) {
  console.error('❌ خطأ في إنشاء sequelize:', error.message);
}

// ===================================================================
// تعريف النماذج الكاملة
// ===================================================================

let User, Supplier, Invoice, Payment, PurchaseOrder, Session;

if (sequelize) {
  try {
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
      },
      lastLogin: {
        type: DataTypes.DATE,
        allowNull: true
      },
      loginCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    }, {
      tableName: 'users',
      timestamps: true
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
      contactInfo: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
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
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    }, {
      tableName: 'suppliers',
      timestamps: true
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
        allowNull: false,
        references: {
          model: Supplier,
          key: 'id'
        }
      },
      supplierName: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      type: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      category: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
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
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      fileData: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      fileType: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      fileName: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      fileSize: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('active', 'paid', 'cancelled'),
        defaultValue: 'active'
      },
      processedBy: {
        type: DataTypes.STRING(50),
        allowNull: false
      }
    }, {
      tableName: 'invoices',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['invoiceNumber', 'supplierName'] },
        { fields: ['supplierId'] },
        { fields: ['date'] },
        { fields: ['status'] }
      ]
    });

    // نموذج الدفعات
    Payment = sequelize.define('Payment', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      supplierId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: Supplier,
          key: 'id'
        }
      },
      supplierName: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
          min: 0.01
        }
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      processedBy: {
        type: DataTypes.STRING(50),
        allowNull: false
      }
    }, {
      tableName: 'payments',
      timestamps: true,
      indexes: [
        { fields: ['supplierId'] },
        { fields: ['date'] }
      ]
    });

    // نموذج أوامر الشراء
    PurchaseOrder = sequelize.define('PurchaseOrder', {
      id: {
        type: DataTypes.STRING(20),
        primaryKey: true
      },
      supplierId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: Supplier,
          key: 'id'
        }
      },
      supplierName: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
          min: 0.01
        }
      },
      createdDate: {
        type: DataTypes.DATEONLY,
        defaultValue: DataTypes.NOW
      },
      status: {
        type: DataTypes.ENUM('active', 'completed', 'cancelled'),
        defaultValue: 'active'
      },
      pdfFile: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      pdfFileName: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      linkedInvoiceId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: Invoice,
          key: 'id'
        }
      },
      processedBy: {
        type: DataTypes.STRING(50),
        allowNull: false
      }
    }, {
      tableName: 'purchase_orders',
      timestamps: true,
      indexes: [
        { fields: ['supplierId'] },
        { fields: ['status'] },
        { fields: ['createdDate'] }
      ]
    });

    // نموذج الجلسات
    Session = sequelize.define('Session', {
      id: {
        type: DataTypes.STRING(128),
        primaryKey: true
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: User,
          key: 'id'
        }
      },
      username: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      userData: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      lastActivity: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      ipAddress: {
        type: DataTypes.STRING(45),
        allowNull: true
      }
    }, {
      tableName: 'sessions',
      timestamps: true,
      indexes: [
        { fields: ['userId'] },
        { fields: ['expiresAt'] },
        { fields: ['isActive'] }
      ]
    });

    // تعريف العلاقات
    Supplier.hasMany(Invoice, { foreignKey: 'supplierId', as: 'invoices' });
    Invoice.belongsTo(Supplier, { foreignKey: 'supplierId', as: 'supplier' });

    Supplier.hasMany(Payment, { foreignKey: 'supplierId', as: 'payments' });
    Payment.belongsTo(Supplier, { foreignKey: 'supplierId', as: 'supplier' });

    Supplier.hasMany(PurchaseOrder, { foreignKey: 'supplierId', as: 'purchaseOrders' });
    PurchaseOrder.belongsTo(Supplier, { foreignKey: 'supplierId', as: 'supplier' });

    PurchaseOrder.belongsTo(Invoice, { foreignKey: 'linkedInvoiceId', as: 'linkedInvoice' });
    Invoice.hasOne(PurchaseOrder, { foreignKey: 'linkedInvoiceId', as: 'purchaseOrder' });

    User.hasMany(Session, { foreignKey: 'userId', as: 'sessions' });
    Session.belongsTo(User, { foreignKey: 'userId', as: 'user' });

    console.log('✅ تم تعريف النماذج والعلاقات بنجاح');
  } catch (error) {
    console.error('❌ خطأ في تعريف النماذج:', error.message);
  }
}

// ===================================================================
// خدمات المستخدمين
// ===================================================================

export class UserService {
  static async createUser(userData) {
    try {
      if (!User) throw new Error('User model not available');
      const user = await User.create(userData);
      console.log(`👤 تم إنشاء مستخدم جديد: ${userData.username}`);
      return { success: true, data: user };
    } catch (error) {
      console.error('❌ خطأ في إنشاء المستخدم:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async findUser(criteria) {
    try {
      if (!User) throw new Error('User model not available');
      const user = await User.findOne({ where: criteria });
      return { success: true, data: user };
    } catch (error) {
      console.error('❌ خطأ في البحث عن المستخدم:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async updateUserLogin(username) {
    try {
      if (!User) throw new Error('User model not available');
      await User.increment('loginCount', { where: { username } });
      await User.update({ lastLogin: new Date() }, { where: { username } });
      return { success: true };
    } catch (error) {
      console.error('❌ خطأ في تحديث بيانات المستخدم:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async getAllUsers() {
    try {
      if (!User) throw new Error('User model not available');
      const users = await User.findAll({
        attributes: ['id', 'username', 'role', 'lastLogin', 'loginCount', 'isActive', 'createdAt'],
        order: [['username', 'ASC']]
      });
      return { success: true, data: users };
    } catch (error) {
      console.error('❌ خطأ في جلب المستخدمين:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// ===================================================================
// خدمات الموردين
// ===================================================================

export class SupplierService {
  static async findOrCreateSupplier(name, contactInfo = null, notes = null) {
    try {
      if (!Supplier) throw new Error('Supplier model not available');
      
      const trimmedName = name.trim();
      const [supplier, created] = await Supplier.findOrCreate({
        where: { name: trimmedName },
        defaults: { 
          name: trimmedName,
          contactInfo: contactInfo || null,
          notes: notes || null
        }
      });

      if (created) {
        console.log(`🏢 تم إنشاء مورد جديد: ${trimmedName}`);
      }

      return { success: true, data: supplier, created };
    } catch (error) {
      console.error('❌ خطأ في البحث/إنشاء المورد:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async getAllSuppliers() {
    try {
      if (!Supplier) throw new Error('Supplier model not available');
      const suppliers = await Supplier.findAll({
        where: { isActive: true },
        order: [['name', 'ASC']],
        include: [
          {
            model: Invoice,
            as: 'invoices',
            attributes: ['id', 'totalAmount', 'status']
          },
          {
            model: Payment,
            as: 'payments',
            attributes: ['id', 'amount']
          }
        ]
      });
      return { success: true, data: suppliers };
    } catch (error) {
      console.error('❌ خطأ في جلب الموردين:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async updateSupplierStats(supplierId) {
    try {
      if (!Supplier || !Invoice || !Payment) throw new Error('Models not available');

      const supplier = await Supplier.findByPk(supplierId);
      if (!supplier) throw new Error('Supplier not found');

      // حساب الإحصائيات
      const invoiceStats = await Invoice.findAll({
        where: { supplierId },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalAmount']
        ],
        raw: true
      });

      const paymentStats = await Payment.findAll({
        where: { supplierId },
        attributes: [
          [sequelize.fn('SUM', sequelize.col('amount')), 'totalPaid']
        ],
        raw: true
      });

      const totalInvoices = parseInt(invoiceStats[0]?.count || 0);
      const totalAmount = parseFloat(invoiceStats[0]?.totalAmount || 0);
      const totalPaid = parseFloat(paymentStats[0]?.totalPaid || 0);
      const outstandingAmount = totalAmount - totalPaid;

      // تحديث المورد
      await supplier.update({
        totalInvoices,
        totalAmount,
        totalPaid,
        outstandingAmount
      });

      console.log(`📊 تم تحديث إحصائيات المورد: ${supplier.name}`);
      return { success: true, data: supplier };
    } catch (error) {
      console.error('❌ خطأ في تحديث إحصائيات المورد:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// ===================================================================
// خدمات الفواتير
// ===================================================================

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
        invoiceNumber: invoiceData.invoiceNumber,
        supplierId: supplier.id,
        supplierName: supplier.name,
        type: invoiceData.type,
        category: invoiceData.category,
        date: invoiceData.date,
        amountBeforeTax: parseFloat(invoiceData.amountBeforeTax) || 0,
        taxAmount: parseFloat(invoiceData.taxAmount) || 0,
        totalAmount: parseFloat(invoiceData.totalAmount) || 0,
        notes: invoiceData.notes,
        fileData: invoiceData.fileData,
        fileType: invoiceData.fileType,
        fileName: invoiceData.fileName,
        fileSize: invoiceData.fileSize,
        processedBy: invoiceData.processedBy
      });

      // تحديث إحصائيات المورد
      await SupplierService.updateSupplierStats(supplier.id);

      console.log(`📄 تم إنشاء فاتورة جديدة: ${invoiceData.invoiceNumber} للمورد: ${supplier.name}`);
      return { success: true, data: invoice };
    } catch (error) {
      console.error('❌ خطأ في إنشاء الفاتورة:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async getAllInvoices() {
    try {
      if (!Invoice) throw new Error('Invoice model not available');
      const invoices = await Invoice.findAll({
        include: [
          {
            model: Supplier,
            as: 'supplier',
            attributes: ['name', 'contactInfo']
          }
        ],
        order: [['createdAt', 'DESC']]
      });
      return { success: true, data: invoices };
    } catch (error) {
      console.error('❌ خطأ في جلب الفواتير:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async updateInvoice(id, updateData) {
    try {
      if (!Invoice) throw new Error('Invoice model not available');
      const [updatedRows] = await Invoice.update(updateData, { where: { id } });
      
      if (updatedRows > 0) {
        console.log(`📝 تم تحديث الفاتورة: ${id}`);
        return { success: true };
      } else {
        return { success: false, error: 'Invoice not found' };
      }
    } catch (error) {
      console.error('❌ خطأ في تحديث الفاتورة:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async deleteInvoice(id) {
    try {
      if (!Invoice) throw new Error('Invoice model not available');
      const deletedRows = await Invoice.destroy({ where: { id } });
      
      if (deletedRows > 0) {
        console.log(`🗑️ تم حذف الفاتورة: ${id}`);
        return { success: true };
      } else {
        return { success: false, error: 'Invoice not found' };
      }
    } catch (error) {
      console.error('❌ خطأ في حذف الفاتورة:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// ===================================================================
// خدمات الدفعات
// ===================================================================

export class PaymentService {
  static async createPayment(paymentData) {
    try {
      if (!Payment || !Supplier) throw new Error('Models not available');
      
      // البحث عن المورد أو إنشاؤه
      const supplierResult = await SupplierService.findOrCreateSupplier(paymentData.supplier);
      if (!supplierResult.success) throw new Error(supplierResult.error);

      const supplier = supplierResult.data;

      // إنشاء الدفعة
      const payment = await Payment.create({
        supplierId: supplier.id,
        supplierName: supplier.name,
        amount: parseFloat(paymentData.amount),
        date: paymentData.date,
        notes: paymentData.notes,
        processedBy: paymentData.processedBy
      });

      // تحديث إحصائيات المورد
      await SupplierService.updateSupplierStats(supplier.id);

      console.log(`💰 تم إنشاء دفعة جديدة: ${paymentData.amount} للمورد: ${supplier.name}`);
      return { success: true, data: payment };
    } catch (error) {
      console.error('❌ خطأ في إنشاء الدفعة:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async getPaymentsBySupplier(supplierName) {
    try {
      if (!Payment) throw new Error('Payment model not available');
      const payments = await Payment.findAll({
        where: { supplierName },
        order: [['date', 'DESC']]
      });
      return { success: true, data: payments };
    } catch (error) {
      console.error('❌ خطأ في جلب الدفعات:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async getAllPayments() {
    try {
      if (!Payment) throw new Error('Payment model not available');
      const payments = await Payment.findAll({
        include: [
          {
            model: Supplier,
            as: 'supplier',
            attributes: ['name', 'contactInfo']
          }
        ],
        order: [['date', 'DESC']]
      });
      return { success: true, data: payments };
    } catch (error) {
      console.error('❌ خطأ في جلب جميع الدفعات:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// ===================================================================
// خدمات أوامر الشراء
// ===================================================================

export class PurchaseOrderService {
  static async createPurchaseOrder(poData) {
    try {
      if (!PurchaseOrder || !Supplier) throw new Error('Models not available');
      
      // البحث عن المورد أو إنشاؤه
      const supplierResult = await SupplierService.findOrCreateSupplier(poData.supplier);
      if (!supplierResult.success) throw new Error(supplierResult.error);

      const supplier = supplierResult.data;

      // إنشاء معرف تلقائي إذا لم يتم تحديده
      let poId = poData.id;
      if (!poId) {
        const lastPO = await PurchaseOrder.findOne({
          order: [['createdAt', 'DESC']],
          attributes: ['id']
        });
        
        const lastNumber = lastPO ? parseInt(lastPO.id.split('-')[1]) : 0;
        poId = `PO-${String(lastNumber + 1).padStart(3, '0')}`;
      }

      // إنشاء أمر الشراء
      const purchaseOrder = await PurchaseOrder.create({
        id: poId,
        supplierId: supplier.id,
        supplierName: supplier.name,
        description: poData.description,
        price: parseFloat(poData.price),
        createdDate: poData.createdDate || new Date(),
        status: poData.status || 'active',
        pdfFile: poData.pdfFile,
        pdfFileName: poData.pdfFileName,
        processedBy: poData.processedBy
      });

      console.log(`📋 تم إنشاء أمر شراء جديد: ${poId} للمورد: ${supplier.name}`);
      return { success: true, data: purchaseOrder };
    } catch (error) {
      console.error('❌ خطأ في إنشاء أمر الشراء:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async getAllPurchaseOrders() {
    try {
      if (!PurchaseOrder) throw new Error('PurchaseOrder model not available');
      const purchaseOrders = await PurchaseOrder.findAll({
        include: [
          {
            model: Supplier,
            as: 'supplier',
            attributes: ['name', 'contactInfo']
          },
          {
            model: Invoice,
            as: 'linkedInvoice',
            attributes: ['id', 'invoiceNumber', 'totalAmount']
          }
        ],
        order: [['createdAt', 'DESC']]
      });
      return { success: true, data: purchaseOrders };
    } catch (error) {
      console.error('❌ خطأ في جلب أوامر الشراء:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async linkToInvoice(poId, invoiceId) {
    try {
      if (!PurchaseOrder) throw new Error('PurchaseOrder model not available');
      const [updatedRows] = await PurchaseOrder.update(
        { linkedInvoiceId: invoiceId },
        { where: { id: poId } }
      );
      
      if (updatedRows > 0) {
        console.log(`🔗 تم ربط أمر الشراء ${poId} بالفاتورة ${invoiceId}`);
        return { success: true };
      } else {
        return { success: false, error: 'Purchase order not found' };
      }
    } catch (error) {
      console.error('❌ خطأ في ربط أمر الشراء بالفاتورة:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// ===================================================================
// خدمات الجلسات
// ===================================================================

export class SessionService {
  static async createSession(sessionData) {
    try {
      if (!Session) throw new Error('Session model not available');
      const session = await Session.create(sessionData);
      console.log(`🔐 تم إنشاء جلسة جديدة: ${sessionData.username}`);
      return { success: true, data: session };
    } catch (error) {
      console.error('❌ خطأ في إنشاء الجلسة:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async findActiveSession(sessionId) {
    try {
      if (!Session) throw new Error('Session model not available');
      const session = await Session.findOne({
        where: {
          id: sessionId,
          isActive: true,
          expiresAt: { [Op.gt]: new Date() }
        },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['username', 'role', 'isActive']
          }
        ]
      });
      return { success: true, data: session };
    } catch (error) {
      console.error('❌ خطأ في البحث عن الجلسة:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async updateActivity(sessionId) {
    try {
      if (!Session) throw new Error('Session model not available');
      await Session.update(
        { lastActivity: new Date() },
        { where: { id: sessionId } }
      );
      return { success: true };
    } catch (error) {
      console.error('❌ خطأ في تحديث نشاط الجلسة:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async endSession(sessionId) {
    try {
      if (!Session) throw new Error('Session model not available');
      await Session.update(
        { isActive: false },
        { where: { id: sessionId } }
      );
      console.log(`🚪 تم إنهاء الجلسة: ${sessionId}`);
      return { success: true };
    } catch (error) {
      console.error('❌ خطأ في إنهاء الجلسة:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async cleanupExpiredSessions() {
    try {
      if (!Session) throw new Error('Session model not available');
      const deletedCount = await Session.destroy({
        where: {
          [Op.or]: [
            { expiresAt: { [Op.lt]: new Date() } },
            { isActive: false }
          ]
        }
      });
      
      if (deletedCount > 0) {
        console.log(`🧹 تم حذف ${deletedCount} جلسة منتهية الصلاحية`);
      }
      return { success: true, deletedCount };
    } catch (error) {
      console.error('❌ خطأ في تنظيف الجلسات:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async getActiveSessions() {
    try {
      if (!Session) throw new Error('Session model not available');
      const sessions = await Session.findAll({
        where: {
          isActive: true,
          expiresAt: { [Op.gt]: new Date() }
        },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['username', 'role']
          }
        ],
        order: [['lastActivity', 'DESC']]
      });
      return { success: true, data: sessions };
    } catch (error) {
      console.error('❌ خطأ في جلب الجلسات النشطة:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// ===================================================================
// خدمات الإحصائيات
// ===================================================================

export class StatsService {
  static async getSystemStats() {
    try {
      if (!isConnected) {
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

      const [
        userCount,
        supplierCount,
        invoiceCount,
        paymentCount,
        poCount,
        sessionCount,
        invoiceAmountResult,
        paymentAmountResult
      ] = await Promise.all([
        User ? User.count({ where: { isActive: true } }) : 0,
        Supplier ? Supplier.count({ where: { isActive: true } }) : 0,
        Invoice ? Invoice.count() : 0,
        Payment ? Payment.count() : 0,
        PurchaseOrder ? PurchaseOrder.count() : 0,
        Session ? Session.count({
          where: {
            isActive: true,
            expiresAt: { [Op.gt]: new Date() }
          }
        }) : 0,
        Invoice ? Invoice.sum('totalAmount') : 0,
        Payment ? Payment.sum('amount') : 0
      ]);

      const totalInvoiceAmount = invoiceAmountResult || 0;
      const totalPaymentAmount = paymentAmountResult || 0;
      const outstandingAmount = totalInvoiceAmount - totalPaymentAmount;

      return {
        success: true,
        data: {
          users: userCount,
          suppliers: supplierCount,
          invoices: invoiceCount,
          payments: paymentCount,
          purchaseOrders: poCount,
          activeSessions: sessionCount,
          totalInvoiceAmount: parseFloat(totalInvoiceAmount),
          totalPaymentAmount: parseFloat(totalPaymentAmount),
          outstandingAmount: parseFloat(outstandingAmount)
        }
      };
    } catch (error) {
      console.error('❌ خطأ في جلب الإحصائيات:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async getSupplierStats() {
    try {
      if (!Supplier || !Invoice || !Payment) throw new Error('Models not available');
      
      const suppliers = await Supplier.findAll({
        where: { isActive: true },
        include: [
          {
            model: Invoice,
            as: 'invoices',
            attributes: [
              [sequelize.fn('COUNT', sequelize.col('invoices.id')), 'invoiceCount'],
              [sequelize.fn('SUM', sequelize.col('invoices.totalAmount')), 'totalInvoiceAmount']
            ]
          },
          {
            model: Payment,
            as: 'payments',
            attributes: [
              [sequelize.fn('SUM', sequelize.col('payments.amount')), 'totalPaymentAmount']
            ]
          }
        ],
        group: ['Supplier.id'],
        order: [['totalAmount', 'DESC']]
      });

      return { success: true, data: suppliers };
    } catch (error) {
      console.error('❌ خطأ في جلب إحصائيات الموردين:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// ===================================================================
// دالة التهيئة الرئيسية
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

    // تنظيف الجلسات المنتهية
    await SessionService.cleanupExpiredSessions();

    isConnected = true;
    console.log('🎉 تم تهيئة قاعدة البيانات بنجاح!');
    return true;
  } catch (error) {
    console.error('❌ خطأ في تهيئة PostgreSQL:', error.message);
    console.log('🔄 سيتم استخدام localStorage كـ fallback');
    isConnected = false;
    return false;
  }
};

// تصدير النماذج والوظائف
export {
  sequelize,
  isConnected,
  User,
  Supplier,
  Invoice,
  Payment,
  PurchaseOrder,
  Session,
  Op
};

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
