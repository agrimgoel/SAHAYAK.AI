import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  FileSpreadsheet,
  MessageSquare,
  Shield,
  Percent,
  Sparkles,
  Wifi,
  Store
} from 'lucide-react';
import PosBillingView from './components/PosBillingView';
import BillScannerView from './components/BillScannerView';
import WhatsAppDummySimulator from './components/WhatsAppDummySimulator';
import AdminDashboardView from './components/AdminDashboardView';
import {
  getStoredProducts,
  saveStoredProducts,
  getStoredSettings,
  saveStoredSettings,
  getStoredBills,
  saveStoredBills,
  getStoredWhatsAppOrders,
  saveStoredWhatsAppOrders,
  fetchLiveProducts,
  fetchLiveSettings,
  fetchLiveBills,
  fetchLiveWhatsAppOrders,
  syncSettingsToSupabase,
  supabase
} from './services/supabaseClient';

export default function App() {
  const [activeTab, setActiveTab] = useState('pos'); // 'pos' | 'scanner' | 'whatsapp' | 'admin'
  const [products, setProducts] = useState(getStoredProducts);
  const [storeSettings, setStoreSettings] = useState(getStoredSettings);
  const [bills, setBills] = useState(getStoredBills);
  const [whatsappOrders, setWhatsappOrders] = useState(getStoredWhatsAppOrders);
  const [dbStatus, setDbStatus] = useState('connecting');

  // Load live data from Supabase on launch
  useEffect(() => {
    async function loadCloudData() {
      try {
        const [cloudProducts, cloudSettings, cloudBills, cloudOrders] = await Promise.all([
          fetchLiveProducts(),
          fetchLiveSettings(),
          fetchLiveBills(),
          fetchLiveWhatsAppOrders()
        ]);

        if (cloudProducts && cloudProducts.length > 0) setProducts(cloudProducts);
        if (cloudSettings) setStoreSettings(cloudSettings);
        if (cloudBills) setBills(cloudBills);
        if (cloudOrders) setWhatsappOrders(cloudOrders);
        setDbStatus('connected');
      } catch (err) {
        console.warn('Initial cloud load fallback to cache:', err);
        setDbStatus('local');
      }
    }
    loadCloudData();
  }, []);

  // Sync to local storage & cloud
  useEffect(() => {
    saveStoredProducts(products);
  }, [products]);

  useEffect(() => {
    saveStoredSettings(storeSettings);
    syncSettingsToSupabase(storeSettings);
  }, [storeSettings]);

  useEffect(() => {
    saveStoredBills(bills);
  }, [bills]);

  useEffect(() => {
    saveStoredWhatsAppOrders(whatsappOrders);
  }, [whatsappOrders]);

  const activeDiscount = storeSettings.active_discount_percent || 0;
  const pendingWaCount = whatsappOrders.filter(o => o.status === 'pending').length;

  return (
    <div className="app-container">
      {/* Minimalist Top Navigation Bar */}
      <header className="top-navbar">
        <div className="brand-badge">
          <div className="brand-logo-icon">
            <Store size={22} />
          </div>
          <div className="brand-titles">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h1>{storeSettings.shop_name}</h1>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.5rem',
                  borderRadius: '9999px',
                  background: storeSettings.is_shop_open !== false ? '#dcfce7' : '#fee2e2',
                  color: storeSettings.is_shop_open !== false ? '#15803d' : '#b91c1c',
                  border: `1px solid ${storeSettings.is_shop_open !== false ? '#86efac' : '#fca5a5'}`
                }}
              >
                {storeSettings.is_shop_open !== false ? '● OPEN' : '● CLOSED'}
              </span>
            </div>
            <p>Sahayak.AI • Kirana Smart Assistant ({storeSettings.opening_time || '07:00 AM'} - {storeSettings.closing_time || '10:30 PM'})</p>
          </div>
        </div>

        {/* Global Active Discount Pill */}
        {activeDiscount > 0 && (
          <div className="active-discount-pill">
            <Percent size={14} />
            <span>Store Offer: {activeDiscount}% OFF on All Items!</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <nav className="nav-tabs">
          <button
            className={`nav-tab-btn ${activeTab === 'pos' ? 'active' : ''}`}
            onClick={() => setActiveTab('pos')}
          >
            <ShoppingBag size={17} />
            <span>Billing POS</span>
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'scanner' ? 'active' : ''}`}
            onClick={() => setActiveTab('scanner')}
          >
            <FileSpreadsheet size={17} />
            <span>Upload Bill (Inventory)</span>
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'whatsapp' ? 'active' : ''}`}
            onClick={() => setActiveTab('whatsapp')}
          >
            <MessageSquare size={17} />
            <span>WhatsApp AI Dummy</span>
            {pendingWaCount > 0 && (
              <span style={{ background: '#16a34a', color: '#fff', fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '9999px', fontWeight: 700 }}>
                {pendingWaCount}
              </span>
            )}
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            <Shield size={17} />
            <span>Admin Control</span>
          </button>
        </nav>
      </header>

      {/* Main Workspace Body */}
      <main className="main-content">
        {activeTab === 'pos' && (
          <PosBillingView
            products={products}
            setProducts={setProducts}
            storeSettings={storeSettings}
            bills={bills}
            setBills={setBills}
          />
        )}

        {activeTab === 'scanner' && (
          <BillScannerView
            products={products}
            setProducts={setProducts}
          />
        )}

        {activeTab === 'whatsapp' && (
          <WhatsAppDummySimulator
            products={products}
            storeSettings={storeSettings}
            whatsappOrders={whatsappOrders}
            setWhatsappOrders={setWhatsappOrders}
            setProducts={setProducts}
            bills={bills}
            setBills={setBills}
          />
        )}

        {activeTab === 'admin' && (
          <AdminDashboardView
            storeSettings={storeSettings}
            setStoreSettings={setStoreSettings}
            bills={bills}
            products={products}
          />
        )}
      </main>
    </div>
  );
}
