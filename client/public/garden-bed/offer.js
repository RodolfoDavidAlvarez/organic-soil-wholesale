const $ = s => document.querySelector(s)
const fragment = new URLSearchParams(location.hash.slice(1))
const token = fragment.get('offer') || fragment.get('order') || ''
const staffMode = fragment.get('staff') === '1'
if (location.hostname.endsWith('organicsoilwholesale.com') && staffMode) {
  location.replace('https://sswworld.com/garden-bed-staff.html' + location.hash)
  throw Error('Opening staff checkout.')
}
let quote = null, busy = false, card = null, manualDisclosure = null, staffTest = false
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n / 100)
const dateLabel = step => step.due_at
  ? new Date(step.due_at).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' Arizona time'
  : new Date(step.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const form = $('#customer-form'), review = $('#review'), formError = $('#form-error')
const choiceIntro = [...$('#choose').children].slice(0, [...$('#choose').children].indexOf(form))
if (staffMode) document.body.classList.add('staff-mode')
// Payment errors must remain visible after the address form is hidden.
$('#choose').append(formError)
async function api(action, body) {
  let response
  try {
    response = await fetch(`/api/garden-bed?action=${action}`, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify({ ...body, token }) } : {}) })
  } catch { throw Error('Connection interrupted. Check your connection and try again.') }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) { const e = Error(data.error || 'We could not complete that step. Please try again.'); e.status = response.status; throw e }
  return data
}
function error(e) { formError.textContent = e.message; formError.hidden = false; formError.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
function row(parent, label, value, total = false) {
  const item = document.createElement('div'), left = document.createElement('span'), right = document.createElement('span')
  if (total) item.className = 'total'
  left.textContent = label; right.textContent = value; item.append(left, right); parent.append(item)
}
function setBusy(value) {
  busy = value
  for (const element of [$('#review-button'), $('#pay-button'), $('#manual-pay'), $('#edit-details')]) if (element) element.disabled = value || (element.id === 'review-button' && !token)
  form.querySelectorAll('input,select').forEach(element => { element.disabled = value })
  document.querySelectorAll('[name=plan]').forEach(element => { element.disabled = value || !!quote })
  if (manualDisclosure) manualDisclosure.querySelector('summary').setAttribute('aria-disabled', String(value))
}
function clearAuthorizations() {
  for (const id of ['payment-consent', 'future-card-consent', 'recording-stopped', 'customer-authorized']) if ($('#' + id)) $('#' + id).checked = false
  if ($('#manual-result')) { $('#manual-result').textContent = ''; $('#manual-result').hidden = true }
  if (card) card.clear()
}
function invalidate() {
  if (busy) return
  quote = null; form.hidden = false; review.hidden = true; formError.hidden = true
  choiceIntro.forEach(element => { element.hidden = false }); $('#choose').classList.remove('is-review')
  document.querySelectorAll('[name=plan]').forEach(element => { element.disabled = false })
  clearAuthorizations()
  if (manualDisclosure) manualDisclosure.open = false
  $('#pay-button').hidden = false
}
const edit = document.createElement('button')
edit.id = 'edit-details'; edit.type = 'button'; edit.className = 'edit-details'; edit.textContent = 'Edit details'
edit.addEventListener('click', () => { invalidate(); form.scrollIntoView({ behavior: 'smooth', block: 'start' }) })
review.prepend(edit)
const futureCardChoice = document.createElement('label'); futureCardChoice.className = 'check'; futureCardChoice.hidden = true
futureCardChoice.innerHTML = '<input id="future-card-consent" type="checkbox"><span><strong>Optional: save this card for future orders</strong><br><span id="future-card-terms"></span></span>'
$('#card-security-note').after(futureCardChoice)
function futureCardConsent() {
  const accepted = !!quote?.future_card_terms_digest && !futureCardChoice.hidden && $('#future-card-consent').checked
  return { future_card_accepted: accepted, ...(accepted ? { future_card_terms_digest: quote.future_card_terms_digest } : {}) }
}
form.addEventListener('input', invalidate)
document.querySelectorAll('[name=plan]').forEach(element => element.addEventListener('change', () => {
  invalidate()
  if ($('#test-schedule-field')) $('#test-schedule-field').hidden = !staffTest || element.value !== 'monthly'
}))
$('a[href="#choose"]').addEventListener('click', event => { event.preventDefault(); $('#choose').scrollIntoView({ behavior: 'smooth' }) })
if (token) $('#access-note').hidden = true
else $('#review-button').disabled = true
if (staffMode) {
  const field = document.createElement('label'); field.id = 'test-schedule-field'; field.className = 'field notice'; field.hidden = true
  field.innerHTML = 'Staff test timing<select name="test_schedule"><option value="monthly">Normal monthly dates</option><option value="accelerated">Accelerated $1 staff test</option></select><span class="muted">Accelerated timing requires an authorized staff test offer. The next charges are about 1 and 2 hours after this quote. Review the exact charge times below before authorizing. Customer plans always use monthly dates.</span>'
  form.prepend(field)
}
function showQuote(data) {
  quote = data; $('#summary').replaceChildren(); $('#payment-schedule').replaceChildren()
  row($('#summary'), data.is_test ? 'Staff test · no product or delivery' : 'Package', money(data.subtotal_cents))
  row($('#summary'), 'Tax', money(data.tax_cents)); row($('#summary'), 'Delivery', data.is_test ? 'Not applicable' : 'Free')
  row($('#summary'), 'Order total', money(data.total_cents), true)
  data.schedule.forEach((step, index) => row($('#payment-schedule'), index === 0 ? 'Due today' : `Payment ${index + 1} · ${dateLabel(step)}`, money(step.amount_cents), index === 0))
  $('#consent-text').textContent = data.terms; clearAuthorizations()
  futureCardChoice.hidden = data.is_test || !data.future_card_terms || !data.future_card_terms_digest
  $('#future-card-terms').textContent = data.future_card_terms || ''
  $('#pay-button').textContent = `Continue to Stripe · ${money(data.schedule[0].amount_cents)} today`
  $('#review').querySelector('h3').textContent = data.is_test ? 'Review your staff test' : 'Review your order'
  if (data.is_test) $('#post-payment-note').textContent = 'This is a real staff test payment. No product or delivery is included. After payment is verified, you can practice submitting delivery preferences.'
  $('#card-security-note').textContent = data.schedule.length > 1
    ? 'Stripe securely saves this card for exactly two more automatic payments on the dates shown. This plan ends after three payments. We do not store your full card number or security code.'
    : 'One payment. No recurring charges. Stripe handles your card details; we do not store your full card number or security code.'
  choiceIntro.forEach(element => { element.hidden = true }); $('#choose').classList.add('is-review')
  review.hidden = false; form.hidden = true; review.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
form.addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return
  // Read enabled fields before locking the form.
  const data = Object.fromEntries(new FormData(form)); data.plan = $('[name=plan]:checked').value
  if (data.plan !== 'monthly' || data.test_schedule !== 'accelerated') delete data.test_schedule
  setBusy(true); formError.hidden = true
  try { const result = await api('quote', data); if (result.existing_order) await status(); else showQuote(result) }
  catch (e) { error(e) }
  finally { setBusy(false) }
})
async function recoverPaymentError(e) {
  // A conflict or lost response may follow a created order. Read status before offering any retry.
  try {
    const existing = await api('status')
    if (existing.order_number) { renderStatus(existing); return }
    setBusy(false); invalidate(); error(Error([409, 410].includes(e.status) ? 'Your quote needs to be refreshed. Review your total and authorize the new schedule before paying.' : e.message))
  } catch {
    $('#offer').hidden = true; $('#delivery').hidden = false; $('#delivery-content').hidden = true
    $('#delivery h1').textContent = 'Check your payment status'
    $('#payment-status').textContent = 'We could not confirm this attempt. Use Refresh payment status before trying another payment. Contact the office if this continues.'
  }
}
$('#pay-button').addEventListener('click', async () => {
  if (busy || !quote) return
  if (!$('#payment-consent').checked) { error(Error('Accept the payment authorization above to continue.')); return }
  setBusy(true); formError.hidden = true
  try {
    const data = await api('checkout', { quote_id: quote.id, terms_digest: quote.terms_digest, accepted: true, ...futureCardConsent() })
    const url = new URL(data.url)
    if (url.protocol !== 'https:' || !['checkout.stripe.com', 'www.organicsoilwholesale.com', 'organicsoilwholesale.com'].includes(url.hostname)) throw Error('Could not verify the payment link.')
    location.assign(url.href)
  } catch (e) { await recoverPaymentError(e) }
  finally { setBusy(false) }
})
const statusActions = document.createElement('div'); statusActions.className = 'status-actions'; $('#payment-status').after(statusActions)
const statusSchedule = document.createElement('div'); statusSchedule.className = 'summary'; statusSchedule.hidden = true; statusActions.after(statusSchedule)
const refresh = document.createElement('button'); refresh.type = 'button'; refresh.className = 'light'; refresh.textContent = 'Refresh payment status'
refresh.addEventListener('click', async () => { if (busy) return; setBusy(true); refresh.disabled = true; try { await status() } finally { setBusy(false); refresh.disabled = false } })
statusActions.append(refresh)
function paymentLink(url, label, allowedHost, parent = statusActions) {
  try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.hostname !== allowedHost) return
    const link = document.createElement('a'); link.href = parsed.href; link.textContent = label; link.className = 'button'; parent.append(link)
  } catch { /* Untrusted or missing provider URLs never become links. */ }
}
function renderStatus(data) {
  $('#offer').hidden = true; $('#delivery').hidden = false; $('#delivery-content').hidden = true
  statusActions.querySelectorAll('a').forEach(link => link.remove()); statusSchedule.replaceChildren(); statusSchedule.hidden = !data.order_number
  $('#delivery h1').textContent = data.delivery_allowed ? (data.is_test ? 'Staff test payment received' : 'Let’s plan your delivery.') : 'Your payment status'
  $('#payment-status').textContent = data.converted
    ? `${data.order_number} · ${money(data.paid_cents)} received · ${money(data.balance_cents)} remaining${data.is_test ? ' · STAFF TEST — no delivery.' : ''}`
    : 'Your payment has not been confirmed. Resume the secure payment below, or refresh to check again.'
  if (data.checkout_url) paymentLink(data.checkout_url, 'Resume secure payment', 'checkout.stripe.com')
  if (!data.converted && data.installments?.some(step => ['failed', 'requires_action'].includes(step.status))) $('#payment-status').textContent = 'No payment has been received. This attempt needs office review before another payment. Contact your representative.'
  if (data.status === 'manual_review') $('#payment-status').textContent += ' Office review is required.'
  else if (data.status === 'paused') $('#payment-status').textContent += ' Automatic payments are paused. Contact the office for help.'
  for (const step of data.installments || []) {
    const state = ({ paid: 'Paid', pending: 'Scheduled', processing: 'Processing', failed: 'Needs attention', requires_action: 'Needs authorization' })[step.status] || step.status
    row(statusSchedule, `Payment ${step.number} · ${dateLabel(step)} · ${state}`, money(step.amount_cents))
    if (step.payment_url) paymentLink(step.payment_url, `Resolve payment ${step.number} securely`, 'invoice.stripe.com', statusSchedule)
  }
  if (data.installments?.length > 1) row(statusSchedule, 'Card saved securely with Stripe', data.card_saved ? 'Yes' : 'Not confirmed')
  if (data.card_summary && /^\d{4}$/.test(data.card_summary.last4)) row(statusSchedule, 'Saved card', `${String(data.card_summary.brand).toUpperCase()} ending ${data.card_summary.last4} · ${data.card_summary.exp_month}/${data.card_summary.exp_year}`)
  if (data.future_card_reuse?.consented || data.future_card_reuse?.status === 'revoked') row(statusSchedule, 'Future orders', ({ ready: 'Saved with your permission. Each new order needs approval.', pending: 'Card saving is being confirmed.', needs_review: 'Card saving needs office review.', revoked: 'Future-purchase permission withdrawn. Existing authorized installment payments continue.' })[data.future_card_reuse.status] || 'Not confirmed')
  if (data.delivery_allowed) void showDelivery(data)
}
async function showDelivery(data) {
  const content = $('#delivery-content'), deliveryForm = $('#delivery-form'), address = data.address
  if (!address) return
  content.hidden = false
  content.querySelector('p').textContent = data.is_test ? 'STAFF TEST — practice delivery preferences only. No product or truck will be scheduled.' : 'Deliveries begin in November 2026. Choose a preferred date and time. We’ll contact you to confirm the route and availability.'
  $('#delivery-address').textContent = `Delivery address: ${[address.line1, address.line2, address.city, 'AZ', address.postal_code].filter(Boolean).join(', ')}. Contact the office if this needs to change.`
  deliveryForm.elements.contact_name.value = address.name; deliveryForm.elements.contact_phone.value = address.phone
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]))
  const today = `${parts.year}-${parts.month}-${parts.day}`
  deliveryForm.elements.alternative_date.min = today > '2026-11-01' ? today : '2026-11-01'
  $('#availability-note')?.remove()
  const note = document.createElement('p'); note.id = 'availability-note'; note.className = 'muted'; $('#delivery-address').after(note)
  try {
    const availability = await api('slots'), available = availability.slots.filter(slot => slot.available > 0)
    note.textContent = available.length ? 'Choose an available weekday. The office confirms your date and time.' : 'The office is arranging routes. Contact your representative for availability.'
    const select = document.createElement('select'); select.name = 'preferred_date'; select.required = true
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose a delivery date'; select.append(placeholder)
    for (const day of [...new Set(available.map(slot => slot.day))]) { const option = document.createElement('option'); option.value = day; option.textContent = `${dateLabel({ due_date: day })} · ${available.filter(slot => slot.day === day).map(slot => slot.window).join(' / ')}`; select.append(option) }
    deliveryForm.elements.preferred_date.replaceWith(select)
    deliveryForm.querySelector('button').disabled = !available.length
    if (data.delivery_request) {
      for (const [key, value] of Object.entries(data.delivery_request)) if (deliveryForm.elements[key] && typeof value === 'string') deliveryForm.elements[key].value = value
      $('#delivery-result').textContent = data.delivery_request.status === 'confirmed' ? `Your delivery is confirmed for ${data.delivery_request.preferred_date} · ${data.delivery_request.window}.` : 'Your preferences are saved. Scheduling is pending confirmation.'
    }
  } catch { note.textContent = 'We could not load delivery dates. Refresh payment status to try again.'; deliveryForm.querySelector('button').disabled = true }
}
async function status() {
  try {
    const data = await api('status')
    staffTest = staffMode && data.is_test === true
    if ($('#test-schedule-field')) $('#test-schedule-field').hidden = !staffTest || $('[name=plan]:checked').value !== 'monthly'
    if (!data.order_number) {
      $('#offer').hidden = false; $('#delivery').hidden = true
      if (quote) { setBusy(false); invalidate() }
      if (fragment.has('order')) error(Error('No payment has been started for this offer. Review your total below to continue.'))
      return
    }
    renderStatus(data)
  } catch (e) {
    if ($('#offer').hidden || fragment.has('order')) { $('#offer').hidden = true; $('#delivery').hidden = false; $('#delivery-content').hidden = true; $('#payment-status').textContent = e.message }
    else error(e)
  }
}
$('#delivery-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return
  const data = Object.fromEntries(new FormData(event.target)); data.acknowledged = event.target.elements.acknowledged.checked
  const button = event.target.querySelector('button'); setBusy(true); button.disabled = true
  try { const result = await api('delivery', data); $('#delivery-result').textContent = result.message }
  catch (e) { $('#delivery-result').textContent = e.message }
  finally { setBusy(false); button.disabled = false }
})
async function setupStaffEntry() {
  const note = document.createElement('p'); note.className = 'muted'; note.id = 'staff-entry-note'; review.append(note)
  try {
    const config = await api('config')
    if (!config.manual_entry_enabled || !config.publishable_key) { note.textContent = config.manual_entry_message || 'Phone card entry is unavailable. Continue with secure Stripe checkout.'; return }
    const script = document.createElement('script'); script.src = 'https://js.stripe.com/v3/'
    await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; document.head.append(script) })
    const stripe = window.Stripe(config.publishable_key), elements = stripe.elements()
    card = elements.create('card', { hidePostalCode: true, style: { base: { fontSize: '16px', color: '#264027' } } })
    manualDisclosure = document.createElement('details'); manualDisclosure.className = 'staff-entry'
    manualDisclosure.innerHTML = '<summary>Representative: enter a card by phone</summary><div class="staff-entry-content"><h3>Authorize a phone payment</h3><p class="muted">Read the exact total, payment dates and authorization above to the customer. Stop call recording and transcription before collecting card details.</p><label class="check"><input id="recording-stopped" type="checkbox"><span>Call recording and transcription are stopped.</span></label><label class="check"><input id="customer-authorized" type="checkbox"><span>The customer authorized the exact amounts, dates and saved-card terms above.</span></label><div id="stripe-card" class="card-note"></div><button id="manual-pay" type="button" class="wide">Collect authorized payment</button><p id="manual-result" class="error" role="status" hidden></p></div>'
    note.remove(); review.append(manualDisclosure)
    manualDisclosure.querySelector('summary').addEventListener('click', event => { if (busy) event.preventDefault() })
    manualDisclosure.addEventListener('toggle', () => { $('#pay-button').hidden = manualDisclosure.open; clearAuthorizations() })
    card.mount('#stripe-card')
    $('#manual-pay').addEventListener('click', async () => {
      if (busy || !quote) return
      const resultNode = $('#manual-result'); resultNode.hidden = false
      if (!$('#payment-consent').checked || !$('#recording-stopped').checked || !$('#customer-authorized').checked) { resultNode.textContent = 'Confirm the payment authorization and both phone-payment checkboxes first.'; return }
      const details = Object.fromEntries(new FormData(form)); let submitted = false
      setBusy(true); resultNode.textContent = 'Submitting payment. Please wait…'; formError.hidden = true
      try {
        const result = await stripe.createPaymentMethod({ type: 'card', card, billing_details: { name: details.name, email: details.email, phone: details.phone, address: { line1: details.line1, line2: details.line2, city: details.city, state: 'AZ', postal_code: details.postal_code, country: 'US' } } })
        if (result.error) throw Error(result.error.message)
        submitted = true
        await api('manual-pay', { quote_id: quote.id, terms_digest: quote.terms_digest, accepted: true, customer_authorized: true, recording_stopped: true, payment_method: result.paymentMethod.id, ...futureCardConsent() })
        card.clear(); await status()
      } catch (e) { if (submitted) { card.clear(); await recoverPaymentError(e) } else resultNode.textContent = e.message }
      finally { setBusy(false) }
    })
  } catch { note.textContent = 'Phone card entry could not load. You can still continue with secure Stripe checkout.' }
}
if (token) { setBusy(true); await status(); setBusy(false) }
if (staffMode && token) void setupStaffEntry()
