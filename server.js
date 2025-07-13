// server.js - نظام ERP مع PostgreSQL كأولوية و localStorage كـ fallback
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import crypto from 'crypto';

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
// إعداد النظام المختلط (PostgreSQL + localStorage fallback)
// ===================================================================

let DATABASE_AVAILABLE = false;
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 ساعة

// المستخدمين للـ fallback
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

  // مستخدم افتراضي إذا لم توجد متغيرات البيئة
  if (USERS.size === 0) {
    console.log('⚠️ لم يتم العثور على USER_1 أو USER_2 في متغيرات البيئة');
    USERS.set('admin', { username: 'admin', password: 'temp123', role: 'admin' });
    console.log('⚠️ تم إنشاء مستخدم مؤقت: admin/temp123');
  }

  console.log(`✅ تم تحميل ${USERS.size} مستخدم`);
}

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

        // تنظيف الجلسات المنتهية كل ساعة
        setInterval(async () => {
          await SessionService.cleanupExpiredSessions();
        }, 60 * 60 * 1000);
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
// دوال مساعدة
// ===================================================================

// توليد معرف جلسة
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

// التحقق من الجلسة
async function validateSession(sessionId) {
  if (!sessionId) return null;

  if (DATABASE_AVAILABLE) {
    try {
      const result = await SessionService.findActiveSession(sessionId);
      if (result.success && result.data) {
        // تحديث آخر نشاط
        await SessionService.updateActivity(sessionId);
        return {
          username: result.data.username,
          role: result.data.userData?.role || 'user'
        };
      }
    } catch (error) {
      console.error('❌ خطأ في التحقق من الجلسة PostgreSQL:', error.message);
    }
  }

  // fallback للنظام القديم أو استخدام Basic Auth
  return null;
}

// Basic Authentication Middleware (fallback)
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
// إعداد التطبيق الأساسي
// ===================================================================

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// تطبيق الحماية على جميع المسارات (ما عدا health check و APIs)
app.use(async (req, res, next) => {
  // السماح بـ health check بدون حماية
  if (req.path === '/health') {
    return next();
  }
  
  // للواجهة الأمامية - استخدام Basic Auth
  if (req.path.endsWith('.html') || req.path === '/') {
    return authenticateUser(req, res, next);
  }
  
  // للـ APIs - التحقق من الجلسة أولاً، ثم Basic Auth
  const sessionId = req.headers['x-session-id'] || req.query.sessionId;
  const sessionUser = await validateSession(sessionId);
  
  if (sessionUser) {
    req.user = sessionUser;
    return next();
  }
  
  // fallback إلى Basic Auth للـ APIs
  return authenticateUser(req, res, next);
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

// الصفحة الرئيسية
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
app.get('/ping', async (req, res) => {
  try {
    let stats = {};
    if (DATABASE_AVAILABLE) {
      const result = await StatsService.getSystemStats();
      stats = result.success ? result.data : {};
    }

    res.json({ 
      status: 'OK', 
      message: 'Server is running and protected!',
      timestamp: new Date().toISOString(),
      port: port,
      user: req.user.username,
      role: req.user.role,
      database: DATABASE_AVAILABLE ? 'PostgreSQL' : 'localStorage',
      users: DATABASE_AVAILABLE ? stats.users : USERS.size,
      invoices: stats.invoices || 0,
      suppliers: stats.suppliers || 0
    });
  } catch (error) {
    console.error('❌ خطأ في ping:', error);
    res.json({ 
      status: 'OK', 
      message: 'Server is running and protected!',
      timestamp: new Date().toISOString(),
      database: DATABASE_AVAILABLE ? 'PostgreSQL' : 'localStorage',
      error: 'Stats unavailable'
    });
  }
});

// Health check للـ Railway (بدون حماية)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// ===================================================================
// مسارات المصادقة والجلسات
// ===================================================================

// تسجيل الدخول وإنشاء جلسة
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'اسم المستخدم وكلمة المرور مطلوبان' 
      });
    }

    let user = null;

    // البحث في PostgreSQL أولاً
    if (DATABASE_AVAILABLE) {
      try {
        const result = await UserService.findUser({ username, passwordHash: password });
        if (result.success && result.data) {
          user = result.data;
          await UserService.updateUserLogin(username);
        }
      } catch (error) {
        console.error('❌ خطأ في البحث عن المستخدم PostgreSQL:', error.message);
      }
    }

    // fallback للنظام القديم
    if (!user) {
      const userData = USERS.get(username);
      if (userData && userData.password === password) {
        user = { username: userData.username, role: userData.role };
      }
    }

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'اسم المستخدم أو كلمة المرور غير صحيحة' 
      });
    }

    // إنشاء الجلسة
    const sessionId = generateSessionId();
    const expiresAt = new Date(Date.now() + SESSION_TIMEOUT);
    const userData = {
      username: user.username,
      role: user.role
    };

    if (DATABASE_AVAILABLE) {
      try {
        await SessionService.createSession({
          id: sessionId,
          userId: user.id || username, // fallback للنظام القديم
          username: user.username,
          userData,
          expiresAt,
          ipAddress: req.ip
        });
      } catch (error) {
        console.error('❌ خطأ في إنشاء الجلسة PostgreSQL:', error.message);
      }
    }

    console.log(`✅ تم إنشاء جلسة جديدة: ${username}`);
    res.json({
      success: true,
      sessionId,
      user: userData,
      expiresAt,
      database: DATABASE_AVAILABLE ? 'PostgreSQL' : 'localStorage'
    });

  } catch (error) {
    console.error('❌ خطأ في تسجيل الدخول:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في الخادم' 
    });
  }
});

