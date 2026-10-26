import React, { useState, useMemo } from 'react';
import { Search, Plus, Minus, Trash2, Printer, CheckCircle2, ShoppingBag } from 'lucide-react';
import LooseWeightModal from './LooseWeightModal';
import PrintableReceipt from './PrintableReceipt';

export default function PosBillingView({ products, setProducts, storeSettings, bills, setBills }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cartItems, setCartItems] = useState([]);
  const [activeModalProduct, setActiveModalProduct] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash'); // 'cash' | 'online'
  const [lastGeneratedBill, setLastGeneratedBill] = useState(null);

  const categories = ['All', 'Grains & Flours', 'Sugar & Salt', 'Oils & Ghee', 'Instant Food', 'Snacks & Biscuits', 'Dals & Pulses', 'Household'];

  // Filter products by search and category
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = selectedCategory === 'All' || p.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [products, searchQuery, selectedCategory]);

  const activeDiscount = storeSettings.active_discount_percent || 0;

  // Clicking an item card
  const handleItemCardClick = (product) => {
    if (product.is_loose) {
      // Loose items trigger Kg & Gm popup evaluation
      setActiveModalProduct(product);
    } else {
      // Packed item: add 1 unit or increment existing
      addItemToCart({
        productId: product.id,
        name: product.name,
        is_loose: false,
        quantity: 1,
        unit: product.unit || 'packet',
        displayWeight: `1 ${product.unit || 'pkt'}`,
        unit_price: product.selling_price,
        effective_price: activeDiscount > 0 ? product.selling_price * ((100 - activeDiscount) / 100) : product.selling_price,
        total_price: activeDiscount > 0 ? product.selling_price * ((100 - activeDiscount) / 100) : product.selling_price,
      });
    }
  };

  const addItemToCart = (itemPayload) => {
    setCartItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.productId === itemPayload.productId && !i.is_loose);
      if (existingIdx > -1) {
        const copy = [...prev];
        const newQty = copy[existingIdx].quantity + itemPayload.quantity;
        const newTotal = (newQty * copy[existingIdx].effective_price).toFixed(2);
        copy[existingIdx] = {
          ...copy[existingIdx],
          quantity: newQty,
          displayWeight: `${newQty} ${copy[existingIdx].unit}`,
          total_price: parseFloat(newTotal),
        };
        return copy;
      }
      return [...prev, itemPayload];
    });
  };

  const updateItemQty = (index, delta) => {
    setCartItems((prev) => {
      const copy = [...prev];
      const target = copy[index];
      const newQty = target.quantity + delta;
      if (newQty <= 0) {
        return copy.filter((_, i) => i !== index);
      }
      const newTotal = (newQty * target.effective_price).toFixed(2);
      copy[index] = {
        ...target,
        quantity: newQty,
        displayWeight: `${newQty} ${target.unit}`,
        total_price: parseFloat(newTotal),
      };
      return copy;
    });
  };

  const removeItem = (index) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  };

  const clearCart = () => {
    setCartItems([]);
  };

  // Cart totals
  const subtotal = cartItems.reduce((acc, item) => acc + item.total_price, 0);
  const totalAmount = subtotal.toFixed(2);

  // Generate & Print Bill
  const handleGenerateBill = (triggerPrint = true) => {
    if (cartItems.length === 0) return;

    const newBill = {
      id: `bill-${Date.now()}`,
      bill_number: Math.floor(10000 + Math.random() * 90000),
      customer_name: customerName.trim() || 'Walk-in Customer',
      items: [...cartItems],
      subtotal: parseFloat(totalAmount),
      discount_applied: activeDiscount > 0 ? parseFloat(((subtotal / ((100 - activeDiscount) / 100)) * (activeDiscount / 100)).toFixed(2)) : 0,
      total_amount: parseFloat(totalAmount),
      payment_mode: paymentMode,
      payment_status: 'paid',
      source: 'pos',
      created_at: new Date().toISOString(),
    };

    // Deduct stock from products
    setProducts((prev) =>
      prev.map((prod) => {
        const cartMatches = cartItems.filter((i) => i.productId === prod.id);
        if (cartMatches.length > 0) {
          const usedQty = cartMatches.reduce((acc, cur) => acc + cur.quantity, 0);
          return {
            ...prod,
            stock_quantity: Math.max(0, parseFloat((prod.stock_quantity - usedQty).toFixed(3))),
          };
        }
        return prod;
      })
    );

    // Save bill locally and sync to Supabase
    setBills((prev) => [newBill, ...prev]);
    setLastGeneratedBill(newBill);
    setCartItems([]);
    setCustomerName('');

    // Async cloud sync to Supabase
    try {
      import('../services/supabaseClient').then(({ syncBillToSupabase }) => {
        syncBillToSupabase(newBill);
      });
    } catch (e) {
      console.warn("Supabase bill sync error:", e);
    }

    if (triggerPrint) {
      // Direct reliable print method that works across all browsers
      printBillDirectly(newBill, storeSettings);
    }
  };

  const printBillDirectly = (bill, settings) => {
    const printWin = window.open('', '_blank', 'width=400,height=600');
    if (!printWin) {
      alert('Please allow popups to print the thermal bill');
      return;
    }

    const itemsHtml = (bill.items || []).map((it) => `
      <tr style="border-bottom: 1px dotted #ccc;">
        <td style="padding: 4px 0;">${it.name}</td>
        <td style="text-align: center;">${it.displayWeight || `${it.quantity} ${it.unit || ''}`}</td>
        <td style="text-align: right;">₹${it.unit_price}</td>
        <td style="text-align: right; font-weight: bold;">₹${it.total_price}</td>
      </tr>
    `).join('');

    const upiLink = `upi://pay?pa=${settings.upi_id}&pn=${encodeURIComponent(settings.shop_name)}&am=${bill.total_amount}&cu=INR`;

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Thermal Bill #${bill.bill_number}</title>
          <style>
            @page { margin: 0; size: 80mm auto; }
            body {
              font-family: monospace, sans-serif;
              width: 78mm;
              margin: 0 auto;
              padding: 10px;
              color: #000;
              font-size: 12px;
            }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { border-bottom: 1px solid #000; text-align: left; padding: 3px 0; }
            .dash { border-top: 1px dashed #000; margin: 6px 0; }
            .total-line { display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; margin-top: 4px; border-top: 1px solid #000; padding-top: 4px; }
            .text-center { text-align: center; }
          </style>
        </head>
        <body>
          <div class="text-center">
            <h2 style="margin: 0 0 3px 0; font-size: 18px;">${settings.shop_name}</h2>
            <div style="font-size: 11px;">${settings.address}</div>
            <div style="font-size: 11px;">Tel: ${settings.phone}</div>
            <div style="font-size: 10px; color: #555;">Hours: ${settings.opening_time || '07:00 AM'} - ${settings.closing_time || '10:30 PM'}</div>
          </div>

          <div class="dash"></div>
          <div style="font-size: 11px; display: flex; justify-content: space-between;">
            <span>Bill No: <strong>#${bill.bill_number}</strong></span>
            <span>POS</span>
          </div>
          <div style="font-size: 11px;">Date: ${new Date(bill.created_at).toLocaleString('en-IN')}</div>
          <div style="font-size: 11px;">Customer: <strong>${bill.customer_name || 'Walk-in'}</strong></div>
          <div class="dash"></div>

          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Rate</th>
                <th style="text-align: right;">Amt</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="dash"></div>
          <div style="display: flex; justify-content: space-between;">
            <span>Subtotal:</span>
            <span>₹${bill.subtotal}</span>
          </div>
          ${bill.discount_applied > 0 ? `
            <div style="display: flex; justify-content: space-between; color: red;">
              <span>Discount:</span>
              <span>- ₹${bill.discount_applied}</span>
            </div>
          ` : ''}
          <div class="total-line">
            <span>Grand Total:</span>
            <span>₹${bill.total_amount}</span>
          </div>

          <div class="text-center" style="margin-top: 15px;">
            <div style="font-size: 10px; font-weight: bold;">Scan to Pay via UPI</div>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(upiLink)}" style="margin-top: 5px; width: 110px; height: 110px;" />
            <div style="font-size: 10px; margin-top: 3px;">UPI: ${settings.upi_id}</div>
            <div style="font-weight: bold; margin-top: 8px; font-size: 12px;">Dhanyawad! Please Visit Again 🙏</div>
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWin.document.close();
  };

  return (
    <div className="pos-layout">
      {/* Left Section: Big Search & Casual Big Touch Grid */}
      <div className="pos-catalog-panel">
        {/* Big Search Bar */}
        <div className="big-search-box">
          <Search className="big-search-icon" size={24} />
          <input
            type="text"
            className="big-search-input"
            placeholder="Search items (e.g. Atta, Sugar, Biscuit, Oil, Maggi)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        {/* Categories Bar */}
        <div className="category-chips">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`chip-btn ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Casual Big Buttons Grid */}
        <div className="products-grid">
          {filteredProducts.map((prod) => (
            <button
              key={prod.id}
              className="big-product-card"
              onClick={() => handleItemCardClick(prod)}
            >
              <div>
                <span className={prod.is_loose ? 'product-loose-tag' : 'product-packed-tag'}>
                  {prod.is_loose ? 'Loose (Kg/Gm)' : 'Packed'}
                </span>
                <div className="product-card-title">{prod.name}</div>
              </div>

              <div className="product-card-footer">
                <div>
                  <span className="product-card-price">₹{prod.selling_price}</span>
                  <span className="product-card-unit"> /{prod.unit}</span>
                </div>
                <span className="product-card-stock">
                  Stock: {prod.stock_quantity}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right Section: Bill Generation & Cart Panel */}
      <div className="pos-cart-panel">
        <div className="cart-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShoppingBag size={20} color="#0f766e" />
            <h2>Current Bill</h2>
          </div>
          {cartItems.length > 0 && (
            <button className="clear-btn" onClick={clearCart}>
              Clear All
            </button>
          )}
        </div>

        {/* Customer Name Input */}
        <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid #f1f5f9' }}>
          <input
            type="text"
            placeholder="Customer Name or Mobile (Optional)"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            style={{
              width: '100%',
              padding: '0.6rem 0.85rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.88rem',
            }}
          />
        </div>

        {/* Items List */}
        <div className="cart-items-list">
          {cartItems.length === 0 ? (
            <div className="cart-empty-state">
              <ShoppingBag size={48} strokeWidth={1} style={{ margin: '0 auto 0.5rem auto', color: '#cbd5e1' }} />
              <p>No items added yet</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                Tap on any product card or search to start billing.
              </p>
            </div>
          ) : (
            cartItems.map((item, idx) => (
              <div key={idx} className="cart-item-row">
                <div className="cart-item-info">
                  <h4>{item.name}</h4>
                  <p>
                    {item.displayWeight} @ ₹{item.effective_price || item.unit_price}/{item.unit}
                  </p>
                </div>

                <div className="cart-item-controls">
                  {!item.is_loose && (
                    <>
                      <button className="qty-pill-btn" onClick={() => updateItemQty(idx, -1)}>
                        <Minus size={14} />
                      </button>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.quantity}</span>
                      <button className="qty-pill-btn" onClick={() => updateItemQty(idx, 1)}>
                        <Plus size={14} />
                      </button>
                    </>
                  )}
                  <div className="cart-item-price">₹{item.total_price}</div>
                  <button onClick={() => removeItem(idx)} style={{ color: '#94a3b8', padding: '0.2rem' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Cart Footer */}
        <div className="cart-footer">
          <div className="summary-line">
            <span>Items Count:</span>
            <span>{cartItems.length}</span>
          </div>
          {activeDiscount > 0 && (
            <div className="summary-line" style={{ color: '#dc2626' }}>
              <span>Store Discount ({activeDiscount}%):</span>
              <span>Active</span>
            </div>
          )}
          <div className="summary-line total">
            <span>Total Payable:</span>
            <span>₹{totalAmount}</span>
          </div>

          {/* Payment Mode Selector */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button
              onClick={() => setPaymentMode('cash')}
              style={{
                flex: 1,
                padding: '0.45rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: paymentMode === 'cash' ? '2px solid #0f766e' : '1px solid #cbd5e1',
                background: paymentMode === 'cash' ? '#f0fdfa' : '#fff',
                color: paymentMode === 'cash' ? '#0f766e' : '#64748b',
              }}
            >
              Cash (Counter)
            </button>
            <button
              onClick={() => setPaymentMode('online')}
              style={{
                flex: 1,
                padding: '0.45rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: paymentMode === 'online' ? '2px solid #0f766e' : '1px solid #cbd5e1',
                background: paymentMode === 'online' ? '#f0fdfa' : '#fff',
                color: paymentMode === 'online' ? '#0f766e' : '#64748b',
              }}
            >
              Online UPI QR
            </button>
          </div>

          {/* Big Action Buttons */}
          <div className="big-bill-actions">
            <button
              className="action-btn-secondary"
              onClick={() => handleGenerateBill(false)}
              disabled={cartItems.length === 0}
            >
              <CheckCircle2 size={18} />
              Save Bill
            </button>
            <button
              className="action-btn-primary"
              onClick={() => handleGenerateBill(true)}
              disabled={cartItems.length === 0}
            >
              <Printer size={18} />
              Print Bill
            </button>
          </div>
        </div>
      </div>

      {/* Loose Item Weight Modal */}
      <LooseWeightModal
        product={activeModalProduct}
        isOpen={Boolean(activeModalProduct)}
        onClose={() => setActiveModalProduct(null)}
        onAddToCart={addItemToCart}
        activeDiscount={activeDiscount}
      />

      {/* Hidden Thermal Printable Slip Component for window.print() */}
      <PrintableReceipt bill={lastGeneratedBill} storeSettings={storeSettings} />
    </div>
  );
}
