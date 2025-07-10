// server.js - نظام ERP مع دعم PostgreSQL + localStorage
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// تحميل خدمات قاعدة البيانات
import {
  UserService,
  SessionService,
  SupplierService,
  InvoiceService,
  PaymentService,
  PurchaseOrderService,
  StatsService,
  initializeDatabase
} from './services/DatabaseService.js';

// إعداد المجلدات
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// تحميل متغيرات البيئة
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// ===================================================================
// إعداد التطبيق الأساسي
// ===================================================================

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// إعداد multer لرفع الملفات
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. يرجى رفع ملف PDF أو صورة فقط.'));
    }
  }
});

// ===================================================================
// إعداد قاعدة البيانات والنظام المختلط
// ===================================================================

let DATABASE_AVAILABLE = false;
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 دقيقة

// خريطة الجلسات (fallback)
const activeSessions = new Map();

// المستخدمين المسجلين
const USERS = new Map();

// تحميل المستخدمين من متغيرات البيئة
function loadUsersFromEnv() {
  const users = [
    process.env.USER_1,
    process.env.USER_2,
    process.env.DEFAULT_ADMIN_USERNAME && process.env.DEFAULT_ADMIN_PASSWORD
      ? `${process.env.DEFAULT_ADMIN_USERNAME}:${process.env.DEFAULT_ADMIN_PASSWORD}:admin`
      : null
  ].filter(Boolean);

  users.forEach(userStr => {
    if (userStr && userStr.includes(':')) {
      const [username, password, role = 'user'] = userStr.split(':');
      if (username && password) {
        USERS.set(username, { username, password, role });
      }
    }
  });

  // مستخدم افتراضي للتطوير
  if (USERS.size === 0) {
    USERS.set('admin', { username: 'admin', password: 'admin123', role: 'admin' });
    console.log('⚠️ تم إنشاء مستخدم admin افتراضي: admin/admin123');
  }

  console.log(`✅ تم تحميل ${USERS.size} مستخدم`);
}

// تهيئة قاعدة البيانات
async function initializeSystem() {
  try {
    console.log('🚀 بدء تهيئة النظام...');
    
    // تحميل المستخدمين
    loadUsersFromEnv();

    // محاولة تهيئة PostgreSQL
    try {
      const dbInitialized = await initializeDatabase();
      if (dbInitialized) {
        DATABASE_AVAILABLE = true;
        console.log('✅ PostgreSQL متاح ومتصل');
        
        // إنشاء المستخدمين في قاعدة البيانات
        for (const [username, userData] of USERS) {
          const userResult = await UserService.findUser({ username });
          if (!userResult.success || !userResult.data) {
            await UserService.createUser({
              username: userData.username,
              passwordHash: userData.password, // سيتم تشفيره لاحقاً
              role: userData.role
            });
            console.log(`👤 تم إنشاء مستخدم في قاعدة البيانات: ${username}`);
          }
        }
      }
    } catch (error) {
      console.error('❌ فشل الاتصال بـ PostgreSQL:', error.message);
      console.log('🔄 سيتم استخدام localStorage كـ fallback');
      DATABASE_AVAILABLE = false;
    }

    console.log('✅ تم تهيئة النظام بنجاح');
    console.log(`📊 وضع قاعدة البيانات: ${DATABASE_AVAILABLE ? 'PostgreSQL' : 'localStorage'}`);
    
  } catch (error) {
    console.error('❌ خطأ في تهيئة النظام:', error.message);
    DATABASE_AVAILABLE = false;
  }
}

// ===================================================================
// دوال مساعدة للجلسات
// ===================================================================

function generateSessionToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

async function createSession(username, role, req) {
  const token = generateSessionToken();
  const sessionData = {
    username,
    role,
    token,
    loginTime: new Date().toISOString(),
    lastActivity: new Date(),
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  };

  if (DATABASE_AVAILABLE) {
    try {
      // البحث عن المستخدم أولاً
      const userResult = await UserService.findUser({ username });
      if (userResult.success && userResult.data) {
        sessionData.userId = userResult.data.id;
        const result = await SessionService.createSession(sessionData);
        if (result.success) {
          await UserService.updateLastLogin(userResult.data.id);
          return token;
        }
      }
    } catch (error) {
      console.error('❌ خطأ في إنشاء جلسة PostgreSQL:', error.message);
    }
  }

  // fallback إلى الذاكرة
  activeSessions.set(token, {
    ...sessionData,
    loginTime: new Date().toISOString(),
    lastActivity: Date.now()
  });
  return token;
}

