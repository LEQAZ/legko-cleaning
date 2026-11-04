import { calculate, normalizePhone, SERVICES, MINIMUM, EXTRAS, PROPERTIES, PROPERTY_EXTRAS } from './calculator.mjs';
import { setupPageDrag } from './page-drag.js';
import { restoreCalculatorState, rememberCalculatorState, rememberPagePosition, restorePagePosition } from './calculator-session.js';

const $ = (selector) => document.querySelector(selector);
const money = (value) => new Intl.NumberFormat('ru-RU').format(value);
document.querySelectorAll('[data-service-rate]').forEach((element) => {
  const service = SERVICES[element.dataset.serviceRate];

  element.textContent = `${money(service.rate)} ₽`;
});
document.querySelectorAll('[data-extra-price]').forEach((element) => {
  element.textContent = money(EXTRAS[element.dataset.extraPrice]);
});
const property = document.body.dataset.propertyType || 'apartment';
const profile = PROPERTIES[property];
const state = restoreCalculatorState(property);
const range = $('#area-range');
const areaNumber = $('#area-number');
const propertyLabel = profile.label;
for (const input of [range, areaNumber]) { input.min = profile.minArea; input.max = profile.maxArea; }
areaNumber.required = true;
$('label[for="area-number"]').textContent = profile.areaLabel;
$('#area-help').firstElementChild.textContent = `${profile.minArea} м²`;
$('#area-help').lastElementChild.textContent = `${profile.maxArea} м²`;
$('#property-scope').textContent = profile.scope;
$('#property-extras-note').textContent = profile.extrasNote;
for (const key of profile.extras) {
  const definition = PROPERTY_EXTRAS[key];
  const row = document.createElement('div'); row.className = 'quantity-item property-extra-item';
  const label = document.createElement('label'); label.htmlFor = `extra-${key}`;
  const name = document.createElement('strong'); name.textContent = definition.label;
  const caption = document.createElement('small'); caption.textContent = `${definition.scope} · ${money(definition.rate)} ₽ / ${definition.unit}`;
  label.append(name, caption);
  const controls = document.createElement('div'); controls.className = 'quantity-control';
  const minus = document.createElement('button'); minus.type = 'button'; minus.id = `${key}-minus`;
  minus.dataset.count = key; minus.dataset.delta = '-1'; minus.textContent = '−'; minus.setAttribute('aria-label', `Уменьшить: ${definition.label}`);
  const input = document.createElement('input'); input.type = 'number'; input.id = `extra-${key}`; input.dataset.quantity = key;
  input.min = '0'; input.step = definition.kind === 'area' ? '0.1' : '1'; input.value = '0'; input.inputMode = 'decimal'; input.required = true;
  input.setAttribute('aria-label', `${definition.label}, ${definition.unit}`);
  const unit = document.createElement('span'); unit.className = 'quantity-unit'; unit.textContent = definition.kind === 'area' ? 'м²' : 'ступ.'; unit.setAttribute('aria-hidden', 'true');
  const plus = document.createElement('button'); plus.type = 'button'; plus.id = `${key}-plus`;
  plus.dataset.count = key; plus.dataset.delta = '1'; plus.textContent = '+'; plus.setAttribute('aria-label', `Увеличить: ${definition.label}`);
  controls.append(minus, input, unit, plus); row.append(label, controls); $('#property-extra-controls').append(row);
}
const quantityInputs = [...document.querySelectorAll('[data-quantity]')];

function renderReceipt(container, items) {
  container.replaceChildren();
  for (const item of items) {
    const row = document.createElement('div');
    row.dataset.receiptItem = item.key;
    if (item.key === 'minimum') row.classList.add('minimum-surcharge');
    const label = document.createElement('dt');
    label.textContent = item.label;
    const amount = document.createElement('dd');
    amount.textContent = `${money(item.amount)} ₽`;
    row.append(label, amount);
    container.append(row);
  }
}

