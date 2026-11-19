async function testDispatch() {
  try {
    const res = await fetch('http://127.0.0.1:8080/api/v1/inventory/dispatch-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productName: 'Claribid 500 Tablets',
        sku: 'MED-CLAR-500',
        batchNumber: 'BTH-CLAR-4091',
        quantity: 15,
        orderNumber: 'ORD-2026-4413',
        notes: 'Test dispatch of Claribid'
      })
    });
    const json = await res.json();
    console.log('Dispatch API Response:', json);
  } catch (err) {
    console.error('Dispatch Test Error:', err);
  }
}
testDispatch();
