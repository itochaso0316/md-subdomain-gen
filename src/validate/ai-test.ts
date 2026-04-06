import Anthropic from '@anthropic-ai/sdk';

// ── Types ────────────────────────────────────────────────────────────

export interface TestQuery {
  question: string;
  expectedAnswer: string;
  aiAnswer: string;
  correct: boolean;
}

export interface AITestResult {
  passed: boolean;
  queries: TestQuery[];
}

// ── Internal helpers ─────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a QA tester for AI-optimised markdown pages.
You will be given the markdown content of a business page and a question.
Answer the question using ONLY the information in the markdown.
If the information is not present, respond with "NOT_FOUND".
Keep your answer concise (one or two sentences max).`;

const QUESTION_GEN_PROMPT = `You are a QA test generator.
Given the following markdown content of a business page, generate 5 factual questions
that an AI agent would typically ask about this business (e.g. phone number, address,
opening hours, services offered, prices).

For each question also provide the expected correct answer based on the markdown.

Respond in JSON format:
[{"question": "...", "expectedAnswer": "..."}, ...]

Only output the JSON array, nothing else.`;

async function fetchContent(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Run an AI-powered test that verifies an AI agent can correctly answer
 * questions about a business from its markdown representation.
 *
 * Uses Claude to:
 * 1. Generate test questions from the markdown content.
 * 2. Answer those questions using only the markdown.
 * 3. Compare answers against expected values.
 */
export async function runAITest(
  markdownUrl: string,
  _originalUrl: string,
): Promise<AITestResult> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required to run AI tests.',
    );
  }

  const client = new Anthropic({ apiKey });
  const markdownContent = await fetchContent(markdownUrl);

  // Step 1: Generate test questions
  const genResponse = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `${QUESTION_GEN_PROMPT}\n\n---\n\n${markdownContent}`,
      },
    ],
  });

  const genText =
    genResponse.content[0].type === 'text' ? genResponse.content[0].text : '';

  let questions: Array<{ question: string; expectedAnswer: string }>;
  try {
    questions = JSON.parse(genText);
  } catch {
    throw new Error(`Failed to parse generated questions: ${genText}`);
  }

  // Step 2: Ask each question and evaluate
  const queries: TestQuery[] = [];

  for (const q of questions) {
    const answerResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Markdown content:\n\n${markdownContent}\n\n---\n\nQuestion: ${q.question}`,
        },
      ],
    });

    const aiAnswer =
      answerResponse.content[0].type === 'text'
        ? answerResponse.content[0].text
        : '';

    // Step 3: Check correctness — simple inclusion check + NOT_FOUND handling
    const normExpected = q.expectedAnswer.toLowerCase().trim();
    const normAI = aiAnswer.toLowerCase().trim();
    const correct =
      normAI !== 'not_found' &&
      (normAI.includes(normExpected) || normExpected.includes(normAI));

    queries.push({
      question: q.question,
      expectedAnswer: q.expectedAnswer,
      aiAnswer,
      correct,
    });
  }

  const passRate = queries.filter((q) => q.correct).length / queries.length;

  return {
    passed: passRate >= 0.8,
    queries,
  };
}
