// server.js (النسخة المحدثة)

const express = require('express');
const path = require('path');
const cors = require('cors');

// استيراد جميع الموديلات
const invoiceModel = require('./models/invoice.model.js');
const purchaseOrderModel = require('./models/purchase.order.model.js');
const paymentModel = require('./models/payment.model.js');

const app = express();
const PORT = process.env.PORT || 3000;

// الإعدادات الوسيطة (Middleware)
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- روابط الـ API (نقاط النهاية) ---

// -- روابط الفواتير --
app.get('/api/invoices', async (req, res) => {
  try {
    const invoices = await invoiceModel.getAllInvoices();
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

app.post('/api/invoices', async (req, res) => {
  try {
    const newInvoice = await invoiceModel.createInvoice(req.body);
    res.status(201).json(newInvoice);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add invoice' });
  }
});

// -- روابط أوامر الشراء --
app.get('/api/purchase-orders', async (req, res) => {
  try {
    const purchaseOrders = await purchaseOrderModel.getAllPurchaseOrders();
    res.json(purchaseOrders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
});

app.post('/api/purchase-orders', async (req, res) => {
  try {
    const newPurchaseOrder = await purchaseOrderModel.createPurchaseOrder(req.body);
    res.status(201).json(newPurchaseOrder);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add purchase order' });
  }
});

// -- روابط المدفوعات --
app.get('/api/payments', async (req, res) => {
  try {
    const payments = await paymentModel.getAllPayments();
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

app.post('/api/payments', async (req, res) => {
  try {
    const newPayment = await paymentModel.createPayment(req.body);
    res.status(201).json(newPayment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add payment' });
  }
});


// تشغيل الخادم
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