async function validateSession(token) {
  if (!token) return null;

  if (DATABASE_AVAILABLE) {
    try {
      const result = await SessionService.findActiveSession(token);
      if (result.success && result.data) {
        await SessionService.updateActivity(result.data.id);
        return {
          username: result.data.username,
          role: result.data.user?.role || 'user'
        };
      }
    } catch (error) {
      console.error('❌ خطأ في التحقق من الجلسة PostgreSQL:', error.message);
    }
  }

  // fallback إلى الذاكرة
  const session = activeSessions.get(token);
  if (session && (Date.now() - session.lastActivity) < SESSION_TIMEOUT) {
    session.lastActivity = Date.now();
    return { username: session.username, role: session.role };
  }

  // إزالة الجلسة المنتهية
  activeSessions.delete(token);
  return null;
}

async function endSession(token) {
  if (DATABASE_AVAILABLE) {
    try {
      await SessionService.endSession(token);
    } catch (error) {
      console.error('❌ خطأ في إنهاء جلسة PostgreSQL:', error.message);
    }
  }
  activeSessions.delete(token);
}

// ===================================================================
// دوال مساعدة للبيانات
// ===================================================================

// تحويل البيانات بين localStorage و PostgreSQL
function convertInvoiceData(invoice, isFromDB = false) {
  if (isFromDB) {
    // من قاعدة البيانات إلى تنسيق الواجهة
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      supplier: invoice.supplierName,
      type: invoice.type,
      category: invoice.category,
      date: invoice.date,
      amountBeforeTax: parseFloat(invoice.amountBeforeTax),
      taxAmount: parseFloat(invoice.taxAmount),
      totalAmount: parseFloat(invoice.totalAmount),
      notes: invoice.notes,
      fileData: invoice.fileData,
      fileType: invoice.fileType,
      fileName: invoice.fileName,
      fileSize: invoice.fileSize,
      processedBy: invoice.processedBy,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt
    };
  } else {
    // من الواجهة إلى قاعدة البيانات
    return {
      invoiceNumber: invoice.invoiceNumber,
      supplier: invoice.supplier,
      type: invoice.type,
      category: invoice.category,
      date: invoice.date,
      amountBeforeTax: parseFloat(invoice.amountBeforeTax) || 0,
      taxAmount: parseFloat(invoice.taxAmount) || 0,
      totalAmount: parseFloat(invoice.totalAmount) || 0,
      notes: invoice.notes,
      fileData: invoice.fileData,
      fileType: invoice.fileType,
      fileName: invoice.fileName,
      fileSize: invoice.fileSize,
      processedBy: invoice.processedBy
    };
  }
}

// ===================================================================
// Middleware للمصادقة
// ===================================================================

async function authenticateUser(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.cookies?.sessionToken ||
                  req.headers['x-session-token'];

    const user = await validateSession(token);
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'غير مصرح. يرجى تسجيل الدخول مرة أخرى.' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('❌ خطأ في المصادقة:', error.message);
    res.status(500).json({ success: false, error: 'خطأ في الخادم' });
  }
}

// ===================================================================
// مسارات المصادقة
// ===================================================================

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'اسم المستخدم وكلمة المرور مطلوبان' 
      });
    }

    // التحقق من المستخدم
    const userData = USERS.get(username);
    if (!userData || userData.password !== password) {
      return res.status(401).json({ 
        success: false, 
        error: 'اسم المستخدم أو كلمة المرور غير صحيح' 
      });
    }

    // إنشاء جلسة
    const token = await createSession(username, userData.role, req);

    console.log(`✅ تسجيل دخول ناجح: ${username} (${userData.role})`);

    res.json({
      success: true,
      data: {
        username,
        role: userData.role,
        token
      }
    });

  } catch (error) {
    console.error('❌ خطأ في تسجيل الدخول:', error.message);
    res.status(500).json({ success: false, error: 'خطأ في الخادم' });
  }
});

// تسجيل الخروج
app.post('/api/logout', authenticateUser, async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.cookies?.sessionToken ||
                  req.headers['x-session-token'];

    await endSession(token);
    console.log(`✅ تسجيل خروج: ${req.user.username}`);

    res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
  } catch (error) {
    console.error('❌ خطأ في تسجيل الخروج:', error.message);
    res.status(500).json({ success: false, error: 'خطأ في الخادم' });
  }
});

