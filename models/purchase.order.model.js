// models/purchase.order.model.js

const pool = require('../config/db');

// --- الدوال الخاصة بجدول أوامر الشراء ---

const getAllPurchaseOrders = async () => {
  const result = await pool.query('SELECT * FROM purchase_orders ORDER BY created_at DESC');
  return result.rows;
};

const createPurchaseOrder = async (poData) => {
  const { po_number, supplier, description, price, pdf_file_name, pdf_file_data } = poData;
  const pdfDataBuffer = pdf_file_data ? Buffer.from(pdf_file_data.split(',')[1], 'base64') : null;

  const query = `
    INSERT INTO purchase_orders (po_number, supplier, description, price, pdf_file_name, pdf_file_data)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;
  const values = [po_number, supplier, description, price, pdf_file_name, pdfDataBuffer];

  const result = await pool.query(query, values);
  return result.rows[0];
};

module.exports = {
  getAllPurchaseOrders,
  createPurchaseOrder
};
