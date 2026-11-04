import { calculate, PROPERTIES, PROPERTY_EXTRAS } from './calculator.mjs';

const STATE_KEY = 'legko-calculator-v1';
const VIEW_KEY = 'legko-next-view-v1';
const commonKeys = ['service', 'area', 'windows', 'oven', 'fridge', 'petHair'];

function read(storage, key) {
  try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
}

export function restoreCalculatorState(property, storage = sessionStorage) {
  const profile = PROPERTIES[property];
  const emptyExtras = Object.fromEntries(Object.keys(PROPERTY_EXTRAS).map(key => [key, 0]));
  const defaults = { property, service: 'regular', area: profile.defaultArea, windows: 0, oven: 0, fridge: 0, petHair: 0, ...emptyExtras };
  const saved = read(storage, STATE_KEY);
  if (saved?.version !== 1) return defaults;
  const restored = { ...defaults };
  for (const key of commonKeys) if (Object.hasOwn(saved.common || {}, key)) restored[key] = saved.common[key];
  for (const key of profile.extras) if (Object.hasOwn(saved.objects?.[property] || {}, key)) restored[key] = saved.objects[property][key];
  try { calculate(restored); return restored; } catch { return defaults; }
}

export function rememberCalculatorState(state, storage = sessionStorage) {
  calculate(state);
  const old = read(storage, STATE_KEY);
  const saved = { version: 1, common: {}, objects: old?.version === 1 ? { ...old.objects } : {} };
  for (const key of commonKeys) saved.common[key] = state[key];
  saved.objects[state.property] = Object.fromEntries(PROPERTIES[state.property].extras.map(key => [key, state[key]]));
  try { storage.setItem(STATE_KEY, JSON.stringify(saved)); } catch { /* Optional tab-local persistence. */ }
}

const anchors = ['.hero', '#services', '#calculator', '.area-control', '.property-extras', '.quantity-extras', '#process', '#request', '#questions', '.footer'];

export function rememberPagePosition(destination, storage = sessionStorage) {
  const url = new URL(destination, location.href);
  if (url.origin !== location.origin) return;
  let view = { destination: url.pathname, top: scrollY };
  if (scrollY > 3) {
    const header = document.querySelector('.header')?.getBoundingClientRect().height || 0;
    const reference = scrollY + header + 24;
    const options = anchors.map(selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { selector, top: rect.top + scrollY, height: rect.height };
    }).filter(item => item && item.height > 0 && item.top <= reference).sort((a, b) => a.top - b.top);
    const chosen = options.at(-1);
    if (chosen) view = { ...view, anchor: chosen.selector, offset: reference - chosen.top,
      ratio: Math.max(0, Math.min(1, (reference - chosen.top) / chosen.height)) };
  }
  try { storage.setItem(VIEW_KEY, JSON.stringify(view)); } catch { /* Browsing still works without storage. */ }
}

export function restorePagePosition(storage = sessionStorage) {
  const saved = read(storage, VIEW_KEY);
  try { storage.removeItem(VIEW_KEY); } catch {}
  if (!saved || saved.destination !== location.pathname) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const element = saved.anchor && document.querySelector(saved.anchor);
    let top = saved.top;
    if (element) {
      const rect = element.getBoundingClientRect();
      const header = document.querySelector('.header')?.getBoundingClientRect().height || 0;
      const offset = saved.anchor === '.property-extras' ? saved.ratio * rect.height : saved.offset;
      top = rect.top + scrollY + offset - header - 24;
    }
    scrollTo({ top: Math.max(0, Number(top) || 0), behavior: 'instant' });
  }));
}
