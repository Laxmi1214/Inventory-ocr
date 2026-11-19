async function restoreStock() {
  try {
    const res = await fetch('http://127.0.0.1:8080/api/v1/receiving/receive-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productName: 'Claribid 500 Tablets',
        sku: 'MED-CLAR-500',
        batchNumber: 'BTH-CLAR-4091',
        expiryDate: '2027-08-31',
        quantity: 15,
        poNumber: 'PO-2026-0892',
        notes: 'Restoring baseline 50'
      })
    });
    const json = await res.json();
    console.log('Restore API Response:', json.inventory);
  } catch (err) {
    console.error('Restore Error:', err);
  }
}
restoreStock();
