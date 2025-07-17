// models/invoice.model.js

const pool = require('../config/db'); // استيراد الاتصال من ملف db.js

// --- الدوال الخاصة بجدول الفواتير ---

// دالة لجلب كل الفواتير من قاعدة البيانات
const getAllInvoices = async () => {
  const result = await pool.query('SELECT * FROM invoices ORDER BY invoice_date DESC, id DESC');
  return result.rows;
};

// دالة لإضافة فاتورة جديدة إلى قاعدة البيانات
const createInvoice = async (invoiceData) => {
  const { supplier, type, category, invoice_number, invoice_date, amount_before_tax, tax_amount, total_amount, notes, file_name, file_data } = invoiceData;

  // تحويل بيانات الملف من نص base64 إلى بيانات ثنائية
  const fileDataBuffer = file_data ? Buffer.from(file_data.split(',')[1], 'base64') : null;

  const query = `
    INSERT INTO invoices (supplier, type, category, invoice_number, invoice_date, amount_before_tax, tax_amount, total_amount, notes, file_name, file_data)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *;
  `;
  const values = [supplier, type, category, invoice_number, invoice_date, amount_before_tax, tax_amount, total_amount, notes, file_name, fileDataBuffer];

  const result = await pool.query(query, values);
  return result.rows[0];
};


// تصدير الدوال لجعلها متاحة لملف server.js
module.exports = {
  getAllInvoices,
  createInvoice
  // سنضيف دوال التعديل والحذف هنا لاحقًا
};
