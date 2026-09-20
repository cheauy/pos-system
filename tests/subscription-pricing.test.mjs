import test from "node:test";
import assert from "node:assert/strict";
import { calculateCustomSubscriptionPrice, subscriptionPlans } from "../lib/subscriptions/plans.ts";

test("standard plans include one branch; Custom Plan charges chosen quantities directly", () => {
  for (const key of ["solo", "small_team", "growth"]) assert.equal(subscriptionPlans[key].branchLimit, 1);
  assert.equal(calculateCustomSubscriptionPrice(1, 2, 1).total, 45);
  assert.equal(calculateCustomSubscriptionPrice(1, 1, 1).total, 25);
  assert.equal(calculateCustomSubscriptionPrice(7, 2, 1).total, 75);
});
test("custom totals use existing term discounts without a base allowance", () => {
  const term = calculateCustomSubscriptionPrice(1, 2, 3);
  assert.equal(term.subtotal, 135);
  assert.equal(term.discountAmount, 6.75);
  assert.equal(term.total, 128.25);
  assert.equal(calculateCustomSubscriptionPrice(1, 2, 12).total, 486);
});
test("billing rejects fractional, missing, negative and excessive capacity", () => {
  for (const [users,branches] of [[0,1],[1.5,1],[1,0],[1,1.5],[501,1],[1,101],[NaN,1]]) assert.throws(()=>calculateCustomSubscriptionPrice(users,branches,1));
  assert.throws(()=>calculateCustomSubscriptionPrice(1,2,2));
});