// التحقق من الجلسة
app.get('/api/verify', authenticateUser, (req, res) => {
  res.json({
    success: true,
    data: {
      username: req.user.username,
      role: req.user.role,
      databaseMode: DATABASE_AVAILABLE ? 'PostgreSQL' : 'localStorage'
    }
  });
});

// ===================================================================
// مسارات الفواتير
// ===================================================================

// رفع وتحليل فاتورة
app.post('/api/upload', authenticateUser, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'لم يتم رفع أي ملف' });
    }

    // قراءة الملف وتحويله إلى base64
    const fileBuffer = fs.readFileSync(req.file.path);
    const fileData = fileBuffer.toString('base64');

    // حذف الملف المؤقت
    fs.unlinkSync(req.file.path);

    // إرجاع بيانات الملف
    res.json({
      success: true,
      data: {
        fileData: `data:${req.file.mimetype};base64,${fileData}`,
        fileType: req.file.mimetype,
        fileName: req.file.originalname,
        fileSize: req.file.size
      }
    });

  } catch (error) {
    console.error('❌ خطأ في رفع الملف:', error.message);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ success: false, error: 'خطأ في رفع الملف' });
  }
});

// حفظ فاتورة جديدة
app.post('/api/invoice', authenticateUser, async (req, res) => {
  try {
    const invoiceData = {
      ...req.body,
      processedBy: req.user.username
    };

    if (DATABASE_AVAILABLE) {
      try {
        const dbData = convertInvoiceData(invoiceData, false);
        const result = await InvoiceService.createInvoice(dbData);
        
        if (result.success) {
          console.log(`✅ تم حفظ فاتورة في PostgreSQL: ${invoiceData.invoiceNumber}`);
          return res.json({
            success: true,
            data: convertInvoiceData(result.data, true),
            source: 'PostgreSQL'
          });
        }
      } catch (error) {
        console.error('❌ خطأ في حفظ الفاتورة PostgreSQL:', error.message);
      }
    }

    // fallback إلى localStorage (سيتم التعامل معه في الواجهة)
    console.log(`✅ تم حفظ فاتورة: ${invoiceData.invoiceNumber} (${req.user.username})`);
    res.json({
      success: true,
      data: invoiceData,
      source: 'localStorage'
    });

  } catch (error) {
    console.error('❌ خطأ في حفظ الفاتورة:', error.message);
    res.status(500).json({ success: false, error: 'خطأ في حفظ الفاتورة' });
  }
});

// جلب جميع الفواتير
app.get('/api/invoices', authenticateUser, async (req, res) => {
  try {
    if (DATABASE_AVAILABLE) {
      try {
        const result = await InvoiceService.getAllInvoices();
        if (result.success) {
          const invoices = result.data.map(invoice => convertInvoiceData(invoice, true));
          return res.json({
            success: true,
            data: invoices,
            source: 'PostgreSQL'
          });
        }
      } catch (error) {
        console.error('❌ خطأ في جلب الفواتير PostgreSQL:', error.message);
      }
    }

    // fallback إلى localStorage
    res.json({
      success: true,
      data: [],
      source: 'localStorage',
      message: 'سيتم جلب البيانات من localStorage في الواجهة'
    });

  } catch (error) {
    console.error('❌ خطأ في جلب الفواتير:', error.message);
    res.status(500).json({ success: false, error: 'خطأ في جلب الفواتير' });
  }
});

// ===================================================================
// مسارات الدفعات
// ===================================================================

// إضافة دفعة جديدة
app.post('/api/payment', authenticateUser, async (req, res) => {
  try {
    const paymentData = {
      ...req.body,
      processedBy: req.user.username
    };

    if (DATABASE_AVAILABLE) {
      try {
        const result = await PaymentService.createPayment(paymentData);
        if (result.success) {
          console.log(`✅ تم حفظ دفعة في PostgreSQL: ${paymentData.supplier}`);
          return res.json({
            success: true,
            data: result.data,
            source: 'PostgreSQL'
          });
        }
      } catch (error) {
        console.error('❌ خطأ في حفظ الدفعة PostgreSQL:', error.message);
      }
    }

    // fallback إلى localStorage
    console.log(`✅ تم حفظ دفعة: ${paymentData.supplier} (${req.user.username})`);
    res.json({
      success: true,
      data: paymentData,
      source: 'localStorage'
    });

  } catch (error) {
    console.error('❌ خطأ في حفظ الدفعة:', error.message);
    res.status(500).json({ success: false, error: 'خطأ في حفظ الدفعة' });
  }
});

