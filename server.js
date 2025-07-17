// server.js - نظام ERP مع PostgreSQL الكامل
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// استيراد إعدادات Sequelize والنماذج من ملف models/index.js
import db from './models/index.js';

// إعداد المجلدات
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// تحميل متغيرات البيئة
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// ===================================================================
// إعداد التطبيق (Middleware)
// ===================================================================

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// إعداد multer لرفع الملفات وتخزينها في الذاكرة
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. يرجى رفع PDF أو صورة.'));
    }
  }
});

// ===================================================================
// واجهات برمجة التطبيقات (APIs)
// ===================================================================

// --- واجهات الموردين ---
app.get('/api/suppliers', async (req, res) => {
  try {
    const suppliers = await db.Supplier.findAll({
      where: { isActive: true },
      order: [['name', 'ASC']],
    });
    res.json({ success: true, data: suppliers, source: 'PostgreSQL' });
  } catch (error) {
    console.error('❌ خطأ في جلب الموردين:', error.message);
    res.status(500).json({ success: false, error: 'خطأ في جلب بيانات الموردين' });
  }
});

// --- واجهات المعاملات (فواتير ومدفوعات) ---
app.get('/api/transactions/:supplierName', async (req, res) => {
    try {
        const { supplierName } = req.params;
        const invoices = await db.Invoice.findAll({ where: { supplierName }, order: [['date', 'DESC']] });
        const payments = await db.Payment.findAll({ where: { supplierName }, order: [['date', 'DESC']] });

        res.json({
            success: true,
            data: { invoices, payments },
            source: 'PostgreSQL'
        });
    } catch (error) {
        console.error('❌ خطأ في جلب معاملات المورد:', error.message);
        res.status(500).json({ success: false, error: 'خطأ في جلب المعاملات' });
    }
});

// --- واجهات الفواتير ---
app.post('/api/invoices', upload.single('invoiceFile'), async (req, res) => {
    try {
        let fileData = null;
        if (req.file) {
            fileData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        }

        const { supplierName, ...invoiceDetails } = req.body;

        const [supplier] = await db.Supplier.findOrCreate({
            where: { name: supplierName },
            defaults: { name: supplierName }
        });

        const newInvoice = await db.Invoice.create({
            ...invoiceDetails,
            supplierId: supplier.id,
            supplierName: supplier.name,
            fileData: fileData,
            fileName: req.file ? req.file.originalname : null,
            fileType: req.file ? req.file.mimetype : null,
            fileSize: req.file ? req.file.size : null,
            processedBy: 'system' //  يجب استبداله باسم المستخدم الحالي
        });

        res.status(201).json({ success: true, data: newInvoice, source: 'PostgreSQL' });
    } catch (error) {
        console.error('❌ خطأ في حفظ الفاتورة:', error.message);
        res.status(500).json({ success: false, error: 'خطأ في حفظ الفاتورة' });
    }
});

// --- واجهات المدفوعات ---
app.post('/api/payments', async (req, res) => {
    try {
        const { supplierName, ...paymentDetails } = req.body;

        const [supplier] = await db.Supplier.findOrCreate({
            where: { name: supplierName },
            defaults: { name: supplierName }
        });

        const newPayment = await db.Payment.create({
            ...paymentDetails,
            supplierId: supplier.id,
            supplierName: supplier.name,
            processedBy: 'system' // يجب استبداله باسم المستخدم الحالي
        });

        res.status(201).json({ success: true, data: newPayment, source: 'PostgreSQL' });
    } catch (error) {
        console.error('❌ خطأ في حفظ الدفعة:', error.message);
        res.status(500).json({ success: false, error: 'خطأ في حفظ الدفعة' });
    }
});

// --- واجهات أوامر الشراء ---
app.get('/api/purchase-orders', async (req, res) => {
    try {
        const purchaseOrders = await db.PurchaseOrder.findAll({
            order: [['createdDate', 'DESC']],
            include: [{ model: db.Invoice, as: 'linkedInvoice', attributes: ['invoiceNumber', 'totalAmount'] }]
        });
        res.json({ success: true, data: purchaseOrders, source: 'PostgreSQL' });
    } catch (error) {
        console.error('❌ خطأ في جلب أوامر الشراء:', error.message);
        res.status(500).json({ success: false, error: 'خطأ في جلب أوامر الشراء' });
    }
});

app.post('/api/purchase-orders', async (req, res) => {
    try {
        const { supplierName, ...poDetails } = req.body;

        const [supplier] = await db.Supplier.findOrCreate({
            where: { name: supplierName },
            defaults: { name: supplierName }
        });

        const newPO = await db.PurchaseOrder.create({
            ...poDetails,
            supplierId: supplier.id,
            supplierName: supplier.name,
            processedBy: 'system' // يجب استبداله باسم المستخدم الحالي
        });

        res.status(201).json({ success: true, data: newPO, source: 'PostgreSQL' });
    } catch (error) {
        console.error('❌ خطأ في حفظ أمر الشراء:', error.message);
        res.status(500).json({ success: false, error: 'خطأ في حفظ أمر الشراء' });
    }
});


// --- واجهة الإحصائيات ---
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await db.getSystemStats();
        res.json({ success: true, data: stats, source: 'PostgreSQL' });
    } catch (error) {
        console.error('❌ خطأ في جلب الإحصائيات:', error.message);
        res.status(500).json({ success: false, error: 'خطأ في جلب الإحصائيات' });
    }
});

// ===================================================================
// تشغيل الخادم
// ===================================================================
async function startServer() {
    try {
        // تهيئة قاعدة البيانات أولاً
        await db.syncDatabase({ alter: true }); // alter:true يحدّث الجداول دون حذف البيانات
        console.log('✅ تم مزامنة قاعدة البيانات بنجاح.');

        // إنشاء البيانات الافتراضية إذا لم تكن موجودة
        await db.seedDatabase();
        
        // بدء تنظيف الجلسات المنتهية
        db.startSessionCleanup();

        app.listen(port, '0.0.0.0', () => {
            console.log(`\n🎉 ERP System with PostgreSQL started!`);
            console.log(`✅ Listening on port: ${port}`);
            console.log(`🗄️ Database: Sequelize connected and synced.`);
            console.log(`\n🚀 System is ready to serve requests at http://localhost:${port}\n`);
        });
    } catch (error) {
        console.error('❌ فشل بدء تشغيل الخادم:', error.message);
        process.exit(1);
    }
}

startServer();
