// server.js - نظام ERP مع Basic Authentication + PostgreSQL + localStorage
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
// إعداد المصادقة
// ===================================================================

// المستخدمين المسجلين
const USERS = new Map();

// تحميل المستخدمين من متغيرات البيئة
function loadUsersFromEnv() {
  const users = [
    process.env.USER_1,
    process.env.USER_2
  ].filter(Boolean);

  users.forEach(userStr => {
    if (userStr && userStr.includes(':')) {
      const [username, password, role = 'user'] = userStr.split(':');
      if (username && password) {
        USERS.set(username, { username, password, role });
      }
    }
  });

  // مستخدم افتراضي فقط إذا لم توجد متغيرات البيئة
  if (USERS.size === 0) {
    console.log('⚠️ لم يتم العثور على USER_1 أو USER_2 في متغيرات البيئة');
    console.log('📝 يرجى إضافة USER_1 و USER_2 في Railway Variables');
    USERS.set('admin', { username: 'admin', password: 'temp123', role: 'admin' });
    console.log('⚠️ تم إنشاء مستخدم مؤقت: admin/temp123');
  }

  console.log(`✅ تم تحميل ${USERS.size} مستخدم`);
}

// Basic Authentication Middleware
const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    res.set('WWW-Authenticate', 'Basic realm="ERP System"');
    return res.status(401).send(`
      <html>
        <head>
          <title>Login Required</title>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
            h1 { color: #667eea; margin-bottom: 20px; }
            p { color: #666; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔒 نظام ERP محمي</h1>
            <p>يرجى إدخال اسم المستخدم وكلمة المرور</p>
            <p style="color: #999; font-size: 14px;">سيتم طلب تسجيل الدخول تلقائياً</p>
          </div>
        </body>
      </html>
    `);
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');

  const userData = USERS.get(username);
  if (userData && userData.password === password) {
    console.log(`✅ تسجيل دخول ناجح: ${username} (${userData.role})`);
    req.user = { username: userData.username, role: userData.role };
    next();
  } else {
    console.log(`❌ محاولة تسجيل دخول فاشلة: ${username}`);
    res.set('WWW-Authenticate', 'Basic realm="ERP System"');
    return res.status(401).send(`
      <html>
        <head>
          <title>Login Error</title>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
            h1 { color: #e74c3c; margin-bottom: 20px; }
            button { background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ خطأ في تسجيل الدخول</h1>
            <p>اسم المستخدم أو كلمة المرور غير صحيحة</p>
            <button onclick="location.reload()">إعادة المحاولة</button>
          </div>
        </body>
      </html>
    `);
  }
};

// ===================================================================
// إعداد قاعدة البيانات والنظام المختلط
// ===================================================================

let DATABASE_AVAILABLE = false;

// تهيئة النظام
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
              passwordHash: userData.password,
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
// إعداد التطبيق الأساسي
// ===================================================================

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// تطبيق الحماية على جميع المسارات (ما عدا health check)
app.use((req, res, next) => {
  // السماح بـ health check بدون حماية للـ Railway
  if (req.path === '/health') {
    return next();
  }
  
  // تطبيق الحماية على باقي المسارات
  authenticateUser(req, res, next);
});

// صفحات ثابتة
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
// مسارات الصفحات الأساسية
// ===================================================================