function render() {
  const result = calculate(state);
  $('#total-price').textContent = money(result.total);
  $('#estimate-service').textContent = result.name;
  renderReceipt($('#estimate-lines'), result.lineItems);
  $('#minimum-amount').textContent = `${money(MINIMUM)} ₽`;
  for (const input of quantityInputs) {
    const key = input.dataset.quantity;
    input.value = state[key];
    input.setCustomValidity('');
    $(`[data-count="${key}"][data-delta="-1"]`).disabled = state[key] === 0;
  }
  $('#quantity-error').textContent = '';
  document.querySelectorAll('[data-single-extra]').forEach((input) => { input.checked = state[input.dataset.singleExtra] === 1; });
  range.value = state.area;
  areaNumber.value = state.area;
  document.querySelectorAll('[name="service"]').forEach((input) => { input.checked = input.value === state.service; });
  rememberCalculatorState(state);
}

range.addEventListener('input', () => { state.area = Number(range.value); render(); });
areaNumber.addEventListener('input', () => {
  const value = Number(areaNumber.value);
  if (Number.isInteger(value) && value >= profile.minArea && value <= profile.maxArea) { state.area = value; render(); }
});
areaNumber.addEventListener('change', () => {
  state.area = Math.min(profile.maxArea, Math.max(profile.minArea, Math.round(Number(areaNumber.value) || profile.minArea)));
  render();
});
document.querySelectorAll('[name="service"]').forEach((input) => input.addEventListener('change', () => { state.service = input.value; render(); }));
document.querySelectorAll('[data-pick-service]').forEach((button) => button.addEventListener('click', () => {
  state.service = button.dataset.pickService;
  render();
  $('#calculator').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}));
function updateQuantity(key, value, input) {
  input.setCustomValidity('');
  try {
    calculate({ ...state, [key]: value });
    state[key] = value;
    render();
  } catch {
    const message = input.step === '0.1'
      ? 'Укажите площадь от 0 м², не более одного знака после запятой.'
      : (Number.isSafeInteger(value) && value >= 0 ? 'Количество слишком велико для точного расчёта.' : 'Укажите целое количество: 0 или больше.');
    input.setCustomValidity(message);
    $('#quantity-error').textContent = message;
  }
}
document.querySelectorAll('[data-count]').forEach((button) => button.addEventListener('click', () => {
  const key = button.dataset.count;
  updateQuantity(key, Math.max(0, state[key] + Number(button.dataset.delta)), $(`[data-quantity="${key}"]`));
}));
quantityInputs.forEach((input) => {
  input.addEventListener('input', () => {
    if (input.value !== '') updateQuantity(input.dataset.quantity, Number(input.value), input);
  });
  input.addEventListener('change', () => {
    updateQuantity(input.dataset.quantity, input.value === '' ? 0 : Number(input.value), input);
    if (!input.checkValidity()) input.reportValidity();
  });
});
document.querySelectorAll('[data-single-extra]').forEach((input) => input.addEventListener('change', () => {
  state[input.dataset.singleExtra] = Number(input.checked);
  render();
}));

