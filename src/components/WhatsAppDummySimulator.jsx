import React, { useState } from 'react';
import { Send, Bot, User, CheckCircle2, QrCode, ArrowRight, ShieldCheck, Clock, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { agentWhatsAppOrderParser } from '../services/aiAgents';
import { syncWhatsAppOrderToSupabase, syncBillToSupabase } from '../services/supabaseClient';

export default function WhatsAppDummySimulator({
  products,
  storeSettings,
  whatsappOrders,
  setWhatsappOrders,
  setProducts,
  bills,
  setBills
}) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'ai',
      text: `Namaste! 🙏 Welcome to ${storeSettings.shop_name}. How can I assist you today? You can ask product prices or send your grocery list like:\n"5 kilo atta, 2kg chini, 1 packet surf excel pack kerdena aake le jaunga"`,
      time: '10:30 AM',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [activePendingBill, setActivePendingBill] = useState(null);

  // Send message from customer
  const handleSendMessage = async (customPrompt = '') => {
    const textToSend = customPrompt || inputText;
    if (!textToSend.trim() || isAiTyping) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsAiTyping(true);

    try {
      // 1. Pass customer prompt to WhatsApp Agent (Ollama Qwen 2.5:7b)
      const aiResponse = await agentWhatsAppOrderParser(textToSend, products, storeSettings);

      // 2. Check if customer ordered items
      if (aiResponse.intent === 'order' && aiResponse.items && aiResponse.items.length > 0) {
        // Calculate items and total bill with product-level deduplication
        const billItems = [];
        let calculatedTotal = 0;

        aiResponse.items.forEach((item) => {
          const product = products.find((p) => p.id === item.matchedProductId) ||
            products.find((p) => p.name.toLowerCase().includes(item.matchedProductName.toLowerCase().split(' ')[0]));

          if (product) {
            const qty = Number(item.requestedQuantity) || 1;
            const unitPrice = Number(product.selling_price) || 0;
            const existingItem = billItems.find((b) => b.productId === product.id);

            if (existingItem) {
              existingItem.quantity += qty;
              existingItem.total_price = parseFloat((existingItem.quantity * unitPrice).toFixed(2));
            } else {
              const lineTotal = parseFloat((qty * unitPrice).toFixed(2));
              billItems.push({
                productId: product.id,
                name: product.name,
                quantity: qty,
                unit: item.unit || product.unit,
                unit_price: unitPrice,
                total_price: lineTotal,
              });
            }
          }
        });

        calculatedTotal = parseFloat(billItems.reduce((acc, it) => acc + it.total_price, 0).toFixed(2));

        const pendingOrderObj = {
          id: `wa-order-${Date.now()}`,
          customer_name: 'WhatsApp Customer',
          customer_phone: '+91 98765 12345',
          items: billItems,
          total_amount: calculatedTotal,
          payment_mode: null, // pending customer choice
          payment_status: 'pending',
          status: 'pending',
          timestamp: new Date().toISOString(),
        };

        setActivePendingBill(pendingOrderObj);

        // AI reply with bill breakdown & payment prompt
        const summaryLines = billItems.map((b) => `• ${b.name}: ${b.quantity} ${b.unit} = ₹${b.total_price}`).join('\n');
        const replyText = `Aapka order note kar liya gaya hai! 📝\n\n${summaryLines}\n\n*Total Bill: ₹${calculatedTotal}*\n\nKirpya bataiye payment kaise karenge?\n1️⃣ Online UPI QR code se Pay karein\n2️⃣ Counter par cash se Pay karein`;

        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'ai',
            text: replyText,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            billDetails: pendingOrderObj,
            showPaymentButtons: true,
          },
        ]);
      } else {
        // Regular price query or greetings
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'ai',
            text: aiResponse.replyMessage,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'ai',
          text: `Namaste! Kuch technical samasya aayi hai. Kirpya dobara batayein ya seedhe phone karein.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsAiTyping(false);
    }
  };

  // Customer selects payment mode (Online QR or Pay on Counter)
  const handlePaymentModeSelect = (mode) => {
    if (!activePendingBill) return;

    // Immediately capture and clear to prevent double-click / double-trigger
    const currentPending = activePendingBill;
    setActivePendingBill(null);

    const updatedOrder = {
      ...currentPending,
      payment_mode: mode,
      payment_status: mode === 'online' ? 'paid (screenshot verified on counter)' : 'pay on counter',
    };

    // Add to Shopkeeper WhatsApp Queue
    setWhatsappOrders((prev) => [updatedOrder, ...prev]);

    // Create formal sales bill from this WhatsApp order
    const waBill = {
      id: `bill-wa-${Date.now()}`,
      bill_number: Math.floor(10000 + Math.random() * 90000),
      customer_name: updatedOrder.customer_name || 'WhatsApp Customer',
      customer_phone: updatedOrder.customer_phone || '+91 98765 12345',
      items: updatedOrder.items,
      subtotal: parseFloat(updatedOrder.total_amount),
      discount_applied: 0,
      total_amount: parseFloat(updatedOrder.total_amount),
      payment_mode: mode === 'online' ? 'online' : 'counter',
      payment_status: mode === 'online' ? 'paid' : 'pending',
      source: 'whatsapp',
      created_at: new Date().toISOString(),
    };

    if (setBills) {
      setBills((prev) => [waBill, ...(prev || [])]);
    }

    // Direct Sync to Supabase Database (Save order and attach Supabase UUID)
    syncWhatsAppOrderToSupabase(updatedOrder).then((savedOrder) => {
      if (savedOrder && savedOrder.id) {
        setWhatsappOrders((prev) =>
          prev.map((o) => (o.id === updatedOrder.id ? { ...o, id: savedOrder.id } : o))
        );
      }
    });
    syncBillToSupabase(waBill);

    // Deduct stock from inventory
    setProducts((prev) =>
      prev.map((prod) => {
        const match = updatedOrder.items.find((i) => i.productId === prod.id);
        if (match) {
          return {
            ...prod,
            stock_quantity: Math.max(0, parseFloat((prod.stock_quantity - match.quantity).toFixed(3))),
          };
        }
        return prod;
      })
    );

    if (mode === 'online') {
      const upiUrl = `upi://pay?pa=${storeSettings.upi_id}&pn=${encodeURIComponent(storeSettings.shop_name)}&am=${currentPending.total_amount}&cu=INR`;
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: 'user',
          text: 'Maine Online QR payment chuna hai.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        {
          id: Date.now() + 1,
          sender: 'ai',
          text: `Ye lijiye UPI Payment QR Code. Kirpya ₹${currentPending.total_amount} ka payment karein aur saman lete waqt payment screenshot counter par dikha dein. Aapka order shopkeeper ke dashboard par bhej diya gaya hai! 📦✨`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          showQrCode: true,
          qrPayload: upiUrl,
        },
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: 'user',
          text: 'Main counter par aakar cash dunga.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        {
          id: Date.now() + 1,
          sender: 'ai',
          text: `Theek hai! Aapka order book ho chuka hai. Aap seedhe dukan par aakar cash dekar samaan le sakte hain. Dashboard par shopkeeper ko notify kar diya gaya hai. Dhanyawad! 🙏`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  };

  // Shopkeeper marks order status in their dashboard
  const handleToggleOrderStatus = (orderId, newStatus) => {
    setWhatsappOrders((prev) =>
      prev.map((ord) => {
        if (ord.id === orderId) {
          const updated = { ...ord, status: newStatus };
          syncWhatsAppOrderToSupabase(updated);
          return updated;
        }
        return ord;
      })
    );
  };

  return (
    <div className="wa-dummy-grid">
      {/* Left Column: Simulated Mobile WhatsApp View */}
      <div className="wa-phone-frame">
        {/* Top bar */}
        <div className="wa-top-bar">
          <div className="wa-avatar">S</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{storeSettings.shop_name} (AI Sahayak)</div>
            <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>Online • WhatsApp Agentic AI</div>
          </div>
        </div>

        {/* Quick test buttons */}
        <div style={{ background: '#f8fafc', padding: '0.4rem 0.6rem', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '0.4rem', overflowX: 'auto' }}>
          <button
            onClick={() => handleSendMessage('atta aur chini ka kya bhav hai?')}
            style={{ fontSize: '0.72rem', background: '#fff', border: '1px solid #cbd5e1', padding: '0.2rem 0.5rem', borderRadius: '4px', whiteSpace: 'nowrap' }}
          >
            "atta chini ka bhav?"
          </button>
          <button
            onClick={() => handleSendMessage('5 kilo atta , 10kg chini , 5 kg besan pack kerdena aake le jaunga')}
            style={{ fontSize: '0.72rem', background: '#fff', border: '1px solid #cbd5e1', padding: '0.2rem 0.5rem', borderRadius: '4px', whiteSpace: 'nowrap' }}
          >
            "5kg atta, 10kg chini..."
          </button>
        </div>

        {/* Chat Body */}
        <div className="wa-chat-body">
          {messages.map((msg) => (
            <div key={msg.id} className={`wa-msg ${msg.sender === 'user' ? 'outgoing' : 'incoming'}`}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>

              {/* Payment Buttons */}
              {msg.showPaymentButtons && activePendingBill && (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <button
                    onClick={() => handlePaymentModeSelect('online')}
                    style={{
                      background: '#075e54',
                      color: '#fff',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                    }}
                  >
                    Pay Online (Show QR)
                  </button>
                  <button
                    onClick={() => handlePaymentModeSelect('counter')}
                    style={{
                      background: '#fff',
                      color: '#075e54',
                      border: '1.5px solid #075e54',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                    }}
                  >
                    Pay on Counter (Cash)
                  </button>
                </div>
              )}

              {/* QR Code Embed */}
              {msg.showQrCode && (
                <div style={{ marginTop: '0.75rem', background: '#fff', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                  <QRCodeSVG value={msg.qrPayload} size={150} style={{ margin: '0 auto' }} />
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#075e54', marginTop: '0.4rem' }}>
                    Scan with GPay / PhonePe / Paytm
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>UPI: {storeSettings.upi_id}</div>
                </div>
              )}

              <div style={{ fontSize: '0.65rem', color: '#64748b', textAlign: 'right', marginTop: '0.25rem' }}>
                {msg.time}
              </div>
            </div>
          ))}

          {isAiTyping && (
            <div className="wa-msg incoming" style={{ color: '#64748b', fontStyle: 'italic' }}>
              typing...
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="wa-input-bar">
          <input
            type="text"
            className="wa-input-box"
            placeholder="Type a message (e.g. 5kg atta pack kar do)..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <button className="wa-send-btn" onClick={() => handleSendMessage()}>
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Right Column: Shopkeeper WhatsApp Incoming Orders Dashboard */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.25rem', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
              WhatsApp Orders Queue (Shopkeeper View)
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Orders received through the WhatsApp AI dummy appear here in real-time.
            </p>
          </div>
          <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '0.3rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700 }}>
            {whatsappOrders.filter((o) => o.status === 'pending').length} Orders Pending
          </span>
        </div>

        {whatsappOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
            <Clock size={40} style={{ margin: '0 auto 0.5rem auto' }} />
            <p>No orders yet from WhatsApp.</p>
            <p style={{ fontSize: '0.8rem' }}>Send an order in the simulator on the left to see it appear here!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {whatsappOrders.map((order) => (
              <div
                key={order.id}
                style={{
                  border: order.status === 'completed' ? '1px solid #e2e8f0' : '1.5px solid #0f766e',
                  borderRadius: '10px',
                  padding: '1rem',
                  background: order.status === 'completed' ? '#f8fafc' : '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                      {order.customer_name} ({order.customer_phone})
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Received: {new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •
                      Mode: <span style={{ fontWeight: 600, color: order.payment_mode === 'online' ? '#0f766e' : '#b45309' }}>{order.payment_mode ? order.payment_mode.toUpperCase() : 'COUNTER'}</span>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.6rem',
                      borderRadius: '4px',
                      background: order.status === 'completed' ? '#f1f5f9' : '#fef3c7',
                      color: order.status === 'completed' ? '#475569' : '#92400e',
                    }}
                  >
                    {order.status === 'completed' ? 'Order Taken / Delivered' : 'Pending Action'}
                  </span>
                </div>

                {/* Items List */}
                <div style={{ margin: '0.75rem 0', background: '#f8fafc', padding: '0.6rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.78rem', color: '#475569', marginBottom: '0.3rem' }}>Items to pack:</div>
                  {order.items.map((it, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', color: '#334155' }}>
                      <span>• {it.name} ({it.quantity} {it.unit})</span>
                      <span style={{ fontWeight: 600 }}>₹{it.total_price}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px dashed #cbd5e1', marginTop: '0.4rem', paddingTop: '0.4rem', display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                    <span>Total Amount:</span>
                    <span>₹{order.total_amount}</span>
                  </div>
                </div>

                {/* Action Controls for Shopkeeper */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  {order.status !== 'completed' ? (
                    <button
                      onClick={() => handleToggleOrderStatus(order.id, 'completed')}
                      className="action-btn-primary"
                      style={{ background: '#16a34a', padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}
                    >
                      <Check size={16} /> Mark as Taken / Delivered
                    </button>
                  ) : (
                    <button
                      onClick={() => handleToggleOrderStatus(order.id, 'pending')}
                      style={{ fontSize: '0.78rem', color: '#64748b', textDecoration: 'underline' }}
                    >
                      Re-open Order
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
