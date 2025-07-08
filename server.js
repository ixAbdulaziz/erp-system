import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import OpenAI from 'openai';

const app = express();
const port = process.env.PORT || 3000;

// إعداد multer لرفع الملفات
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم'), false);
    }
  }
});

// إعداد CORS بطريقة بسيطة
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

// تحقق من وجود API key
if (!process.env.OPENAI_API_KEY) {
  console.error('⚠️ خطأ: OPENAI_API_KEY مفقود في متغيرات البيئة');
  console.log('قم بإنشاء ملف .env وأضف: OPENAI_API_KEY=your_api_key_here');
}

const modelName = process.env.OPENAI_MODEL || 'gpt-4';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 بدء الخادم باستخدام موديل: ${modelName}`);

// نقطة فحص الخادم
app.get('/ping', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    model: modelName,
    timestamp: new Date().toISOString()
  });
});

// دالة استخراج النص
async function extractText(filePath, mimetype) {
  console.log(`📄 استخراج النص من: ${mimetype}`);
  
  if (mimetype === 'application/pdf') {
    const buffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(buffer);
    console.log(`✅ تم استخراج ${pdfData.text.length} حرف من PDF`);
    return pdfData.text;
  } else if (mimetype.startsWith('image/')) {
    console.log('🔍 بدء OCR للصورة...');
    const { data: { text } } = await Tesseract.recognize(filePath, 'ara+eng');
    console.log(`✅ تم استخراج ${text.length} حرف من الصورة`);
    return text;
  } else {
    throw new Error(`نوع ملف غير مدعوم: ${mimetype}`);
  }
}

// API endpoint لتحليل الفواتير
app.post('/api/analyze-invoice', upload.single('invoice'), async (req, res) => {
  console.log('\n🔄 بدء تحليل فاتورة جديدة...');
  
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'لم يتم رفع ملف' 
      });
    }

    const { path: filePath, mimetype, originalname } = req.file;
    console.log(`📁 ملف: ${originalname} - ${mimetype}`);

    // استخراج النص
    let rawText;
    try {
      rawText = await extractText(filePath, mimetype);
    } catch (extractError) {
      console.error('❌ خطأ في استخراج النص:', extractError.message);
      return res.status(422).json({ 
        success: false, 
        error: `فشل في قراءة الملف: ${extractError.message}` 
      });
    } finally {
      // حذف الملف المؤقت
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log('🗑️ تم حذف الملف المؤقت');
        }
      } catch (deleteError) {
        console.warn('⚠️ فشل في حذف الملف المؤقت');
      }
    }

    // التحقق من النص
    if (!rawText || rawText.trim().length < 10) {
      return res.status(422).json({ 
        success: false, 
        error: 'لم أستطع استخراج نص كافٍ من الفاتورة' 
      });
    }

    console.log(`📝 نص بطول ${rawText.length} حرف`);
    console.log('🤖 إرسال للذكاء الاصطناعي...');

    // تحليل بالذكاء الاصطناعي
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: 'system',
          content: `
أنت خبير في تحليل الفواتير. مهمتك استخراج البيانات التالية من النص:

1. supplier: اسم المورد أو الشركة التي أصدرت الفاتورة
2. type: نوع الفاتورة أو وصف الخدمة/المنتج الأساسي (مثل: فاتورة كهرباء، فاتورة اتصالات، فاتورة خدمات سفر وسياحة، فاتورة مطعم، فاتورة مكتب، إلخ)
3. invoiceNumber: رقم الفاتورة
4. date: تاريخ الفاتورة بصيغة YYYY-MM-DD
5. amountBeforeTax: المبلغ قبل الضريبة (رقم)
6. taxAmount: مبلغ الضريبة (رقم)
7. totalAmount: إجمالي المبلغ (رقم)

تعليمات مهمة:
- حلل الفاتورة جيداً لتحديد نوع الخدمة أو المنتج الأساسي
- لا تضع أي شيء في category - اتركه فارغاً
- إذا لم تجد بيانات الضريبة، احسبها بناءً على الضريبة المعتادة 15%
- كن دقيقاً في استخراج الأرقام والتواريخ
- استخدم الأسماء الواضحة والمفهومة لنوع الفاتورة