// جلب دفعات مورد معين
app.get('/api/payments/:supplier', authenticateUser, async (req, res) => {
  try {
    const supplierName = decodeURIComponent(req.params.supplier);

    if (DATABASE_AVAILABLE) {
      try {
        const result = await PaymentService.getPaymentsBySupplier(supplierName);
        if (result.success) {
          return res.json({
            success: true,
            data: result.data,
            source: 'PostgreSQL'
          });
        }
      } catch (error) {
        console.error('❌ خطأ في جلب الدفعات PostgreSQL:', error.message);
      }
    }

    // fallback إلى localStorage
    res.json({
      success: true,
      data: [],
      source: 'localStorage'
    });

  } catch (error) {
    console.error('❌ خطأ في جلب الدفعات:', error.message);
    res.status(500).json({ success: false, error: 'خطأ في جلب الدفعات' });
  }
});

// ===================================================================
// مسارات أوامر الشراء
// ===================================================================

// إضافة أمر شراء جديد
app.post('/api/purchase-order', authenticateUser, async (req, res) => {
  try {
    const poData = {
      ...req.body,
      processedBy: req.user.username
    };

    if (DATABASE_AVAILABLE) {
      try {
        const result = await PurchaseOrderService.createPurchaseOrder(poData);
        if (result.success) {
          console.log(`✅ تم حفظ أمر شراء في PostgreSQL: ${result.data.id}`);
          return res.json({
            success: true,
            data: result.data,
            source: 'PostgreSQL'
          });
        }
      } catch (error) {
        console.error('❌ خطأ في حفظ أمر الشراء PostgreSQL:', error.message);
      }
    }

    // fallback إلى localStorage
    console.log(`✅ تم حفظ أمر شراء: ${poData.id || 'جديد'} (${req.user.username})`);
    res.json({
      success: true,
      data: poData,
      source: 'localStorage'
    });

  } catch (error) {
    console.error('❌ خطأ في حفظ أمر الشراء:', error.message);
    res.status(500).json({ success: false, error: 'خطأ في حفظ أمر الشراء' });
  }
});

// جلب جميع أوامر الشراء
app.get('/api/purchase-orders', authenticateUser, async (req, res) => {
  try {
    if (DATABASE_AVAILABLE) {
      try {
        const result = await PurchaseOrderService.getAllPurchaseOrders();
        if (result.success) {
          return res.json({
            success: true,
            data: result.data,
            source: 'PostgreSQL'
          });
        }
      } catch (error) {
        console.error('❌ خطأ في جلب أوامر الشراء PostgreSQL:', error.message);
      }
    }

    // fallback إلى localStorage
    res.json({
      success: true,
      data: [],
      source: 'localStorage'
    });

  } catch (error) {
    console.error('❌ خطأ في جلب أوامر الشراء:', error.message);
    res.status(500).json({ success: false, error: 'خطأ في جلب أوامر الشراء' });
  }
});

// ===================================================================
// مسارات الإحصائيات
// ===================================================================

// إحصائيات عامة
app.get('/api/stats', authenticateUser, async (req, res) => {
  try {
    if (DATABASE_AVAILABLE) {
      try {
        const result = await StatsService.getSystemStats();
        if (result.success) {
          return res.json({
            success: true,
            data: result.data,
            source: 'PostgreSQL'
          });
        }
      } catch (error) {
        console.error('❌ خطأ في جلب الإحصائيات PostgreSQL:', error.message);
      }
    }

    // fallback - إحصائيات أساسية
    res.json({
      success: true,
      data: {
        users: USERS.size,
        suppliers: 0,
        invoices: 0,
        payments: 0,
        purchaseOrders: 0,
        activeSessions: activeSessions.size,
        totalInvoiceAmount: 0,
        totalPaymentAmount: 0,
        outstandingAmount: 0
      },
      source: 'localStorage'
    });

  } catch (error) {
    console.error('❌ خطأ في جلب الإحصائيات:', error.message);
    res.status(500).json({ success: false, error: 'خطأ في جلب الإحصائيات' });
  }
});

// ===================================================================
// مسارات الإدارة (للمشرفين فقط)
// ===================================================================

