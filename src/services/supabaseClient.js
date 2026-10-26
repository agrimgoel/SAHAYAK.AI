// Sahayak.AI Database & Local State Management with Live Supabase Sync
import { createClient } from '@supabase/supabase-js';

export const INITIAL_PRODUCTS = [
  { id: '1', name: 'Aashirvaad Shudh Chakki Atta', is_loose: true, wholesale_price: 36, selling_price: 45, stock_quantity: 120.0, unit: 'kg', category: 'Grains & Flours' },
  { id: '2', name: 'Madhur Pure Crystal Chini (Sugar)', is_loose: true, wholesale_price: 38, selling_price: 46, stock_quantity: 85.5, unit: 'kg', category: 'Sugar & Salt' },
  { id: '3', name: 'Fortune Kachi Ghani Mustard Oil 1L', is_loose: false, wholesale_price: 135, selling_price: 155, stock_quantity: 42, unit: 'packet', category: 'Oils & Ghee' },
  { id: '4', name: 'Tata Salt Vaccum Evaporated 1kg', is_loose: false, wholesale_price: 22, selling_price: 28, stock_quantity: 60, unit: 'packet', category: 'Sugar & Salt' },
  { id: '5', name: 'Maggi 2-Minute Masala Noodles 70g', is_loose: false, wholesale_price: 11.5, selling_price: 14, stock_quantity: 96, unit: 'packet', category: 'Instant Food' },
  { id: '6', name: 'Parle-G Gold Glucose Biscuits 100g', is_loose: false, wholesale_price: 8.5, selling_price: 10, stock_quantity: 110, unit: 'packet', category: 'Snacks & Biscuits' },
  { id: '7', name: 'Rajdhani Besan Fine', is_loose: true, wholesale_price: 70, selling_price: 90, stock_quantity: 40.0, unit: 'kg', category: 'Grains & Flours' },
  { id: '8', name: 'Tata Tea Premium 250g', is_loose: false, wholesale_price: 110, selling_price: 130, stock_quantity: 25, unit: 'packet', category: 'Beverages' },
  { id: '9', name: 'Toor Dal Premium Desi', is_loose: true, wholesale_price: 130, selling_price: 160, stock_quantity: 55.0, unit: 'kg', category: 'Dals & Pulses' },
  { id: '10', name: 'Surf Excel Quick Wash 1kg', is_loose: false, wholesale_price: 125, selling_price: 145, stock_quantity: 30, unit: 'packet', category: 'Household' },
];

export const INITIAL_SETTINGS = {
  shop_name: 'Gupta General & Kirana Store',
  tagline: 'Fresh Quality & Best Rates Guaranteed',
  address: 'Shop No. 4, Main Market, Sector 12',
  phone: '+91 98765 43210',
  upi_id: 'guptakirana@oksbi',
  active_discount_percent: 0,
  discount_banner: '',
  discount_expires_at: null,
  is_shop_open: true,
  opening_time: '07:00 AM',
  closing_time: '10:30 PM',
  closed_message: 'Dukan abhi band hai. Subah 7:00 baje khulegi.',
};

const STORAGE_KEYS = {
  PRODUCTS: 'sahayak_products',
  SETTINGS: 'sahayak_settings',
  BILLS: 'sahayak_bills',
  WHATSAPP_ORDERS: 'sahayak_wa_orders',
};

// Supabase client instance using .env credentials
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://kcwjdikwsuraafitxnmb.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtjd2pkaWt3c3VyYWFmaXR4bm1iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5Mjg1OTIzMiwiZXhwIjoyMTA4NDM1MjMyfQ.9j1YIFimSgm8wCUqxKgjqi9Ko95xNS0MYqufXEJfbnM';

export const supabase = createClient(supabaseUrl, supabaseKey);

// ==============================================================
// 1. PRODUCTS / INVENTORY
// ==============================================================
export async function fetchLiveProducts() {
  try {
    const { data, error } = await supabase.from('products').select('*').order('name');
    if (!error && data && data.length > 0) {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(data));
      return data;
    }
  } catch (e) {
    console.warn("Supabase fetch products notice:", e);
  }
  return getStoredProducts();
}

export async function syncProductToSupabase(product) {
  try {
    const payload = {
      name: product.name,
      category: product.category || 'General',
      is_loose: Boolean(product.is_loose),
      wholesale_price: Number(product.wholesale_price) || 0,
      selling_price: Number(product.selling_price) || 0,
      stock_quantity: Number(product.stock_quantity) || 0,
      unit: product.unit || 'kg',
      updated_at: new Date().toISOString()
    };

    // 1. If valid UUID, check/upsert directly
    if (product.id && typeof product.id === 'string' && product.id.length === 36) {
      await supabase.from('products').upsert({ id: product.id, ...payload });
      return;
    }

    // 2. Check if product already exists by exact name in Supabase
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .ilike('name', product.name.trim())
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await supabase.from('products').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('products').insert([payload]);
    }
  } catch (e) {
    console.warn("Product sync to Supabase:", e);
  }
}

// ==============================================================
// 2. STORE SETTINGS
// ==============================================================
export async function fetchLiveSettings() {
  try {
    const { data, error } = await supabase.from('store_settings').select('*').limit(1).single();
    if (!error && data) {
      const merged = { ...INITIAL_SETTINGS, ...data };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
      return merged;
    }
  } catch (e) {
    console.warn("Supabase fetch settings notice:", e);
  }
  return getStoredSettings();
}

