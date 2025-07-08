import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import OpenAI from 'openai';

// إنشاء __dirname للـ ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

console.log(`🚀 Starting server on port: ${port}`);

// إعدادات الحماية
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'password123';

console.log(`🔐 Authentication enabled for user: ${AUTH_USERNAME}`);

// Basic Authentication Middleware
const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    res.set('WWW-Authenticate', 'Basic realm="ERP System"');
    return res.status(401).send(`
      <html>
        <head>
          <title>تسجيل الدخول مطلوب</title>
          <meta charset="utf-8">
        </head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>🔒 نظام ERP محمي</h1>
          <p>يرجى إدخال اسم المستخدم وكلمة المرور</p>
          <p style="color: #666;">سيتم طلب تسجيل الدخول تلقائياً</p>
        </body>
      </html>
    `);
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');

  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    console.log(`✅ User authenticated: ${username}`);
    next();
  } else {
    console.log(`❌ Failed authentication attempt: ${username}`);
    res.set('WWW-Authenticate', 'Basic realm="ERP System"');
    return res.status(401).send(`
      <html>
        <head>
          <title>خطأ في تسجيل الدخول</title>
          <meta charset="utf-8">
        </head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>❌ خطأ في تسجيل الدخول</h1>
          <p>اسم المستخدم أو كلمة المرور غير صحيحة</p>
          <button onclick="location.reload()">إعادة المحاولة</button>
        </body>
      </html>
    `);
  }
};

// إعداد CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());
app.use(express.static('public'));

// تطبيق الحماية على جميع المسارات (ما عدا health check)
app.use((req, res, next) => {
  // السماح بـ health check بدون حماية للـ Railway
  if (req.path === '/health') {
    return next();
  }
  
  // تطبيق الحماية على باقي المسارات
  authenticateUser(req, res, next);
});

// إعداد multer
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم'), false);
    }
  }
});

// تحقق من API key
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const modelName = process.env.OPENAI_MODEL || 'gpt-4';

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
          <title>ERP System</title>
          <meta charset="utf-8">
        </head>
        <body style="font-family: Arial; padding: 20px;">
          <h1>🎉 مرحباً بك في نظام ERP المحمي</h1>
          <p>✅ تم تسجيل الدخول بنجاح!</p>
          <p>الملف home.html غير موجود في مجلد public</p>
          <hr>
          <p><a href="/ping">اختبار الخادم</a></p>
          <p><a href="/logout">تسجيل الخروج</a></p>
        </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Error serving home page:', error);
    res.status(500).send('خطأ في تحميل الصفحة الرئيسية');
  }
});

// تسجيل الخروج
app.get('/logout', (req, res) => {
  res.set('WWW-Authenticate', 'Basic realm="ERP System"');
  res.status(401).send(`
    <html>
      <head>
        <title>تسجيل الخروج</title>
        <meta charset="utf-8">
      </head>
      <body style="font-family: Arial; text-align: center; padding: 50px;">
        <h1>👋 تم تسجيل الخروج</h1>
        <p>شكراً لاستخدام نظام ERP</p>
        <a href="/">العودة للصفحة الرئيسية</a>
      </body>
    </html>
  `);
});

// نقطة فحص الخادم
app.get('/ping', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running and protected!',
    timestamp: new Date().toISOString(),
    port: port,
    authenticated: true,
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    model: modelName
  });
});

// Health check للـ Railway (بدون حماية)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// استخراج النص من الملفات
async function extractText(filePath, mimetype) {
  console.log(`📄 Extracting text from: ${mimetype}`);
  
  if (mimetype === 'application/pdf') {
    const buffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(buffer);
    return pdfData.text;
  } else if (mimetype.startsWith('image/')) {
    const { data: { text } } = await Tesseract.recognize(filePath, 'ara+eng');
    return text;
  } else {
    throw new Error(`Unsupported file type: ${mimetype}`);
  }
}

// API endpoint لتحليل الفواتير
app.post('/api/analyze-invoice', upload.single('invoice'), async (req, res) => {
  if (!openai) {
    return res.status(500).json({ 
      success: false, 
      error: 'OpenAI API key not configured' 
    });
  }

  console.log('🔄 Starting invoice analysis...');
  
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }

    const { path: filePath, mimetype, originalname } = req.file;
    console.log(`📁 File: ${originalname} - ${mimetype}`);

    let rawText;
    try {
      rawText = await extractText(filePath, mimetype);
    } catch (extractError) {
      console.error('❌ Text extraction error:', extractError.message);
      return res.status(422).json({ 
        success: false, 
        error: `Failed to read file: ${extractError.message}` 
      });
    } finally {
      // حذف الملف المؤقت
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (deleteError) {
        console.warn('⚠️ Failed to delete temp file');
      }
    }

    if (!rawText || rawText.trim().length < 10) {
      return res.status(422).json({ 
        success: false, 
        error: 'Could not extract sufficient text from invoice' 
      });
    }

    console.log(`📝 Text length: ${rawText.length} characters`);

    // تحليل بالذكاء الاصطناعي
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: 'system',
          content: `Extract invoice data and return as JSON with these fields: supplier, type, invoiceNumber, date (YYYY-MM-DD), amountBeforeTax, taxAmount, totalAmount`
        },
        { 
          role: 'user', 
          content: `Analyze this invoice:\n\n${rawText}` 
        }
      ],
      temperature: 0.1
    });

    const content = response.choices[0].message.content;
    let data;
    
    try {
      // استخراج JSON من الرد
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        data = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('❌ JSON parsing error:', parseError.message);
      return res.status(500).json({ 
        success: false, 
        error: 'Error processing data' 
      });
    }

    // تنظيف البيانات
    const cleanData = {
      supplier: data.supplier || 'غير محدد',
      type: data.type || 'فاتورة عامة',
      invoiceNumber: data.invoiceNumber || 'غير محدد',
      date: data.date || new Date().toISOString().split('T')[0],
      amountBeforeTax: parseFloat(data.amountBeforeTax) || 0,
      taxAmount: parseFloat(data.taxAmount) || 0,
      totalAmount: parseFloat(data.totalAmount) || 0
    };

    console.log('✅ Invoice analyzed successfully');
    res.json({ success: true, data: cleanData });

  } catch (error) {
    console.error('❌ Invoice analysis error:', error.message);
    
    // حذف الملف في حالة الخطأ
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (deleteError) {
        console.warn('⚠️ Failed to delete file after error');
      }
    }

    res.status(500).json({ 
      success: false, 
      error: 'Unexpected error occurred'
    });
  }
});

// معالج الأخطاء
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: error.message || 'Server error'
  });
});

// إنشاء مجلد uploads
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
  console.log('📁 Created uploads directory');
}

// تشغيل الخادم
app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${port}`);
  console.log(`🔐 Protected with authentication`);
  console.log(`👤 Username: ${AUTH_USERNAME}`);
  console.log(`🗝️ Password: ${AUTH_PASSWORD}`);
});

// إيقاف الخادم بأمان
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, shutting down gracefully');
  process.exit(0);
});