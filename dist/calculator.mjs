// Demonstration prices: start learning here. Values are not a real company's offer.
export const SERVICES = Object.freeze({
  regular: { name: 'Поддерживающая', rate: 80 },
  deep: { name: 'Генеральная', rate: 140 },
  renovation: { name: 'После ремонта', rate: 180 },
});
export const MINIMUM = 3000;
export const EXTRAS = Object.freeze({ window: 350, oven: 600, fridge: 450, petHair: 500 });

// These object-specific rates are illustrative, not a market quotation.
export const PROPERTY_EXTRAS = Object.freeze({
  balcony: { label: 'Уборка балкона / лоджии', rate: 120, unit: 'м²', kind: 'area', scope: 'Пол и доступные поверхности' },
  porch: { label: 'Уборка крыльца', rate: 100, unit: 'м²', kind: 'area', scope: 'Пол и доступные поверхности' },
  terrace: { label: 'Уборка террасы / веранды', rate: 90, unit: 'м²', kind: 'area', scope: 'Мытьё пола' },
  stairs: { label: 'Внутренняя лестница', rate: 70, unit: 'ступень', kind: 'count', scope: 'Ступени и подступенки' },
});
export const PROPERTIES = Object.freeze({
  apartment: {
    label: 'Квартира', minArea: 20, maxArea: 1000, defaultArea: 50, extras: ['balcony'],
    areaLabel: 'Площадь квартиры без балкона / лоджии',
    scope: 'Комнаты, кухня, коридор и санузел входят в основную площадь. Балкон или лоджию укажите отдельно.',
    extrasNote: 'Здесь считается пол и доступные поверхности балкона. Остекление задаётся отдельно — количеством створок в услуге «Мытьё окон».',
  },
  house: {
    label: 'Частный дом', minArea: 20, maxArea: 1000, defaultArea: 100, extras: ['porch', 'terrace', 'stairs'],
    areaLabel: 'Площадь помещений на всех этажах',
    scope: 'Сложите площадь помещений всех этажей. Крыльцо, террасу и ступени не включайте: они рассчитываются отдельно ниже.',
    extrasNote: 'Крыльцо и терраса считаются по площади, лестница — по числу ступеней. Повторно включать их в основную площадь не нужно.',
  },
});

export function calculate({ property = 'apartment', service = 'regular', area = 50, windows = 0, oven = 0, fridge = 0, petHair = 0, balcony = 0, porch = 0, terrace = 0, stairs = 0 } = {}) {
  if (!Object.hasOwn(PROPERTIES, property)) throw new RangeError('Unknown property type');
  const profile = PROPERTIES[property];
  if (!Object.hasOwn(SERVICES, service)) throw new RangeError('Unknown cleaning service');
  if (!Number.isInteger(area) || area < profile.minArea || area > profile.maxArea) throw new RangeError('Area is outside the property range');
  for (const quantity of [windows, oven, fridge, petHair]) {
    if (!Number.isSafeInteger(quantity) || quantity < 0) throw new RangeError('Quantities must be nonnegative whole numbers');
  }
  if (oven > 1 || fridge > 1 || petHair > 1) throw new RangeError('This extra service is either selected or not selected');
  const rawBase = area * SERVICES[service].rate;
  const base = Math.max(MINIMUM, rawBase);
  const minimumSurcharge = base - rawBase;
  const extraItems = [];
  if (windows) extraItems.push({ key: 'windows', label: `Окна: ${windows} × ${EXTRAS.window} ₽ за створку`, amount: windows * EXTRAS.window });
  if (oven) extraItems.push({ key: 'oven', label: 'Чистка духового шкафа', amount: EXTRAS.oven });
  if (fridge) extraItems.push({ key: 'fridge', label: 'Мытьё холодильника', amount: EXTRAS.fridge });
  if (petHair) extraItems.push({ key: 'petHair', label: 'Дополнительный сбор шерсти животных', amount: EXTRAS.petHair });
  const propertyQuantities = { balcony, porch, terrace, stairs };
  for (const [key, quantity] of Object.entries(propertyQuantities)) {
    const definition = PROPERTY_EXTRAS[key];
    if (!Number.isFinite(quantity) || quantity < 0) throw new RangeError('Invalid property extra quantity');
    if (!profile.extras.includes(key) && quantity !== 0) throw new RangeError('This extra is not available for this property');
    let amount;
    if (definition.kind === 'area') {
      const tenths = Math.round(quantity * 10);
      if (!Number.isSafeInteger(tenths) || (quantity > 0 && tenths === 0) || Math.abs(quantity * 10 - tenths) > 1e-7) throw new RangeError('Area must have at most one decimal place');
      amount = tenths * (definition.rate / 10);
    } else {
      if (!Number.isSafeInteger(quantity)) throw new RangeError('Steps must be a whole number');
      amount = quantity * definition.rate;
    }
    if (quantity > 0) {
      const formattedQuantity = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(quantity);
      const receiptUnit = definition.kind === 'count' ? 'ступ.' : definition.unit;
      extraItems.push({ key, label: `${definition.label}: ${formattedQuantity} ${receiptUnit} × ${definition.rate} ₽`, amount });
    }
  }
  const extras = extraItems.reduce((sum, item) => sum + item.amount, 0);
  if (!Number.isSafeInteger(base + extras)) throw new RangeError('Quantity is too large for an exact total');
  const lineItems = [{ key: 'base', label: `Уборка ${area} м² × ${SERVICES[service].rate} ₽`, amount: rawBase }];
  if (minimumSurcharge > 0) lineItems.push({ key: 'minimum', label: 'Доплата до минимальной стоимости', amount: minimumSurcharge });
  lineItems.push(...extraItems);
  return { property, service, area, windows, oven, fridge, petHair, balcony, porch, terrace, stairs, rawBase, base, extras, total: base + extras,
    minimumSurcharge, lineItems, minimumApplied: rawBase < MINIMUM, name: SERVICES[service].name, rate: SERVICES[service].rate };
}

export function normalizePhone(value) {
  const digits = value.replace(/\D/g, '');
  return /^[78]\d{10}$/.test(digits) ? '+7' + digits.slice(1) : null;
}
