import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreCalculatorState, rememberCalculatorState } from '../dist/calculator-session.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}

test('switching property preserves shared choices and restores object-specific zones', () => {
  const storage = memoryStorage();
  const apartment = { ...restoreCalculatorState('apartment', storage), service:'deep', area:280, windows:12, oven:1, fridge:1, petHair:1, balcony:6 };
  rememberCalculatorState(apartment, storage);
  const house = restoreCalculatorState('house', storage);
  for (const key of ['service','area','windows','oven','fridge','petHair']) assert.equal(house[key], apartment[key]);
  assert.equal(house.balcony, 0);
  house.porch = 4; house.terrace = 10; house.stairs = 12;
  rememberCalculatorState(house, storage);
  const returnedApartment = restoreCalculatorState('apartment', storage);
  assert.equal(returnedApartment.balcony, 6);
  assert.equal(returnedApartment.porch, 0);
  rememberCalculatorState(returnedApartment, storage);
  assert.equal(restoreCalculatorState('house', storage).stairs, 12);
});

test('saved calculator state excludes phone numbers and names', () => {
  const storage = memoryStorage();
  const state = { ...restoreCalculatorState('apartment', storage), phone:'synthetic-private-phone', name:'synthetic-private-name' };
  rememberCalculatorState(state, storage);
  const raw = storage.getItem('legko-calculator-v1');
  assert.equal(raw.includes('synthetic-private'), false);
});

test('invalid session data falls back to valid defaults', () => {
  const storage = memoryStorage();
  storage.setItem('legko-calculator-v1', '{invalid');
  assert.equal(restoreCalculatorState('house', storage).area, 100);
  storage.setItem('legko-calculator-v1', JSON.stringify({version:1, common:{area:-1}}));
  assert.equal(restoreCalculatorState('apartment', storage).area, 50);
});