// لوحة تحكم الإدارة
app.get('/admin', authenticateUser, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).send('⛔ غير مصرح لك بالوصول لهذه الصفحة');
    }

    // جلب إحصائيات شاملة
    let stats = {};
    if (DATABASE_AVAILABLE) {
      try {
        const result = await StatsService.getSystemStats();
        stats = result.success ? result.data : {};
      } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات الإدارة:', error.message);
      }
    }

    // معلومات الجلسات النشطة
    const sessions = [];
    for (const [token, session] of activeSessions) {
      sessions.push({
        username: session.username,
        role: session.role || 'user',
        loginTime: new Date(session.loginTime).toLocaleString('ar-SA'),
        lastActivity: new Date(session.lastActivity).toLocaleString('ar-SA'),
        timeLeft: Math.max(0, Math.floor((SESSION_TIMEOUT - (Date.now() - session.lastActivity)) / (1000 * 60)))
      });
    }

    // معلومات المستخدمين
    const users = Array.from(USERS.values()).map(user => ({
      username: user.username,
      role: user.role,
      lastLogin: '-',
      loginCount: 0
    }));

    const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🛡️ لوحة تحكم الإدارة</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
          .card { background: white; padding: 20px; margin: 10px 0; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin: 20px 0; }
          .stat-item { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 20px; border-radius: 10px; text-align: center; }
          .stat-item h3 { margin: 0; font-size: 2em; }
          .stat-item p { margin: 5px 0 0 0; opacity: 0.9; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { padding: 12px; text-align: center; border: 1px solid #ddd; }
          th { background: #34495e; color: white; }
          .online { color: #27ae60; font-weight: bold; }
          .admin { color: #e74c3c; font-weight: bold; }
          .user { color: #3498db; }
          .btn { padding: 10px 20px; margin: 5px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; display: inline-block; }
          .btn-danger { background: #e74c3c; color: white; }
          .btn-primary { background: #3498db; color: white; }
          .db-status { background: #27ae60; color: white; padding: 5px 10px; border-radius: 5px; font-size: 12px; }
          .warning { background: #f39c12; color: white; padding: 10px; border-radius: 5px; margin: 10px 0; }
        </style>
        <script>
          setInterval(() => window.location.reload(), 60000); // تحديث كل دقيقة
        </script>
      </head>
      <body>
        <div class="header">
          <h1>🛡️ لوحة تحكم الإدارة</h1>
          <p>مرحباً ${req.user.username} - آخر تحديث: ${new Date().toLocaleString('ar-SA')} <span class="db-status">${DATABASE_AVAILABLE ? '🗄️ PostgreSQL' : '💾 localStorage'}</span></p>
        </div>
        
        ${!DATABASE_AVAILABLE ? '<div class="warning">⚠️ تحذير: النظام يعمل بوضع localStorage. تحقق من اتصال قاعدة البيانات.</div>' : ''}
        
        <div class="card">
          <h2>📊 إحصائيات النظام الشاملة</h2>
          <div class="stats-grid">
            <div class="stat-item">
              <h3>${users.length}</h3>
              <p>إجمالي المستخدمين</p>
            </div>
            <div class="stat-item">
              <h3>${sessions.length}</h3>
              <p>الجلسات النشطة</p>
            </div>
            <div class="stat-item">
              <h3>${stats.invoices || 0}</h3>
              <p>إجمالي الفواتير</p>
            </div>
            <div class="stat-item">
              <h3>${(stats.totalInvoiceAmount || 0).toLocaleString('ar-SA')} ر.س</h3>
              <p>إجمالي قيمة الفواتير</p>
            </div>
            <div class="stat-item">
              <h3>${(stats.totalPaymentAmount || 0).toLocaleString('ar-SA')} ر.س</h3>
              <p>إجمالي المدفوعات</p>
            </div>
            <div class="stat-item">
              <h3>${(stats.outstandingAmount || 0).toLocaleString('ar-SA')} ر.س</h3>
              <p>المبالغ المستحقة</p>
            </div>
            <div class="stat-item">
              <h3>${stats.suppliers || 0}</h3>
              <p>عدد الموردين</p>
            </div>
            <div class="stat-item">
              <h3>${stats.purchaseOrders || 0}</h3>
              <p>أوامر الشراء</p>
            </div>
          </div>
        </div>
        
        <div class="card">
          <h2>👥 المستخدمين المسجلين</h2>
          <table>
            <tr><th>اسم المستخدم</th><th>الصلاحية</th><th>آخر تسجيل دخول</th><th>عدد مرات الدخول</th><th>الحالة</th></tr>
            ${users.map(user => {
              const isOnline = sessions.some(s => s.username === user.username);
              return `<tr>
                <td>${user.username}</td>
                <td class="${user.role}">${user.role}</td>
                <td>${user.lastLogin}</td>
                <td>${user.loginCount}</td>
                <td class="${isOnline ? 'online' : ''}">${isOnline ? '🟢 نشط' : '⚫ غير نشط'}</td>
              </tr>`;
            }).join('')}
          </table>
        </div>
        
        <div class="card">
          <h2>🔐 الجلسات النشطة</h2>
          <table>
            <tr><th>المستخدم</th><th>الصلاحية</th><th>وقت الدخول</th><th>آخر نشاط</th><th>الوقت المتبقي</th></tr>
            ${sessions.map(session => `
              <tr>
                <td>${session.username}</td>
                <td class="${session.role}">${session.role}</td>
                <td>${session.loginTime}</td>
                <td>${session.lastActivity}</td>
                <td>${session.timeLeft} دقيقة</td>
              </tr>
            `).join('')}
          </table>
        </div>
        
        <div class="card">
          <h2>🔧 الإجراءات</h2>
          <a href="/" class="btn btn-primary">الصفحة الرئيسية</a>
          <a href="/debug" class="btn btn-primary">معلومات تقنية</a>
        </div>
      </body>
    </html>`;

    res.send(html);

  } catch (error) {
    console.error('❌ خطأ في لوحة تحكم الإدارة:', error.message);
    res.status(500).send('خطأ في الخادم');
  }
});

// معلومات تقنية مفصلة
app.get('/debug', authenticateUser, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'غير مصرح' });
  }

  const debugInfo = {
    timestamp: new Date().toISOString(),
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      uptime: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      port: port,
      environment: process.env.NODE_ENV || 'development'
    },
    database: {
      available: DATABASE_AVAILABLE,
      type: DATABASE_AVAILABLE ? 'PostgreSQL' : 'localStorage',
      url: process.env.DATABASE_URL ? 'متصل' : 'غير محدد'
    },
    authentication: {
      registeredUsers: USERS.size,
      activeSessions: activeSessions.size,
      sessionTimeout: SESSION_TIMEOUT / 1000 / 60 + ' دقيقة'
    },
    features: {
      fileUpload: 'مفعل',
      cors: 'مفعل',
      staticFiles: 'مفعل',
      adminPanel: 'مفعل'
    }
  };

  res.json(debugInfo);
});

// ===================================================================
// معالج الأخطاء العام
// ===================================================================

app.use((error, req, res, next) => {
  console.error('❌ خطأ غير متوقع:', error);
  res.status(500).json({
    success: false,
    error: error.message || 'خطأ في الخادم'
  });
});

// معالج 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'المسار غير موجود'
  });
});

// ===================================================================
// تنظيف الجلسات المنتهية
// ===================================================================

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of activeSessions) {
    if ((now - session.lastActivity) > SESSION_TIMEOUT) {
      activeSessions.delete(token);
      console.log(`🧹 تم حذف جلسة منتهية: ${session.username}`);
    }
  }
}, 5 * 60 * 1000); // كل 5 دقائق

// ===================================================================
// إنشاء مجلد uploads وبدء الخادم
// ===================================================================

// إنشاء مجلد uploads إذا لم يكن موجود
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// تهيئة النظام وبدء الخادم
initializeSystem().then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`\n🎉 نظام ERP متعدد المستخدمين بدأ بنجاح!`);
    console.log(`✅ المنفذ: ${port}`);
    console.log(`👥 المستخدمين المسجلين: ${USERS.size}`);
    console.log(`🔐 مهلة الجلسة: ${SESSION_TIMEOUT / 1000 / 60} دقيقة`);
    console.log(`🗄️ قاعدة البيانات: ${DATABASE_AVAILABLE ? 'PostgreSQL (متصل)' : 'localStorage (fallback)'}`);
    console.log(`🔧 البيئة: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 الرابط: http://localhost:${port}`);
    console.log(`🛡️ لوحة الإدارة: http://localhost:${port}/admin`);
    
    if (!DATABASE_AVAILABLE) {
      console.log(`⚠️ تحذير: PostgreSQL غير متاح. النظام يعمل بوضع localStorage`);
      console.log(`🔧 للتفعيل: تحقق من متغير DATABASE_URL في Railway`);
    }
  });
}).catch(error => {
  console.error('❌ فشل في تهيئة النظام:', error);
  process.exit(1);
});
