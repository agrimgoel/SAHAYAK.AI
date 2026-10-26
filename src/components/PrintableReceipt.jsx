import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function PrintableReceipt({ bill, storeSettings }) {
  if (!bill) return null;

  const upiLink = `upi://pay?pa=${storeSettings.upi_id}&pn=${encodeURIComponent(storeSettings.shop_name)}&am=${bill.total_amount}&cu=INR`;

  return (
    <div id="printable-bill-area" className="printable-receipt">
      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 2px 0', textTransform: 'uppercase' }}>
          {storeSettings.shop_name}
        </h2>
        <p style={{ margin: 0, fontSize: '11px', color: '#333' }}>{storeSettings.address}</p>
        <p style={{ margin: 0, fontSize: '11px', color: '#333' }}>Tel: {storeSettings.phone}</p>
        <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#666' }}>
          Hours: {storeSettings.opening_time || '07:00 AM'} - {storeSettings.closing_time || '10:30 PM'}
        </p>
      </div>

      <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '6px 0', fontSize: '11px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Bill No: <strong>#{bill.bill_number || String(Date.now()).slice(-5)}</strong></span>
          <span>{bill.source?.toUpperCase() || 'POS'}</span>
        </div>
        <div>Date: {new Date(bill.created_at || Date.now()).toLocaleString('en-IN')}</div>
        <div>Customer: <strong>{bill.customer_name || 'Walk-in'}</strong></div>
      </div>

      <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', margin: '6px 0' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #000', textAlign: 'left' }}>
            <th style={{ padding: '2px 0' }}>Item</th>
            <th style={{ textAlign: 'center' }}>Qty</th>
            <th style={{ textAlign: 'right' }}>Rate</th>
            <th style={{ textAlign: 'right' }}>Amt</th>
          </tr>
        </thead>
        <tbody>
          {(bill.items || []).map((item, idx) => (
            <tr key={idx} style={{ borderBottom: '1px dotted #ccc' }}>
              <td style={{ padding: '3px 0' }}>{item.name}</td>
              <td style={{ textAlign: 'center' }}>
                {item.displayWeight || `${item.quantity} ${item.unit || ''}`}
              </td>
              <td style={{ textAlign: 'right' }}>₹{item.unit_price}</td>
              <td style={{ textAlign: 'right', fontWeight: 'bold' }}>₹{item.total_price}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ borderTop: '1px dashed #000', paddingTop: '4px', fontSize: '11px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Subtotal:</span>
          <span>₹{bill.subtotal}</span>
        </div>
        {bill.discount_applied > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b91c1c' }}>
            <span>Store Offer:</span>
            <span>- ₹{bill.discount_applied}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 'bold', marginTop: '4px', borderTop: '1px solid #000', paddingTop: '3px' }}>
          <span>Grand Total:</span>
          <span>₹{bill.total_amount}</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '12px', paddingTop: '8px', borderTop: '1px dotted #888' }}>
        <p style={{ margin: '0 0 4px 0', fontSize: '10px', fontWeight: 'bold' }}>Scan to Pay via UPI</p>
        <div style={{ display: 'inline-block', padding: '4px', background: '#fff' }}>
          <QRCodeSVG value={upiLink} size={90} />
        </div>
        <p style={{ margin: '4px 0 0 0', fontSize: '9px', color: '#444' }}>UPI ID: {storeSettings.upi_id}</p>
        <p style={{ margin: '6px 0 0 0', fontSize: '11px', fontWeight: 'bold' }}>Dhanyawad! Please Visit Again 🙏</p>
      </div>
    </div>
  );
}
