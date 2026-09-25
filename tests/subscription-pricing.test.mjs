import test from "node:test";
import assert from "node:assert/strict";
import { calculateCustomSubscriptionPrice, subscriptionPlans } from "../lib/subscriptions/plans.ts";

test("standard plans include one branch; Custom Plan follows the shared plan curve", () => {
  for (const key of ["solo", "small_team", "growth"]) assert.equal(subscriptionPlans[key].branchLimit, 1);
  assert.equal(calculateCustomSubscriptionPrice(1, 2, 1).total, 30);
  assert.equal(calculateCustomSubscriptionPrice(1, 1, 1).total, 10);
  assert.equal(calculateCustomSubscriptionPrice(7, 2, 1).total, 46);
  assert.equal(calculateCustomSubscriptionPrice(10, 3, 1).total, 78);
});
test("custom totals apply the selected duration discount once", () => {
  const term = calculateCustomSubscriptionPrice(1, 2, 3);
  assert.equal(term.subtotal, 90);
  assert.equal(term.discountAmount, 4.5);
  assert.equal(term.total, 85.5);
  assert.equal(calculateCustomSubscriptionPrice(1, 2, 12).total, 324);
});
test("billing rejects fractional, missing, negative and excessive capacity", () => {
  for (const [users,branches] of [[0,1],[1.5,1],[1,0],[1,1.5],[501,1],[1,101],[NaN,1]]) assert.throws(()=>calculateCustomSubscriptionPrice(users,branches,1));
  assert.throws(()=>calculateCustomSubscriptionPrice(1,2,2));
});