const menuButton = $('.menu-toggle');
function closeMenu() { $('#navigation').classList.remove('is-open'); menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', 'Открыть меню'); }
menuButton.addEventListener('click', () => {
  const opened = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(opened));
  menuButton.setAttribute('aria-label', opened ? 'Закрыть меню' : 'Открыть меню');
  $('#navigation').classList.toggle('is-open', opened);
});
document.querySelectorAll('#navigation a').forEach((link) => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
document.addEventListener('click', (event) => { if (!event.target.closest('.header')) closeMenu(); });

const dialog = $('#request-dialog');
const form = $('#request-form');
$('#customer-phone').addEventListener('input', () => { $('#form-error').textContent = ''; });
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const invalidQuantity = [areaNumber, ...quantityInputs].find(input => !input.checkValidity());
  if (invalidQuantity) { invalidQuantity.reportValidity(); invalidQuantity.focus(); return; }
  const name = $('#customer-name').value.trim();
  const phone = normalizePhone($('#customer-phone').value);
  if (name.length < 2) { $('#form-error').textContent = 'Укажите имя: не менее двух символов.'; $('#customer-name').focus(); return; }
  if (!phone) { $('#form-error').textContent = 'Укажите российский номер: +7 или 8 и ещё 10 цифр.'; $('#customer-phone').focus(); return; }
  $('#form-error').textContent = '';
  const result = calculate(state);
  $('#dialog-greeting').textContent = `${name}, вот ваш демонстрационный расчёт:`;
  const summary = $('#dialog-summary');
  summary.replaceChildren();
  for (const [label, value] of [['Объект', propertyLabel], ['Уборка', result.name], ['Площадь', `${result.area} м²`], ['Телефон', phone], ['Стоимость', `${money(result.total)} ₽`]]) {
    const row = document.createElement('div');
    const term = document.createElement('dt'); term.textContent = label;
    const definition = document.createElement('dd'); definition.textContent = value;
    row.append(term, definition); summary.append(row);
  }
  renderReceipt($('#dialog-receipt'), result.lineItems);
  dialog.showModal();
});
$('#close-dialog').addEventListener('click', () => dialog.close());
$('#dialog-done').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
});
render();
setupPageDrag({ beforeNavigate: rememberPagePosition });
document.querySelectorAll('.property-tabs a').forEach(link => link.addEventListener('click', (event) => {
  if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) rememberPagePosition(link.href);
}));
restorePagePosition();

// Subtle pointer effects run only with a mouse and when reduced motion is off.
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const glow = document.createElement('div');
glow.className = 'cursor-glow';
glow.setAttribute('aria-hidden', 'true');
const pointerEffects = document.createElement('div');
pointerEffects.className = 'pointer-effects';
pointerEffects.setAttribute('aria-hidden', 'true');
pointerEffects.append(glow);
document.body.append(pointerEffects);
const updateMotionPreference = () => {
  document.body.classList.toggle('motion-enabled', !motionPreference.matches && finePointer.matches);
  if (!document.body.classList.contains('motion-enabled')) {
    glow.classList.remove('is-active');
    document.querySelectorAll('[data-tilt]').forEach(element => {
      element.style.setProperty('--tilt-x', '0deg');
      element.style.setProperty('--tilt-y', '0deg');
    });
  }
};
updateMotionPreference();
motionPreference.addEventListener('change', updateMotionPreference);
finePointer.addEventListener('change', updateMotionPreference);
let pointerFrame = 0;
document.addEventListener('pointermove', (event) => {
  if (!document.body.classList.contains('motion-enabled')) return;
  cancelAnimationFrame(pointerFrame);
  const { clientX, clientY } = event;
  const button = event.target.closest('.button, .circle-button');
  pointerFrame = requestAnimationFrame(() => {
    glow.style.transform = `translate3d(${clientX}px, ${clientY}px, 0)`;
    glow.classList.add('is-active');
    if (button) {
      const rect = button.getBoundingClientRect();
      button.style.setProperty('--button-x', `${clientX - rect.left}px`);
      button.style.setProperty('--button-y', `${clientY - rect.top}px`);
    }
  });
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => glow.classList.remove('is-active'));
document.querySelectorAll('.architecture-frame, .service-card').forEach((element) => {
  element.dataset.tilt = '';
  let frame = 0;
  element.addEventListener('pointermove', (event) => {
    if (!document.body.classList.contains('motion-enabled')) return;
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      element.style.setProperty('--tilt-x', `${-y * 4}deg`);
      element.style.setProperty('--tilt-y', `${x * 4}deg`);
    });
  });
  element.addEventListener('pointerleave', () => {
    cancelAnimationFrame(frame);
    element.style.setProperty('--tilt-x', '0deg');
    element.style.setProperty('--tilt-y', '0deg');
  });
});
