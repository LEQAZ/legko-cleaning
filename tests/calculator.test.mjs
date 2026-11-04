import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, normalizePhone } from '../dist/calculator.mjs';

test('minimum applies to the base, then selected extras are added', () => {
  const result = calculate({ area: 20, windows: 2, oven: 1 });
  assert.equal(result.rawBase, 1600);
  assert.equal(result.base, 3000);
  assert.equal(result.total, 4300);
  assert.equal(result.minimumApplied, true);
});
test('all service rates produce the advertised totals for 50 m²', () => {
  assert.equal(calculate({ service: 'regular' }).total, 4000);
  assert.equal(calculate({ service: 'deep' }).total, 7000);
  assert.equal(calculate({ service: 'renovation' }).total, 9000);
});
test('combined extras are billed per unit', () => {
  assert.equal(calculate({ service: 'renovation', area: 200, windows: 10, oven: 1, fridge: 1 }).total, 40550);
  assert.equal(calculate({ area: 50, windows: 12, oven: 1, fridge: 1 }).total, 9250);
  assert.equal(calculate({ area: 20, windows: 100 }).total, 38000);
});
test('invalid ranges, fractions and unknown services are rejected', () => {
  for (const state of [{ area: NaN }, { area: 19 }, { area: 1001 }, { area: 30.5 }, { windows: -1 }, { windows: 1.5 }, { oven: -1 }, { oven: true }, { oven: 2 }, { fridge: 2 }, { fridge: NaN }, { windows: Number.MAX_SAFE_INTEGER }, { service: '__proto__' }]) {
    assert.throws(() => calculate(state), RangeError);
  }
});
test('phone normalization accepts domestic formats and rejects incomplete numbers', () => {
  assert.equal(normalizePhone('+7 (900) 000-00-00'), '+79000000000');
  assert.equal(normalizePhone('8 900 000 00 00'), '+79000000000');
  assert.equal(normalizePhone('123'), null);
  assert.equal(normalizePhone('+1 900 000 00 00'), null);
});

test('20 m² and an oven have an unambiguous additive receipt', () => {
  const result = calculate({ area: 20, oven: 1 });
  assert.deepEqual(result.lineItems.map(({ key, amount }) => [key, amount]), [
    ['base', 1600], ['minimum', 1400], ['oven', 600],
  ]);
  assert.equal(result.total, 3600);
  assert.equal(result.minimumSurcharge, 1400);
});

test('receipt adds up for all services around the minimum and with combined extras', () => {
  for (const service of ['regular', 'deep', 'renovation']) {
    for (const area of [20, 37, 38, 200]) {
      for (const windows of [0, 12]) {
        for (const oven of [0, 1]) {
          for (const fridge of [0, 1]) {
            const result = calculate({ service, area, windows, oven, fridge });
            assert.equal(result.lineItems.reduce((sum, item) => sum + item.amount, 0), result.total);
            assert.equal(result.lineItems.some(item => item.key === 'minimum'), result.minimumApplied);
            assert.ok(result.lineItems.every(item => item.amount > 0));
          }
        }
      }
    }
  }
});

test('apartment balcony and its glazing have distinct additive charges', () => {
  const result = calculate({ area: 50, balcony: 6, windows: 2 });
  assert.equal(result.total, 5420);
  assert.equal(result.rawBase, 4000);
  assert.equal(result.lineItems.find(item => item.key === 'balcony').amount, 720);
  assert.equal(calculate({ area: 20, balcony: 2.5 }).total, 3300);
  assert.equal(calculate({ area: 20, balcony: 0.7 }).lineItems.find(item => item.key === 'balcony').amount, 84);
});

test('house porch, terrace and steps are billed separately from indoor floor area', () => {
  const result = calculate({ property: 'house', area: 80, porch: 4, terrace: 10, stairs: 12, windows: 2, oven: 1 });
  assert.equal(result.total, 9840);
  assert.equal(result.lineItems.reduce((sum, item) => sum + item.amount, 0), 9840);
  assert.equal(calculate({ property: 'house', area: 280 }).total, 22400);
  assert.equal(calculate({ property: 'house', area: 1000 }).total, 80000);
  assert.equal(calculate({ property: 'house', area: 20, porch: 3.5, terrace: 10, stairs: 12 }).total, 5090);
});

test('property-specific quantities reject wrong objects and invalid precision', () => {
  for (const input of [{ porch: 1 }, { stairs: 1 }, { property: 'house', balcony: 2 }, { balcony: 0.15 },
    { balcony: 1e-9 }, { balcony: -1 }, { property: 'house', stairs: 1.5 }, { property: 'house', area: 1001 }, { property: '__proto__' }]) {
    assert.throws(() => calculate(input), RangeError);
  }
});

test('pet hair is an explicit fixed optional charge on either property', () => {
  for (const property of ['apartment', 'house']) {
    assert.equal(calculate({ property, area: 50, petHair: 1 }).total, 4500);
    assert.equal(calculate({ property, area: 50 }).lineItems.some(item => item.key === 'petHair'), false);
    assert.equal(calculate({ property, area: 20, petHair: 1 }).total, 3500);
  }
  assert.throws(() => calculate({ petHair: 2 }), RangeError);
});
