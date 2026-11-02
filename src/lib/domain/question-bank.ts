/** Pure local question generation: no credentials, network calls or JSON parsing. */
export interface LocalQuestion {
  text: string;
  category: string;
}

interface PlanInput {
  jobRole: string;
  seniority: string;
  count: number;
  resumeText?: string | null;
  candidateHeadline?: string | null;
}

const TOPICS: Record<string, string[]> = {
  frontend: ["HTML", "CSS", "JavaScript", "React", "forms", "buttons", "browser storage", "accessibility", "responsive layouts", "events", "components", "web requests"],
  backend: ["APIs", "databases", "HTTP", "authentication", "validation", "logging", "caching", "error handling", "SQL", "servers", "security", "testing"],
  "full-stack": ["HTML", "CSS", "JavaScript", "React", "APIs", "databases", "authentication", "HTTP", "forms", "testing", "deployment", "validation"],
  "data scientist": ["data cleaning", "averages", "charts", "Python", "statistics", "missing values", "data analysis", "sampling", "predictions", "experiments", "outliers", "spreadsheets"],
  "machine learning": ["training data", "models", "predictions", "classification", "features", "Python", "testing data", "accuracy", "overfitting", "neural networks", "data cleaning", "model deployment"],
  devops: ["Git", "Linux", "deployment", "containers", "monitoring", "logs", "backups", "automation", "cloud services", "networks", "CI pipelines", "security"],
  mobile: ["mobile apps", "screens", "navigation", "notifications", "local storage", "APIs", "permissions", "offline mode", "layouts", "testing", "app updates", "battery usage"],
  qa: ["test cases", "bugs", "manual testing", "automated testing", "regression testing", "test data", "API testing", "validation", "bug reports", "edge cases", "test plans", "quality checks"],
  product: ["user needs", "priorities", "feedback", "roadmaps", "requirements", "user research", "success metrics", "teamwork", "product launches", "experiments", "user stories", "planning"],
  "data engineer": ["SQL", "data pipelines", "databases", "data cleaning", "ETL", "data storage", "data quality", "batch processing", "schemas", "data backups", "scheduling", "monitoring"],
};

const GENERAL_TOPICS = ["teamwork", "planning", "problem solving", "communication", "feedback", "documentation", "quality", "time management", "learning", "priorities", "requirements", "customer needs"];

function topicsFor(role: string): string[] {
  const normalized = role.toLowerCase();
  return Object.entries(TOPICS).find(([key]) => normalized.includes(key))?.[1] ?? GENERAL_TOPICS;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    const value = result[i];
    const other = result[j];
    if (value === undefined || other === undefined) continue;
    result[i] = other;
    result[j] = value;
  }
  return result;
}

function templates(seniority: string): ((topic: string) => string)[] {
  if (seniority === "junior") return [
    (topic) => `What does ${topic} mean?`,
    (topic) => `What is ${topic} used for?`,
    (topic) => `Can you give a simple example of ${topic}?`,
  ];
  if (seniority === "mid") return [
    (topic) => `How do you use ${topic} in everyday work?`,
    (topic) => `Can you give a practical example of ${topic}?`,
    (topic) => `What common mistake should you avoid with ${topic}?`,
  ];
  if (seniority === "lead") return [
    (topic) => `How would you explain ${topic} to a teammate?`,
    (topic) => `How do you help your team use ${topic}?`,
    (topic) => `What simple decision matters when working with ${topic}?`,
  ];
  return [
    (topic) => `How have you used ${topic} in a project?`,
    (topic) => `How would you solve a common problem with ${topic}?`,
    (topic) => `What practical lesson have you learned about ${topic}?`,
  ];
}

/** Randomize sessions; never repeat a question within the requested plan. */
export function generateLocalQuestionPlan(input: PlanInput, random = Math.random): LocalQuestion[] {
  if (![12, 15, 20].includes(input.count)) throw new Error("Choose 12, 15, or 20 questions.");
  const context = `${input.resumeText ?? ""} ${input.candidateHeadline ?? ""}`.toLowerCase();
  const topics = shuffled(topicsFor(input.jobRole), random);
  // Resume skills only prioritize role-relevant concepts; never interpolate resume instructions.
  topics.sort((a, b) => Number(context.includes(b.toLowerCase())) - Number(context.includes(a.toLowerCase())));
  const pool = templates(input.seniority).flatMap((template) => topics.map((topic) => ({
    text: template(topic), category: "technical",
  })));
  return [
    { text: "Could you briefly introduce yourself?", category: "introduction" },
    ...pool.slice(0, input.count - 1),
  ];
}

interface FollowUpInput {
  jobRole: string;
  seniority: string;
  questionText: string;
  transcript: string;
  history: { question: string; transcript: string }[];
  askedQuestions?: string[];
  isLastQuestion: boolean;
}

/** Select a grounded clarification or example, without invented answer content. */
export function generateLocalFollowUp(input: FollowUpInput): string | null {
  if (input.isLastQuestion || /introduce yourself/i.test(input.questionText)) return null;
  const used = new Set([input.questionText, ...input.history.map((item) => item.question), ...(input.askedQuestions ?? [])]
    .map((text) => text.trim().toLowerCase()));
  const topics = topicsFor(input.jobRole);
  const answer = input.transcript.toLowerCase();
  const topic = topics.find((item) => answer.includes(item.toLowerCase()))
    ?? topics.find((item) => input.questionText.toLowerCase().includes(item.toLowerCase()));
  if (!topic) return null;
  const shortAnswer = input.transcript.trim().split(/\s+/).filter(Boolean).length < 12;
  const candidates = shortAnswer
    ? [`Can you explain ${topic} in simple words?`, `What is one everyday use of ${topic}?`]
    : input.seniority === "junior"
      ? [`Can you give one simple example of ${topic}?`, `How would you use ${topic}?`]
      : [`Why did you choose ${topic} in that example?`, `What did you learn from using ${topic}?`, `How would you check that ${topic} works correctly?`];
  return candidates.find((text) => !used.has(text.toLowerCase())) ?? null;
}