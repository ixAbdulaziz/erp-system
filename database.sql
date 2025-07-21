-- إنشاء قاعدة البيانات
CREATE DATABASE IF NOT EXISTS erp_system;
USE erp_system;

-- جدول الموردين
CREATE TABLE IF NOT EXISTS suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- جدول الفواتير
CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(50) PRIMARY KEY,
    invoice_number VARCHAR(100) NOT NULL UNIQUE,
    supplier_id INT NOT NULL,
    type VARCHAR(100),
    category VARCHAR(100),
    date DATE NOT NULL,
    amount_before_tax DECIMAL(10, 2) DEFAULT 0,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10, 2) DEFAULT 0,
    notes TEXT,
    file_data LONGTEXT,
    file_type VARCHAR(50),
    file_name VARCHAR(255),
    file_size INT,
    purchase_order_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    INDEX idx_supplier (supplier_id),
    INDEX idx_date (date),
    INDEX idx_po (purchase_order_id)
);

-- جدول المدفوعات
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(50) PRIMARY KEY,
    supplier_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    INDEX idx_supplier (supplier_id),
    INDEX idx_date (date)
);

-- جدول أوامر الشراء
CREATE TABLE IF NOT EXISTS purchase_orders (
    id VARCHAR(50) PRIMARY KEY,
    supplier_id INT NOT NULL,
    description TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    pdf_file_data LONGTEXT,
    pdf_file_name VARCHAR(255),
    pdf_file_size INT,
    created_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    INDEX idx_supplier (supplier_id),
    INDEX idx_date (created_date)
);

-- إنشاء view للحصول على إحصائيات الموردين
CREATE VIEW supplier_stats AS
SELECT 
    s.id,
    s.name,
    s.is_pinned,
    COUNT(DISTINCT i.id) as invoice_count,
    COALESCE(SUM(i.total_amount), 0) as total_invoices,
    COALESCE((SELECT SUM(amount) FROM payments WHERE supplier_id = s.id), 0) as total_payments,
    COALESCE(SUM(i.total_amount), 0) - COALESCE((SELECT SUM(amount) FROM payments WHERE supplier_id = s.id), 0) as outstanding_amount,
    MAX(i.date) as latest_invoice_date
FROM suppliers s
LEFT JOIN invoices i ON s.id = i.supplier_id
GROUP BY s.id, s.name, s.is_pinned;
