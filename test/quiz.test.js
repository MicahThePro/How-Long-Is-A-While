import test from "node:test";
import assert from "node:assert/strict";
import worker, { DURATION_UNITS, normalizeAnswer, normalizeDuration } from "../src/index.js";
import { QUESTIONS, QUESTION_CATEGORIES } from "../src/questions.js";

test("the quiz contains more than 100 distinct questions", () => {
  assert.ok(QUESTIONS.length > 100);
  assert.equal(new Set(QUESTIONS.map((question) => question.text)).size, QUESTIONS.length);
});

test("every question belongs to a non-empty browsing category", () => {
  const categoryCounts = new Map(QUESTION_CATEGORIES.map((category) => [category, 0]));
  for (const question of QUESTIONS) {
    assert.ok(categoryCounts.has(question.category), `Unknown category for question ${question.id}`);
    categoryCounts.set(question.category, categoryCounts.get(question.category) + 1);
  }
  for (const [category, count] of categoryCounts) {
    assert.ok(count > 0, `Category "${category}" has no questions`);
  }
  assert.equal([...categoryCounts.values()].reduce((total, count) => total + count, 0), QUESTIONS.length);
});

test("answer normalization ignores casing, extra spaces, and equivalent number formats", () => {
  assert.equal(normalizeAnswer("  A   little while  "), "a little while");
  assert.equal(normalizeAnswer("5.0"), "5");
  assert.equal(normalizeAnswer(" 1e2 "), "100");
});

test("answer normalization preserves distinct text and non-finite numeric input", () => {
  assert.equal(normalizeAnswer("one minute"), "one minute");
  assert.equal(normalizeAnswer("Infinity"), "infinity");
});

test("duration answers in different units normalize to the same amount", () => {
  assert.equal(normalizeDuration(60, "seconds"), normalizeDuration(1, "minutes"));
  assert.equal(normalizeDuration(1, "hours"), normalizeDuration(60, "minutes"));
  assert.equal(normalizeDuration(1, "weeks"), normalizeDuration(7, "days"));
  assert.equal(normalizeDuration(1, "months"), normalizeDuration(30, "days"));
  assert.equal(normalizeDuration(1, "years"), normalizeDuration(365, "days"));
  assert.deepEqual(Object.keys(DURATION_UNITS), [
    "seconds", "minutes", "hours", "days", "weeks", "months", "years",
  ]);
});

test("duration normalization rejects unsupported units and overflowing amounts", () => {
  assert.throws(() => normalizeDuration(1, "fortnights"));
  assert.throws(() => normalizeDuration(Number.MAX_VALUE, "years"), /too large/);
});

test("the API answers cross-origin browser preflight requests", async () => {
  const response = await worker.fetch(
    new Request("https://quiz.example/api/answer", {
      method: "OPTIONS",
      headers: {
        origin: "https://micah-nordlund.github.io",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    }),
    {},
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.match(response.headers.get("access-control-allow-methods"), /POST/);
  assert.match(response.headers.get("access-control-allow-headers"), /Content-Type/i);
});
