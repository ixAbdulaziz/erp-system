// models/payment.model.js

const pool = require('../config/db');

// --- الدوال الخاصة بجدول المدفوعات ---

const getAllPayments = async () => {
  const result = await pool.query('SELECT * FROM payments ORDER BY payment_date DESC');
  return result.rows;
};

const createPayment = async (paymentData) => {
  const { amount, payment_date, notes, supplier, invoice_id, purchase_order_id } = paymentData;

  const query = `
    INSERT INTO payments (amount, payment_date, notes, supplier, invoice_id, purchase_order_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;
  const values = [amount, payment_date, notes, supplier, invoice_id || null, purchase_order_id || null];

  const result = await pool.query(query, values);
  return result.rows[0];
};

module.exports = {
  getAllPayments,
  createPayment
};