// تسجيل الخروج
app.post('/api/logout', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || req.body.sessionId;
    
    if (sessionId && DATABASE_AVAILABLE) {
      try {
        await SessionService.endSession(sessionId);
        console.log(`🚪 تم تسجيل الخروج: ${sessionId}`);
      } catch (error) {
        console.error('❌ خطأ في تسجيل الخروج:', error.message);
      }
    }

    res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
  } catch (error) {
    console.error('❌ خطأ في تسجيل الخروج:', error);
    res.status(500).json({ success: false, error: 'خطأ في الخادم' });
  }
});

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
        const result = await InvoiceService.createInvoice(invoiceData);
        
        if (result.success) {
          console.log(`✅ تم حفظ فاتورة في PostgreSQL: ${invoiceData.invoiceNumber}`);
          return res.json({
            success: true,
            data: result.data,
            source: 'PostgreSQL'
          });
        } else {
          console.error('❌ فشل حفظ الفاتورة PostgreSQL:', result.error);
        }
      } catch (error) {
        console.error('❌ خطأ في حفظ الفاتورة PostgreSQL:', error.message);
      }
    }

    // fallback إلى localStorage (سيتم التعامل معه في الواجهة)
    console.log(`✅ fallback: سيتم حفظ الفاتورة في localStorage: ${invoiceData.invoiceNumber}`);
    res.json({
      success: true,
      data: invoiceData,
      source: 'localStorage',
      message: 'تم الحفظ محلياً - PostgreSQL غير متاح'
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
          console.log(`📄 تم جلب ${result.data.length} فاتورة من PostgreSQL`);
          return res.json({
            success: true,
            data: result.data,
            source: 'PostgreSQL'
          });
        }
      } catch (error) {
        console.error('❌ خطأ في جلب الفواتير PostgreSQL:', error.message);
      }
    }

    // fallback إلى localStorage
    console.log('📄 fallback: سيتم جلب الفواتير من localStorage');
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