// الصفحة الرئيسية - توجيه إلى home.html
app.get('/', (req, res) => {
  try {
    const homePath = path.join(__dirname, 'public', 'home.html');
    if (fs.existsSync(homePath)) {
      res.sendFile(homePath);
    } else {
      res.send(`
        <html>
        <head>
          <title>نظام ERP</title>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px; background: #f5f5f5; }
            .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            h1 { color: #667eea; }
            .status { background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 10px 0; }
            a { color: #667eea; text-decoration: none; margin-right: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🎉 مرحباً بك في نظام ERP</h1>
            <div class="status">
              <p>✅ تم تسجيل الدخول بنجاح: ${req.user.username} (${req.user.role})</p>
              <p>📊 قاعدة البيانات: ${DATABASE_AVAILABLE ? 'PostgreSQL متصل' : 'localStorage fallback'}</p>
            </div>
            <p>ملف home.html غير موجود في مجلد public</p>
            <hr>
            <p>
              <a href="/add.html">إضافة فاتورة</a>
              <a href="/view.html">عرض الفواتير</a>
              <a href="/purchase-orders.html">أوامر الشراء</a>
            </p>
            <p>
              <a href="/admin">لوحة الإدارة</a>
              <a href="/ping">اختبار الخادم</a>
            </p>
          </div>
        </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Error serving home page:', error);
    res.status(500).send('خطأ في تحميل الصفحة الرئيسية');
  }
});

// نقطة فحص الخادم
app.get('/ping', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running and protected!',
    timestamp: new Date().toISOString(),
    port: port,
    user: req.user.username,
    role: req.user.role,
    database: DATABASE_AVAILABLE ? 'PostgreSQL' : 'localStorage',
    users: USERS.size
  });
});

// Health check للـ Railway (بدون حماية)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// ===================================================================
// دوال مساعدة للبيانات
// ===================================================================

// تحويل البيانات بين localStorage و PostgreSQL
function convertInvoiceData(invoice, isFromDB = false) {
  if (isFromDB) {
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
// مسارات الفواتير
// ===================================================================

// رفع وتحليل فاتورة
app.post('/api/upload', upload.single('file'), async (req, res) => {
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
app.post('/api/invoice', async (req, res) => {
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
app.get('/api/invoices', async (req, res) => {
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
app.post('/api/payment', async (req, res) => {
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
app.get('/api/payments/:supplier', async (req, res) => {
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
app.post('/api/purchase-order', async (req, res) => {
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
app.get('/api/purchase-orders', async (req, res) => {
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
app.get('/api/stats', async (req, res) => {
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
        activeSessions: 0,
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
app.get('/admin', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).send(`
        <html>
          <head>
            <title>غير مصرح</title>
            <meta charset="utf-8">
            <style>
              body { font-family: 'Segoe UI', Tahoma, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
              .container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
              h1 { color: #e74c3c; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>⛔ غير مصرح لك بالوصول</h1>
              <p>هذه الصفحة مخصصة للمشرفين فقط</p>
              <a href="/">العودة للصفحة الرئيسية</a>
            </div>
          </body>
        </html>
      `);
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
          .admin { color: #e74c3c; font-weight: bold; }
          .user { color: #3498db; }
          .btn { padding: 10px 20px; margin: 5px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; display: inline-block; }
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
          <h2>📊 إحصائيات النظام</h2>
          <div class="stats-grid">
            <div class="stat-item">
              <h3>${users.length}</h3>
              <p>إجمالي المستخدمين</p>
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
              <h3>${(stats.outstandingAmount || 0).toLocaleString('ar-SA')} ر.س</h3>
              <p>المبالغ المستحقة</p>
            </div>
          </div>
        </div>
        
        <div class="card">
          <h2>👥 المستخدمين المسجلين</h2>
          <table>
            <tr><th>اسم المستخدم</th><th>الصلاحية</th><th>الحالة</th></tr>
            ${users.map(user => `
              <tr>
                <td>${user.username}</td>
                <td class="${user.role}">${user.role}</td>
                <td>✅ مُسجل</td>
              </tr>
            `).join('')}
          </table>
        </div>
        
        <div class="card">
          <h2>🔧 الإجراءات</h2>
          <a href="/" class="btn btn-primary">الصفحة الرئيسية</a>
          <a href="/ping" class="btn btn-primary">معلومات تقنية</a>
        </div>
      </body>
    </html>`;

    res.send(html);

  } catch (error) {
    console.error('❌ خطأ في لوحة تحكم الإدارة:', error.message);
    res.status(500).send('خطأ في الخادم');
  }
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
// إنشاء مجلد uploads وبدء الخادم
// ===================================================================

// إنشاء مجلد uploads إذا لم يكن موجود
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// تهيئة النظام وبدء الخادم
initializeSystem().then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`\n🎉 نظام ERP محمي بدأ بنجاح!`);
    console.log(`✅ المنفذ: ${port}`);
    console.log(`🔐 نظام الحماية: Basic Authentication`);
    console.log(`👥 المستخدمين المسجلين: ${USERS.size}`);
    console.log(`🗄️ قاعدة البيانات: ${DATABASE_AVAILABLE ? 'PostgreSQL (متصل)' : 'localStorage (fallback)'}`);
    console.log(`🌐 الرابط: https://erp-alraed.com`);
    console.log(`🛡️ لوحة الإدارة: https://erp-alraed.com/admin`);
    
    // عرض بيانات المستخدمين المسجلين
    console.log('\n👥 المستخدمين المتاحين (من USER_1 و USER_2):');
    for (const [username, userData] of USERS) {
      console.log(`   • ${username} (${userData.role})`);
    }
    
    if (!DATABASE_AVAILABLE) {
      console.log(`\n⚠️ تحذير: PostgreSQL غير متاح. النظام يعمل بوضع localStorage`);
      console.log(`🔧 للتفعيل: تحقق من متغير DATABASE_URL في Railway`);
    }
  });
}).catch(error => {
  console.error('❌ فشل في تهيئة النظام:', error);
  process.exit(1);
});
