import { QUESTIONS, QUESTION_CATEGORIES } from "./questions.js";

const questionCategories = new Map(QUESTIONS.map(({ id, category }) => [id, category]));

const API_CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "Content-Type",
  "access-control-max-age": "86400",
};

export const DURATION_UNITS = {
  seconds: 1,
  minutes: 60,
  hours: 60 * 60,
  days: 24 * 60 * 60,
  weeks: 7 * 24 * 60 * 60,
  months: 30 * 24 * 60 * 60,
  years: 365 * 24 * 60 * 60,
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...API_CORS_HEADERS,
    },
  });

export function normalizeDuration(amount, unit) {
  const seconds = amount * DURATION_UNITS[unit];
  if (!Number.isFinite(seconds)) throw new Error("That duration is too large.");
  return normalizeAnswer(String(Number(seconds.toPrecision(15))));
}

export function normalizeAnswer(answer) {
  const normalized = answer.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) {
    const number = Number(normalized);
    if (Number.isFinite(number)) return String(number);
  }
  return normalized;
}

export class QuizRoom {
  constructor(ctx) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY,
        text TEXT NOT NULL
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS answers (
        question_id INTEGER NOT NULL,
        normalized_answer TEXT NOT NULL,
        display_answer TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (question_id, normalized_answer)
      )
    `);

    const { count } = this.sql
      .exec("SELECT COUNT(*) AS count FROM questions")
      .one();
    if (count === 0) {
      for (const question of QUESTIONS) {
        this.sql.exec(
          "INSERT INTO questions (id, text) VALUES (?, ?)",
          question.id,
          question.text,
        );
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ws") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return json({ error: "A WebSocket connection is required." }, 426);
      }

      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server);
      this.broadcastPresence();
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/api/status" && request.method === "GET") {
      return json({ online: this.ctx.getWebSockets().length });
    }

    if (url.pathname === "/api/questions" && request.method === "GET") {
      return json({ questions: this.getQuestions(), categories: QUESTION_CATEGORIES });
    }

    if (url.pathname === "/api/answer" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Send a valid JSON answer." }, 400);
      }

      const questionId = Number(body?.questionId);
      if (!Number.isInteger(questionId)) {
        return json({ error: "Choose a valid question." }, 400);
      }

      const question = this.sql
        .exec("SELECT id FROM questions WHERE id = ?", questionId)
        .toArray()[0];
      if (!question) return json({ error: "That question was not found." }, 404);

      if (typeof body?.amount !== "string" ||
          !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(body.amount)) {
        return json({ error: "Enter a valid number for your answer." }, 400);
      }

      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return json({ error: "Enter a non-negative, finite number." }, 400);
      }

      if (typeof body.unit !== "string" ||
          !Object.hasOwn(DURATION_UNITS, body.unit)) {
        return json({ error: "Choose a valid time unit." }, 400);
      }

      let normalizedAnswer;
      try {
        normalizedAnswer = normalizeDuration(amount, body.unit);
      } catch {
        return json({ error: "That duration is too large." }, 400);
      }

      const singularUnit = body.unit.slice(0, -1);
      const displayAnswer = `${String(amount)} ${amount === 1 ? singularUnit : body.unit}`;
      this.sql.exec(
        `INSERT INTO answers (question_id, normalized_answer, display_answer, count)
         VALUES (?, ?, ?, 1)
         ON CONFLICT (question_id, normalized_answer)
         DO UPDATE SET count = count + 1`,
        questionId,
        normalizedAnswer,
        displayAnswer,
      );

      this.broadcast({ type: "results-updated", questionId });
      return json({ question: this.getQuestion(questionId) });
    }

    return json({ error: "Not found." }, 404);
  }

  getQuestions() {
    const questions = new Map();
    const rows = this.sql.exec(
      `SELECT q.id, q.text, a.normalized_answer, a.display_answer, a.count
       FROM questions q
       LEFT JOIN answers a ON a.question_id = q.id
       ORDER BY q.id, a.normalized_answer`,
    ).toArray();

    for (const row of rows) {
      if (!questions.has(row.id)) {
        questions.set(row.id, {
          id: row.id,
          text: row.text,
          category: questionCategories.get(row.id),
          total: 0,
          options: [],
        });
      }

      if (row.display_answer !== null) {
        const question = questions.get(row.id);
        question.total += row.count;
        question.options.push({
          answer: row.display_answer,
          durationSeconds: Number(row.normalized_answer),
          count: row.count,
        });
      }
    }

    return [...questions.values()]
      .map((question) => ({
        ...question,
        options: question.options
          .map((option) => ({
            ...option,
            percent: question.total
              ? Math.round((option.count / question.total) * 1000) / 10
              : 0,
          }))
          .sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer)),
      }))
      .sort((a, b) => b.total - a.total || a.id - b.id);
  }

  getQuestion(questionId) {
    return this.getQuestions().find((question) => question.id === questionId);
  }

  broadcastPresence() {
    this.broadcast({
      type: "presence",
      online: this.ctx.getWebSockets().length,
    });
  }

  broadcast(message) {
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(payload);
        } catch (error) {
          console.error("Could not send a live quiz update.", error);
        }
      }
    }
  }

  webSocketMessage(_socket, message) {
    if (message === "ping") this.broadcastPresence();
  }

  webSocketClose() {
    this.broadcastPresence();
  }

  webSocketError() {
    this.broadcastPresence();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: API_CORS_HEADERS });
      }
      const room = env.QUIZ_ROOM.get(env.QUIZ_ROOM.idFromName("everyone"));
      return room.fetch(request);
    }
    return json({ error: "Not found." }, 404);
  },
};
