// server.js

const express = require('express');
const path = require('path');
const cors = require('cors');
const invoiceModel = require('./models/invoice.model.js'); // ١. استيراد المودل

const app = express();
const PORT = process.env.PORT || 3000;

// الإعدادات الوسيطة (Middleware)
app.use(cors());
app.use(express.json({ limit: '10mb' })); // لزيادة حد حجم الطلبات (مهم للملفات)
app.use(express.static(path.join(__dirname, 'public'))); // لعرض ملفات HTML

// --- روابط الـ API (نقاط النهاية) ---

// رابط جلب جميع الفواتير
app.get('/api/invoices', async (req, res) => {
  try {
    const invoices = await invoiceModel.getAllInvoices(); // ٢. استخدام الدالة من المودل
    res.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// رابط إضافة فاتورة جديدة
app.post('/api/invoices', async (req, res) => {
  try {
    const newInvoice = await invoiceModel.createInvoice(req.body); // ٣. استخدام الدالة من المودل
    res.status(201).json(newInvoice);
  } catch (error) {
    console.error('Error adding invoice:', error);
    res.status(500).json({ error: 'Failed to add invoice' });
  }
});

// سنضيف روابط أوامر الشراء والمدفوعات هنا لاحقًا...

// تشغيل الخادم
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
