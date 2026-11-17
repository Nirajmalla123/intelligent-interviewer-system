import { describe, expect, test } from "vitest";
import { normalizeIntegrityReview, persistentMultipleFaces } from "./integrity";
import { generateLocalFollowUp } from "./question-bank";

describe("interview integrity rules", () => {
  test("multiple faces terminate only after 2 persistent seconds", () => {
    expect(persistentMultipleFaces(100, 2099)).toBe(false);
    expect(persistentMultipleFaces(100, 2100)).toBe(true);
    expect(persistentMultipleFaces(null, 8000)).toBe(false);
  });
  test("unknown suspicion is unassessed rather than a clean verdict", () => {
    expect(normalizeIntegrityReview({}).suspicionScore).toBeNull();
  });
  test("suspicion is bounded to 0–100", () => {
    expect(normalizeIntegrityReview({ suspicion_score: 140 }).suspicionScore).toBe(100);
    expect(normalizeIntegrityReview({ suspicion_score: -5 }).suspicionScore).toBe(0);
  });
  test("unknown-topic answers get a probe grounded in their actual statement", () => {
    const input = { jobRole: "Frontend Engineer", seniority: "junior", questionText: "Tell me about your project", transcript: "I built a community garden tracker.", history: [], isLastQuestion: false };
    const probe = generateLocalFollowUp(input);
    expect(probe).toContain("I built a community garden tracker");
    expect(generateLocalFollowUp({ ...input, askedQuestions: [probe ?? ""] })).not.toBe(probe);
  });
});