أرجع النتيجة في JSON format فقط.
          `
        },
        { 
          role: 'user', 
          content: `حلل هذه الفاتورة بعناية واستخرج البيانات المطلوبة:\n\n${rawText}` 
        }
      ],
      functions: [
        {
          name: 'extract_invoice_data',
          description: 'استخراج بيانات الفاتورة بدقة',
          parameters: {
            type: 'object',
            properties: {
              supplier: { 
                type: 'string', 
                description: 'اسم المورد أو الشركة' 
              },
              type: { 
                type: 'string', 
                description: 'نوع الفاتورة أو وصف الخدمة الأساسية (مثل: فاتورة كهرباء، خدمات سفر وسياحة، مطعم، إلخ)' 
              },
              invoiceNumber: { 
                type: 'string', 
                description: 'رقم الفاتورة' 
              },
              date: { 
                type: 'string', 
                description: 'تاريخ الفاتورة بصيغة YYYY-MM-DD' 
              },
              amountBeforeTax: { 
                type: 'number', 
                description: 'المبلغ قبل الضريبة' 
              },
              taxAmount: { 
                type: 'number', 
                description: 'مبلغ الضريبة' 
              },
              totalAmount: { 
                type: 'number', 
                description: 'إجمالي المبلغ' 
              }
            },
            required: ['supplier', 'type', 'invoiceNumber', 'date', 'totalAmount']
          }
        }
      ],
      function_call: { name: 'extract_invoice_data' },
      temperature: 0.1
    });

    const msg = response.choices[0].message;
    if (!msg.function_call?.arguments) {
      return res.status(500).json({ 
        success: false, 
        error: 'فشل في تحليل الفاتورة' 
      });
    }

    // تحليل النتيجة
    let data;
    try {
      data = JSON.parse(msg.function_call.arguments);
      console.log('✅ تم استخراج البيانات:', data);
    } catch (parseError) {
      console.error('❌ خطأ في تحليل JSON:', parseError.message);
      return res.status(500).json({ 
        success: false, 
        error: 'خطأ في معالجة البيانات' 
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

    // حساب الضريبة إذا لم تكن موجودة أو غير صحيحة
    if (cleanData.totalAmount > 0) {
      if (cleanData.amountBeforeTax === 0 || cleanData.taxAmount === 0) {
        // حساب بناءً على ضريبة 15%
        cleanData.amountBeforeTax = Math.round((cleanData.totalAmount / 1.15) * 100) / 100;
        cleanData.taxAmount = Math.round((cleanData.totalAmount - cleanData.amountBeforeTax) * 100) / 100;
      }
    }

    console.log('✅ تم تحليل الفاتورة بنجاح');
    console.log('📊 البيانات النهائية:', cleanData);

    res.json({ 
      success: true, 
      data: cleanData
    });

  } catch (error) {
    console.error('❌ خطأ في تحليل الفاتورة:', error.message);
    
    // حذف الملف في حالة الخطأ
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (deleteError) {
        console.warn('⚠️ فشل في حذف الملف بعد الخطأ');
      }
    }

    let errorMessage = 'حدث خطأ غير متوقع';
    
    if (error.message.includes('rate limit')) {
      errorMessage = 'تم تجاوز الحد المسموح للطلبات';
    } else if (error.message.includes('insufficient_quota')) {
      errorMessage = 'رصيد API منتهي';
    } else if (error.message.includes('invalid_api_key')) {
      errorMessage = 'مفتاح API غير صالح';
    }

    res.status(500).json({ 
      success: false, 
      error: errorMessage
    });
  }
});

// معالج أخطاء multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'حجم الملف كبير جداً (الحد الأقصى 10MB)'
      });
    }
  }
  
  res.status(500).json({
    success: false,
    error: error.message || 'خطأ في الخادم'
  });
});

// تشغيل الخادم
app.listen(port, () => {
  console.log('\n🎉 تم تشغيل خادم تحليل الفواتير المحسن!');
  console.log(`🌐 الرابط: http://localhost:${port}`);
  console.log(`🤖 الموديل: ${modelName}`);
  console.log(`⚡ جاهز لاستقبال الطلبات...\n`);
  
  // إنشاء مجلد uploads إذا لم يكن موجوداً
  if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
    console.log('📁 تم إنشاء مجلد uploads');
  }
});

// إيقاف الخادم بأمان
process.on('SIGINT', () => {
  console.log('\n🔄 إيقاف الخادم...');
  process.exit(0);
});