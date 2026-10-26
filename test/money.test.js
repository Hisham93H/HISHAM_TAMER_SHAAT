import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, parseShipping, round2, toNumber } from '../public/lib/money.js';

test('toNumber handles US and European separators', () => {
  assert.equal(toNumber('1,299.99'), 1299.99);
  assert.equal(toNumber('1.299,99'), 1299.99);
  assert.equal(toNumber('4,99'), 4.99);
  assert.equal(toNumber('4.99'), 4.99);
  assert.equal(toNumber('1,299'), 1299);
  assert.equal(toNumber('1.299'), 1299);
  assert.equal(toNumber('12'), 12);
});

test('parseMoney reads prices from text and numbers', () => {
  assert.equal(parseMoney('$1,299.99'), 1299.99);
  assert.equal(parseMoney('4,99 €'), 4.99);
  assert.equal(parseMoney('£12'), 12);
  assert.equal(parseMoney('US$ 19.50'), 19.5);
  assert.equal(parseMoney('SAR 3,199.00'), 3199);
  assert.equal(parseMoney('1,700 ر.س'), 1700);
  assert.equal(parseMoney(42), 42);
  assert.equal(parseMoney('no price'), null);
  assert.equal(parseMoney(undefined), null);
});

test('parseShipping recognises free shipping', () => {
  assert.equal(parseShipping('Free delivery'), 0);
  assert.equal(parseShipping('Free delivery by Thu, Nov 6'), 0);
  assert.equal(parseShipping('Free 2-day shipping'), 0);
  assert.equal(parseShipping('Kostenloser Versand'), 0);
});

test('parseShipping reads a shipping fee', () => {
  assert.equal(parseShipping('$5.99 delivery'), 5.99);
  assert.equal(parseShipping('+$12.50 shipping'), 12.5);
  assert.equal(parseShipping('Delivery: 4,99 €'), 4.99);
  assert.equal(parseShipping('SAR 15.00 delivery'), 15);
  assert.equal(parseShipping(7.25), 7.25);
});

test('parseShipping ignores "free returns" next to a fee', () => {
  assert.equal(parseShipping('$5.99 delivery · Free 30-day returns', 50), 5.99);
});

test('parseShipping treats an amount beside "free" as a minimum order', () => {
  assert.equal(parseShipping('Free delivery on orders over $35', 49.99), 0);
  assert.equal(parseShipping('Free delivery on orders over $35', 20), null);
  assert.equal(parseShipping('Free shipping $35+'), null);
});

test('parseShipping returns null when the cost is unknown', () => {
  assert.equal(parseShipping(null), null);
  assert.equal(parseShipping(''), null);
  assert.equal(parseShipping('Delivery in 2 days'), null);
  assert.equal(parseShipping(-1), null);
});

test('round2 rounds half-cents up', () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(19.999), 20);
});
