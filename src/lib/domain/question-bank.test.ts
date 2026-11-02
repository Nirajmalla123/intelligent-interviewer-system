import { describe, expect, test } from "bun:test";
import { JOB_ROLES } from "./types";
import { generateLocalFollowUp, generateLocalQuestionPlan } from "./question-bank";
import { InterviewerAi } from "../ai/interviewer.server";

describe("free local question generation", () => {
  for (const count of [12, 15, 20]) {
    test(`generates exactly ${count} unique questions for every role and difficulty`, () => {
      for (const jobRole of JOB_ROLES) {
        for (const seniority of ["junior", "mid", "senior", "lead"]) {
          const questions = generateLocalQuestionPlan({ jobRole, seniority, count });
          expect(questions).toHaveLength(count);
          expect(new Set(questions.map((q) => q.text)).size).toBe(count);
          expect(questions[0].category).toBe("introduction");
        }
      }
    });
  }

  test("junior uses only basic definitions, uses and simple examples", () => {
    const questions = generateLocalQuestionPlan({ jobRole: "Frontend Engineer", seniority: "junior", count: 20 });
    expect(questions.slice(1).every((q) => /^(What does|What is|Can you give a simple example)/.test(q.text))).toBe(true);
    expect(questions.slice(1).some((q) => q.text.includes("HTML"))).toBe(true);
  });

  test("selected difficulty changes the question plan", () => {
    const input = { jobRole: "Backend Engineer", count: 12 };
    expect(generateLocalQuestionPlan({ ...input, seniority: "junior" }, () => 0))
      .not.toEqual(generateLocalQuestionPlan({ ...input, seniority: "lead" }, () => 0));
  });

  test("sessions vary and resume skills prioritize role-relevant topics", () => {
    const input = { jobRole: "Frontend Engineer", seniority: "junior", count: 12 };
    expect(generateLocalQuestionPlan(input, () => 0)).not.toEqual(generateLocalQuestionPlan(input, () => 0.99));
    expect(generateLocalQuestionPlan({ ...input, resumeText: "React" }, () => 0)[1].text).toContain("React");
  });

  test("start question planning never calls an AI provider or parses its JSON", async () => {
    let calls = 0;
    const interviewer = new InterviewerAi({ name: "unavailable", model: "unused", completeJson: async () => {
      calls++;
      throw new Error("AI credits exhausted; invalid JSON");
    } });
    const questions = await interviewer.generateQuestionPlan({ jobRole: "Frontend Engineer", seniority: "junior", count: 12, resumeText: null, candidateHeadline: null, yearsExperience: 0 });
    expect(questions).toHaveLength(12);
    expect(calls).toBe(0);
  });
});

describe("local adaptive follow-ups", () => {
  const input = { jobRole: "Frontend Engineer", seniority: "junior", questionText: "What does HTML mean?", transcript: "HTML describes a webpage.", history: [], isLastQuestion: false };

  test("uses the answer topic and asks for clarification of short answers", () => {
    expect(generateLocalFollowUp(input)).toBe("Can you explain HTML in simple words?");
    expect(generateLocalFollowUp({ ...input, transcript: "I use React." })).toBe("Can you explain React in simple words?");
  });

  test("uses prior questions and the entire plan to avoid duplicate follow-ups", () => {
    const first = generateLocalFollowUp(input);
    const second = generateLocalFollowUp({ ...input, history: [{ question: first ?? "", transcript: "HTML" }] });
    expect(second).toBe("What is one everyday use of HTML?");
    expect(generateLocalFollowUp({ ...input, askedQuestions: [first ?? "", second ?? ""] })).toBeNull();
  });

  test("longer answers receive an example question rather than clarification", () => {
    expect(generateLocalFollowUp({ ...input, transcript: "HTML is the language I use to describe the content and structure of a webpage." })).toBe("Can you give one simple example of HTML?");
  });

  test("final answers do not create another question", () => {
    expect(generateLocalFollowUp({ ...input, isLastQuestion: true })).toBeNull();
  });
});