export async function syncSettingsToSupabase(settings) {
  try {
    // If settings has a specific id from supabase use it, otherwise update the existing single row
    const payload = {
      shop_name: settings.shop_name,
      tagline: settings.tagline,
      address: settings.address,
      phone: settings.phone,
      upi_id: settings.upi_id,
      is_shop_open: settings.is_shop_open,
      opening_time: settings.opening_time,
      closing_time: settings.closing_time,
      closed_message: settings.closed_message,
      active_discount_percent: settings.active_discount_percent,
      updated_at: new Date().toISOString()
    };
    if (settings.id && typeof settings.id === 'string' && settings.id.length === 36) {
      await supabase.from('store_settings').update(payload).eq('id', settings.id);
    } else {
      // Update whatever single row exists or upsert
      const { data: existing } = await supabase.from('store_settings').select('id').limit(1).maybeSingle();
      if (existing?.id) {
        await supabase.from('store_settings').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('store_settings').insert([payload]);
      }
    }
  } catch (e) {
    console.warn("Settings sync to Supabase:", e);
  }
}

// ==============================================================
// 3. BILLS & INVOICES
// ==============================================================
export async function fetchLiveBills() {
  try {
    const { data, error } = await supabase.from('bills').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      localStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(data));
      return data;
    }
  } catch (e) {
    console.warn("Supabase fetch bills notice:", e);
  }
  return getStoredBills();
}

export async function syncBillToSupabase(bill) {
  try {
    const billPayload = {
      customer_name: bill.customer_name || 'Walk-in Customer',
      customer_phone: bill.customer_phone || null,
      subtotal: Number(bill.subtotal) || 0,
      discount_applied: Number(bill.discount_applied) || 0,
      total_amount: Number(bill.total_amount) || 0,
      payment_mode: bill.payment_mode || 'cash',
      payment_status: bill.payment_status || 'paid',
      source: bill.source || 'pos'
    };
    // Include bill_number if present
    if (bill.bill_number && typeof bill.bill_number === 'number') {
      billPayload.bill_number = bill.bill_number;
    }
    const { data, error } = await supabase.from('bills').insert([billPayload]).select().single();
    if (error) {
      console.warn("Supabase bill insert error:", error);
      return;
    }
    // Also save bill items if present
    if (bill.items && Array.isArray(bill.items) && data?.id) {
      const itemsPayload = bill.items.map(item => ({
        bill_id: data.id,
        product_id: (item.productId && item.productId.length === 36) ? item.productId : null,
        product_name: item.name || 'Item',
        quantity: Number(item.quantity) || 1,
        unit: item.unit || 'unit',
        unit_price: Number(item.unit_price) || 0,
        total_price: Number(item.total_price) || 0
      }));
      await supabase.from('bill_items').insert(itemsPayload);
    }
  } catch (e) {
    console.warn("Bill sync to Supabase:", e);
  }
}

// ==============================================================
// 4. WHATSAPP ORDERS
// ==============================================================
export async function fetchLiveWhatsAppOrders() {
  try {
    const { data, error } = await supabase.from('whatsapp_orders').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      localStorage.setItem(STORAGE_KEYS.WHATSAPP_ORDERS, JSON.stringify(data));
      return data;
    }
  } catch (e) {
    console.warn("Supabase fetch WA orders notice:", e);
  }
  return getStoredWhatsAppOrders();
}

export async function syncWhatsAppOrderToSupabase(order) {
  try {
    const orderPayload = {
      customer_phone: order.customer_phone || '+91 98765 12345',
      customer_name: order.customer_name || 'WhatsApp Customer',
      items: order.items || [],
      total_amount: Number(order.total_amount) || 0,
      payment_mode: order.payment_mode || 'counter',
      payment_status: order.payment_status || 'pending',
      status: ['pending', 'packed', 'completed', 'cancelled'].includes(order.status) ? order.status : 'pending'
    };

    // If order already has a valid supabase UUID, update that row instead of inserting a duplicate!
    if (order.id && typeof order.id === 'string' && order.id.length === 36) {
      const { data, error } = await supabase
        .from('whatsapp_orders')
        .update(orderPayload)
        .eq('id', order.id)
        .select()
        .single();
      if (!error && data) return data;
    } else {
      // First time registration: insert only once and return created ID
      const { data, error } = await supabase
        .from('whatsapp_orders')
        .insert([orderPayload])
        .select()
        .single();
      if (!error && data) return data;
    }
  } catch (e) {
    console.warn("WA order sync to Supabase:", e);
  }
  return null;
}

// Local storage backup loaders
export const getStoredProducts = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    return data ? JSON.parse(data) : INITIAL_PRODUCTS;
  } catch {
    return INITIAL_PRODUCTS;
  }
};

export const saveStoredProducts = (products) => {
  localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
};

export const getStoredSettings = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return data ? { ...INITIAL_SETTINGS, ...JSON.parse(data) } : INITIAL_SETTINGS;
  } catch {
    return INITIAL_SETTINGS;
  }
};

export const saveStoredSettings = (settings) => {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
};

export const getStoredBills = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.BILLS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveStoredBills = (bills) => {
  localStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(bills));
};

export const getStoredWhatsAppOrders = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.WHATSAPP_ORDERS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveStoredWhatsAppOrders = (orders) => {
  localStorage.setItem(STORAGE_KEYS.WHATSAPP_ORDERS, JSON.stringify(orders));
};