// تحديث فاتورة
app.put('/api/invoice/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (DATABASE_AVAILABLE) {
      try {
        const result = await InvoiceService.updateInvoice(id, updateData);
        if (result.success) {
          console.log(`📝 تم تحديث الفاتورة: ${id}`);
          return res.json({
            success: true,
            source: 'PostgreSQL'
          });
        }
      } catch (error) {
        console.error('❌ خطأ في تحديث الفاتورة PostgreSQL:', error.message);
      }
    }

    // fallback
    res.json({
      success: true,
      source: 'localStorage',
      message: 'سيتم التحديث محلياً'
    });

  } catch (error) {
    console.error('❌ خطأ في تحديث الفاتورة:', error.message);
    res.status(500).json({ success: false, error: 'خطأ في تحديث الفاتورة' });
  }
});

// حذف فاتورة
app.delete('/api/invoice/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (DATABASE_AVAILABLE) {
      try {
        const result = await InvoiceService.deleteInvoice(id);
        if (result.success) {
          console.log(`🗑️ تم حذف الفاتورة: ${id}`);
          return res.json({
            success: true,
            source: 'PostgreSQL'
          });
        }
      } catch (error) {
        console.error('❌ خطأ في حذف الفاتورة PostgreSQL:', error.message);
      }
    }

    // fallback
    res.json({
      success: true,
      source: 'localStorage',
      message: 'سيتم الحذف محلياً'
    });

  } catch (error) {
    console.error('❌ خطأ في حذف الفاتورة:', error.message);
    res.status(500).json({ success: false, error: 'خطأ في حذف الفاتورة' });
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
          console.log(`💰 تم حفظ دفعة في PostgreSQL: ${paymentData.supplier}`);
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
    console.log(`💰 fallback: سيتم حفظ الدفعة في localStorage: ${paymentData.supplier}`);
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
          console.log(`📋 تم حفظ أمر شراء في PostgreSQL: ${result.data.id}`);
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
    console.log(`📋 fallback: سيتم حفظ أمر الشراء في localStorage`);
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
// مسارات الموردين
// ===================================================================

// جلب جميع الموردين
app.get('/api/suppliers', async (req, res) => {
  try {
    if (DATABASE_AVAILABLE) {
      try {
        const result = await SupplierService.getAllSuppliers();
        if (result.success) {
          return res.json({
            success: true,
            data: result.data,
            source: 'PostgreSQL'
          });
        }
      } catch (error) {
        console.error('❌ خطأ في جلب الموردين PostgreSQL:', error.message);
      }
    }

    // fallback إلى localStorage
    res.json({
      success: true,
      data: [],
      source: 'localStorage'
    });

  } catch (error) {
    console.error('❌ خطأ في جلب الموردين:', error.message);
    res.status(500).json({ success: false, error: 'خطأ في جلب الموردين' });
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
// مسارات الإدارة
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
    let activeSessions = [];
    
    if (DATABASE_AVAILABLE) {
      try {
        const [statsResult, sessionsResult] = await Promise.all([
          StatsService.getSystemStats(),
          SessionService.getActiveSessions()
        ]);
        
        stats = statsResult.success ? statsResult.data : {};
        activeSessions = sessionsResult.success ? sessionsResult.data : [];
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
          .online { color: #27ae60; font-weight: bold; }
          .offline { color: #7f8c8d; }
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
              <h3>${stats.users || users.length}</h3>
              <p>إجمالي المستخدمين</p>
            </div>
            <div class="stat-item">
              <h3>${activeSessions.length || 0}</h3>
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
            <tr><th>اسم المستخدم</th><th>الصلاحية</th><th>الحالة</th></tr>
            ${users.map(user => {
              const isOnline = activeSessions.some(s => s.username === user.username);
              return `<tr>
                <td>${user.username}</td>
                <td class="${user.role}">${user.role}</td>
                <td class="${isOnline ? 'online' : 'offline'}">${isOnline ? '🟢 متصل' : '⚫ غير متصل'}</td>
              </tr>`;
            }).join('')}
          </table>
        </div>
        
        ${activeSessions.length > 0 ? `
        <div class="card">
          <h2>🔐 الجلسات النشطة</h2>
          <table>
            <tr><th>اسم المستخدم</th><th>الصلاحية</th><th>آخر نشاط</th><th>انتهاء الصلاحية</th></tr>
            ${activeSessions.map(session => `
              <tr>
                <td>${session.username}</td>
                <td class="${session.userData?.role || 'user'}">${session.userData?.role || 'user'}</td>
                <td>${new Date(session.lastActivity).toLocaleString('ar-SA')}</td>
                <td>${new Date(session.expiresAt).toLocaleString('ar-SA')}</td>
              </tr>
            `).join('')}
          </table>
        </div>
        ` : ''}
        
        <div class="card">
          <h2>🔧 الإجراءات</h2>
          <a href="/" class="btn btn-primary">الصفحة الرئيسية</a>
          <a href="/ping" class="btn btn-primary">معلومات تقنية</a>
          <a href="/api/stats" class="btn btn-primary">إحصائيات JSON</a>
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
  app.listen(port, '0.0.0.0', async () => {
    try {
      // جلب إحصائيات شاملة للعرض
      let stats = {};
      if (DATABASE_AVAILABLE) {
        const result = await StatsService.getSystemStats();
        stats = result.success ? result.data : {};
      }

      console.log(`\n🎉 نظام ERP مع PostgreSQL بدأ بنجاح!`);
      console.log(`✅ المنفذ: ${port}`);
      console.log(`🗄️ قاعدة البيانات: ${DATABASE_AVAILABLE ? 'PostgreSQL (متصل)' : 'localStorage (fallback)'}`);
      console.log(`👥 المستخدمين المسجلين: ${DATABASE_AVAILABLE ? stats.users || USERS.size : USERS.size}`);
      console.log(`📄 إجمالي الفواتير: ${stats.invoices || 0}`);
      console.log(`💰 إجمالي المبلغ: ${(stats.totalInvoiceAmount || 0).toLocaleString('ar-SA')} ر.س`);
      console.log(`🔐 الجلسات النشطة: ${stats.activeSessions || 0}`);
      console.log(`🌐 الرابط: https://erp-alraed.com`);
      console.log(`🛡️ لوحة الإدارة: https://erp-alraed.com/admin`);
      
      // عرض بيانات المستخدمين المسجلين
      console.log('\n👥 المستخدمين المتاحين:');
      for (const [username, userData] of USERS) {
        console.log(`   • ${username} (${userData.role})`);
      }
      
      if (DATABASE_AVAILABLE) {
        console.log(`\n🎉 النظام يعمل بـ PostgreSQL - البيانات متزامنة بين المستخدمين!`);
        console.log(`✅ الفواتير والموردين والدفعات محفوظة في قاعدة البيانات`);
        console.log(`🔄 تنظيف الجلسات التلقائي مفعل كل ساعة`);
      } else {
        console.log(`\n⚠️ تحذير: PostgreSQL غير متاح. النظام يعمل بوضع localStorage`);
        console.log(`🔧 للتفعيل: تحقق من متغير DATABASE_URL في Railway`);
      }
      
      console.log(`\n⚡ الخادم جاهز لاستقبال الطلبات...\n`);
    } catch (error) {
      console.error('❌ خطأ في عرض إحصائيات البدء:', error);
      console.log(`\n🎉 نظام ERP بدأ بنجاح!`);
      console.log(`✅ المنفذ: ${port}`);
      console.log(`🗄️ قاعدة البيانات: ${DATABASE_AVAILABLE ? 'PostgreSQL' : 'localStorage'}`);
      console.log(`\n⚡ الخادم جاهز لاستقبال الطلبات...\n`);
    }
  });
}).catch(error => {
  console.error('❌ فشل في تهيئة النظام:', error);
  process.exit(1);
});
