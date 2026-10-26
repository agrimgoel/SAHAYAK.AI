-- ====================================================================
-- Sahayak.AI: Complete Supabase PostgreSQL Schema
-- Run this entire script in Supabase SQL Editor (Dashboard > SQL Editor)
-- ====================================================================

-- 1. Store Settings Table (Shop Profile, Timings, Open/Close, Offers, UPI)
CREATE TABLE IF NOT EXISTS public.store_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_name TEXT NOT NULL DEFAULT 'Gupta General & Kirana Store',
    tagline TEXT DEFAULT 'Fresh Quality & Best Rates Guaranteed',
    address TEXT DEFAULT 'Shop No. 4, Main Market, Sector 12',
    phone TEXT DEFAULT '+91 98765 43210',
    upi_id TEXT NOT NULL DEFAULT 'guptakirana@oksbi',
    is_shop_open BOOLEAN DEFAULT TRUE,
    opening_time TEXT DEFAULT '07:00 AM',
    closing_time TEXT DEFAULT '10:30 PM',
    closed_message TEXT DEFAULT 'Dukan abhi band hai. Subah khulegi.',
    active_discount_percent NUMERIC(5,2) DEFAULT 0.00,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial default store settings row
INSERT INTO public.store_settings (shop_name, upi_id, is_shop_open)
SELECT 'Gupta General & Kirana Store', 'guptakirana@oksbi', true
WHERE NOT EXISTS (SELECT 1 FROM public.store_settings);

-- 2. Inventory / Products Table (Supports loose Kg/Gm & packed items)
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    is_loose BOOLEAN DEFAULT FALSE, -- TRUE for loose (atta, chini), FALSE for packed (biscuit, maggi)
    wholesale_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    selling_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    stock_quantity NUMERIC(10,3) NOT NULL DEFAULT 0.000, -- e.g. 120.500 kg
    unit TEXT NOT NULL DEFAULT 'kg', -- 'kg', 'packet', 'box', 'piece'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Sales Bills Table (POS & WhatsApp Orders)
CREATE TABLE IF NOT EXISTS public.bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_number SERIAL,
    customer_name TEXT DEFAULT 'Walk-in Customer',
    customer_phone TEXT,
    subtotal NUMERIC(10,2) NOT NULL,
    discount_applied NUMERIC(10,2) DEFAULT 0.00,
    total_amount NUMERIC(10,2) NOT NULL,
    payment_mode TEXT CHECK (payment_mode IN ('cash', 'online', 'counter')),
    payment_status TEXT DEFAULT 'paid',
    source TEXT CHECK (source IN ('pos', 'whatsapp')) DEFAULT 'pos',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Bill Items Breakdown Table
CREATE TABLE IF NOT EXISTS public.bill_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID REFERENCES public.bills(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity NUMERIC(10,3) NOT NULL,
    unit TEXT,
    unit_price NUMERIC(10,2) NOT NULL,
    total_price NUMERIC(10,2) NOT NULL
);

-- 5. WhatsApp Incoming Orders Queue
CREATE TABLE IF NOT EXISTS public.whatsapp_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_phone TEXT NOT NULL,
    customer_name TEXT DEFAULT 'WhatsApp Customer',
    items JSONB NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL,
    payment_mode TEXT DEFAULT 'counter', -- 'online' or 'counter'
    payment_status TEXT DEFAULT 'pending',
    status TEXT CHECK (status IN ('pending', 'packed', 'completed', 'cancelled')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) & Public Access Policies for Kirana Frontend
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read-write for store_settings" ON public.store_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for products" ON public.products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for bills" ON public.bills FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for bill_items" ON public.bill_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for whatsapp_orders" ON public.whatsapp_orders FOR ALL USING (true) WITH CHECK (true);
