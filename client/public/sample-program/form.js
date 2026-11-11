const form = document.querySelector('form');
const status = document.getElementById('status');
const requestId = crypto.randomUUID();
form.addEventListener('submit', async event => {
  event.preventDefault();
  if(!form.reportValidity()) return;
  const button = form.querySelector('button[type=submit]');
  const data = Object.fromEntries(new FormData(form));
  data.consent = form.elements.consent.checked;
  data.request_id = requestId;
  data.campaign = new URLSearchParams(location.search).get('utm_source') || 'direct';
  button.disabled = true;button.textContent = 'Saving…';status.className='status';status.textContent='';
  try {
    const response = await fetch('/api/sample-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const result = await response.json();
    if(!response.ok || !result.success) throw new Error(result.error || 'Please try again.');
    form.querySelectorAll('fieldset, .check, button, .form-note').forEach(el=>el.hidden=true);
    status.className='status success';status.tabIndex=-1;
    status.textContent = data.kind==='feedback' ? 'Thank you. Your feedback has been received. Our team will review it and follow up if you requested help.' : 'Your sample request is in. Our team will review your project and contact you to confirm the product, quantity, and any shipping or delivery costs before fulfillment. No payment is due now.';
    status.focus();
  } catch(error) {
    status.className='status error';status.textContent=error.message==='Failed to fetch'?'Connection interrupted. Please try again.':error.message;
    button.disabled=false;button.textContent=data.kind==='feedback'?'Send feedback':'Request my free sample';
  }
});
