const screens = {
  home: document.querySelector("#home-screen"),
  questions: document.querySelector("#question-screen"),
  myAnswers: document.querySelector("#my-answers-screen"),
  answer: document.querySelector("#answer-screen"),
};
const API_BASE_URL = window.QUIZ_API_URL || window.location.origin;
const notice = document.querySelector("#notice");
const questionList = document.querySelector("#question-list");
const searchInput = document.querySelector("#question-search");
const categoryFilters = document.querySelector("#category-filters");
const sortSelect = document.querySelector("#question-sort");
const questionListLabel = document.querySelector("#question-list-label");
const questionResultCount = document.querySelector("#question-result-count");
const homeProgressLabel = document.querySelector("#home-progress-label");
const pickerProgressLabel = document.querySelector("#picker-progress-label");
const myAnswersList = document.querySelector("#my-answers-list");
const answerForm = document.querySelector("#answer-form");
const answerInput = document.querySelector("#answer-input");
const answerUnit = document.querySelector("#answer-unit");
const submitButton = document.querySelector("#submit-answer");
const resultsSection = document.querySelector("#results-section");
const answerReaction = document.querySelector("#answer-reaction");

let questions = [];
let questionCategories = [];
let activeQuestionId = null;
let activeCategory = "All";
let socket;
let heartbeat;
let noticeTimeout;

function showNotice(message) {
  notice.textContent = message;
  notice.hidden = false;
  clearTimeout(noticeTimeout);
  noticeTimeout = setTimeout(() => { notice.hidden = true; }, 5000);
}

async function request(path, options) {
  const response = await fetch(new URL(path, `${API_BASE_URL}/`), options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function setScreen(name) {
  for (const [screenName, element] of Object.entries(screens)) {
    element.hidden = screenName !== name;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function answeredQuestions() {
  try {
    const saved = JSON.parse(localStorage.getItem("while-quiz-answered") || "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

function rememberAnswer(questionId) {
  const answered = answeredQuestions();
  answered.add(questionId);
  localStorage.setItem("while-quiz-answered", JSON.stringify([...answered]));
  updateProgress();
  if (!screens.myAnswers.hidden) renderMyAnswers();
}

function updateProgress() {
  const savedAnswers = answeredQuestions();
  const answeredCount = questions.filter((question) =>
    savedAnswers.has(question.id) || savedAnswers.has(String(question.id)),
  ).length;
  const total = questions.length;

  for (const [label, bar] of [
    [homeProgressLabel, document.querySelector("#home-progress-bar")],
    [pickerProgressLabel, document.querySelector("#picker-progress-bar")],
  ]) {
    label.textContent = `${answeredCount} of ${total} questions answered`;
    bar.setAttribute("aria-valuemax", String(total));
    bar.setAttribute("aria-valuenow", String(answeredCount));
    bar.firstElementChild.style.width = total
      ? `${(answeredCount / total) * 100}%`
      : "0%";
  }
}

function renderMyAnswers() {
  const savedAnswers = answeredQuestions();
  const saved = questions.filter((question) =>
    savedAnswers.has(question.id) || savedAnswers.has(String(question.id)),
  );
  document.querySelector("#my-answers-progress").textContent =
    `${saved.length} of ${questions.length} questions answered on this device.`;
  myAnswersList.replaceChildren();

  if (saved.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "Your answered questions will appear here. Pick one and share your take!";
    myAnswersList.append(empty);
    return;
  }

  for (const [index, question] of saved.entries()) {
    const button = document.createElement("button");
    button.className = "question-row";
    button.type = "button";
    button.addEventListener("click", () => openQuestion(question.id));

    const rank = document.createElement("span");
    rank.className = "question-rank";
    rank.textContent = String(index + 1).padStart(2, "0");

    const copy = document.createElement("span");
    copy.className = "question-copy";
    copy.textContent = question.text;

    const details = document.createElement("span");
    details.className = "question-details";
    const category = document.createElement("span");
    category.className = "question-category";
    category.textContent = question.category;
    const resultCount = document.createElement("span");
    resultCount.className = "question-count";
    resultCount.textContent = `${question.total} ${question.total === 1 ? "response" : "responses"}`;
    details.append(category, resultCount);

    const content = document.createElement("span");
    content.className = "question-content";
    content.append(copy, details);

    const arrow = document.createElement("span");
    arrow.className = "question-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    button.append(rank, content, arrow);
    myAnswersList.append(button);
  }
}

function renderQuestionList() {
  const query = searchInput.value.trim().toLowerCase();
  const matching = questions
    .filter((question) =>
      (activeCategory === "All" || question.category === activeCategory) &&
      `${question.text} ${question.category}`.toLowerCase().includes(query),
    )
    .sort((a, b) => {
      if (sortSelect.value === "alphabetical") {
        return a.text.localeCompare(b.text);
      }
      if (sortSelect.value === "unanswered") {
        return a.total - b.total || a.id - b.id;
      }
      return b.total - a.total || a.id - b.id;
    });

  questionListLabel.textContent = query
    ? "SEARCH RESULTS"
    : activeCategory === "All" ? "ALL QUESTIONS" : activeCategory.toUpperCase();
  questionResultCount.textContent =
    `${matching.length} ${matching.length === 1 ? "question" : "questions"}`;
  questionList.replaceChildren();

  if (matching.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "No questions match that search. Try another word.";
    questionList.append(empty);
    return;
  }

  matching.forEach((question, index) => {
    const button = document.createElement("button");
    button.className = "question-row";
    button.type = "button";
    button.addEventListener("click", () => openQuestion(question.id));

    const rank = document.createElement("span");
    rank.className = "question-rank";
    rank.textContent = String(index + 1).padStart(2, "0");

    const copy = document.createElement("span");
    copy.className = "question-copy";
    copy.textContent = question.text;

    const category = document.createElement("span");
    category.className = "question-category";
    category.textContent = question.category;

    const count = document.createElement("span");
    count.className = "question-count";
    count.textContent = `${question.total} ${question.total === 1 ? "answer" : "answers"}`;

    const arrow = document.createElement("span");
    arrow.className = "question-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";

    const details = document.createElement("span");
    details.className = "question-details";
    details.append(category, count);

    const content = document.createElement("span");
    content.className = "question-content";
    content.append(copy, details);

    button.append(rank, content, arrow);
    questionList.append(button);
  });
}

function renderCategoryFilters() {
  categoryFilters.replaceChildren();

  for (const category of ["All", ...questionCategories]) {
    const button = document.createElement("button");
    button.className = "category-filter";
    button.type = "button";
    button.setAttribute("aria-pressed", String(activeCategory === category));

    const label = document.createElement("span");
    label.textContent = category;
    const count = document.createElement("span");
    count.className = "category-filter-count";
    count.textContent = category === "All"
      ? String(questions.length)
      : String(questions.filter((question) => question.category === category).length);

    button.append(label, count);
    button.addEventListener("click", () => {
      activeCategory = category;
      renderCategoryFilters();
      renderQuestionList();
    });
    categoryFilters.append(button);
  }
}

function renderResults(question) {
  document.querySelector("#response-total").textContent =
    `${question.total} ${question.total === 1 ? "response" : "responses"}`;
  const list = document.querySelector("#results-list");
  const topAnswer = document.querySelector("#top-answer");
  list.replaceChildren();
  topAnswer.hidden = question.options.length === 0;

  if (question.options.length > 0) {
    const mostCommon = question.options[0];
    topAnswer.textContent =
      `Most common estimate: ${mostCommon.answer} · ${mostCommon.percent}% of responses`;
  }

  if (question.options.length === 0) {
    const empty = document.createElement("p");
    empty.className = "no-results";
    empty.textContent = "No answers yet — yours will be the first.";
    list.append(empty);
  } else {
    const options = [...question.options].sort(
      (a, b) => a.durationSeconds - b.durationSeconds,
    );
    const maxSeconds = Math.max(
      31536000,
      ...options.map((option) => option.durationSeconds),
    );
    const logMaxSeconds = Math.log1p(maxSeconds);

    for (const option of options) {
      const row = document.createElement("div");
      row.className = "timeline-row";

      const topline = document.createElement("div");
      topline.className = "timeline-topline";
      const answer = document.createElement("span");
      answer.className = "result-answer";
      answer.textContent = option.answer;
      if (option === question.options[0]) {
        const badge = document.createElement("span");
        badge.className = "top-answer-badge";
        badge.textContent = "MOST COMMON";
        answer.append(" ", badge);
      }
      const stats = document.createElement("span");
      stats.className = "result-stats";
      stats.textContent = `${option.percent}% · ${option.count} ${option.count === 1 ? "answer" : "answers"}`;
      topline.append(answer, stats);

      const track = document.createElement("div");
      track.className = "timeline-track";
      track.setAttribute("role", "img");
      track.setAttribute(
        "aria-label",
        `${option.answer}, ${option.percent}% of answers, ${option.count} ${option.count === 1 ? "response" : "responses"}`,
      );
      const dot = document.createElement("span");
      dot.className = "timeline-dot";
      dot.style.left = `${(Math.log1p(option.durationSeconds) / logMaxSeconds) * 100}%`;
      if (option === question.options[0]) dot.classList.add("is-most-common");
      track.append(dot);
      row.append(topline, track);
      list.append(row);
    }

    const axis = document.createElement("div");
    axis.className = "timeline-axis";
    for (const tick of [
      { seconds: 0, label: "0" },
      { seconds: 60, label: "1 min" },
      { seconds: 3600, label: "1 hr" },
      { seconds: 86400, label: "1 day" },
      { seconds: 2592000, label: "1 mo" },
      { seconds: 31536000, label: "1 yr" },
    ]) {
      const label = document.createElement("span");
      label.textContent = tick.label;
      label.style.left = `${(Math.log1p(tick.seconds) / logMaxSeconds) * 100}%`;
      axis.append(label);
    }
    list.append(axis);
  }

  resultsSection.hidden = false;
}

function showAnswerCelebration() {
  answerReaction.textContent = "Your estimate just joined the timeline!";
  answerReaction.hidden = false;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const colors = ["#ff5277", "#ffe36e", "#69d8df", "#9d8bff"];
  const celebration = document.createElement("div");
  celebration.className = "confetti";
  celebration.setAttribute("aria-hidden", "true");

  for (let index = 0; index < 22; index += 1) {
    const piece = document.createElement("span");
    piece.style.setProperty("--confetti-color", colors[index % colors.length]);
    piece.style.setProperty("--confetti-x", `${Math.random() * 100}%`);
    piece.style.setProperty("--confetti-delay", `${Math.random() * 350}ms`);
    piece.style.setProperty("--confetti-spin", `${Math.random() * 540 - 270}deg`);
    celebration.append(piece);
  }

  document.body.append(celebration);
  setTimeout(() => celebration.remove(), 1800);
}

function openQuestion(questionId) {
  const question = questions.find((item) => item.id === questionId);
  if (!question) return;

  activeQuestionId = questionId;
  document.querySelector("#question-number").textContent =
    `QUESTION ${String(question.id).padStart(3, "0")}`;
  document.querySelector("#active-question").textContent = question.text;
  answerInput.value = "";
  answerUnit.value = "seconds";

  const alreadyAnswered = answeredQuestions().has(questionId);
  answerReaction.hidden = true;
  answerForm.hidden = alreadyAnswered;
  document.querySelector("#already-answered").hidden = !alreadyAnswered;
  resultsSection.hidden = !alreadyAnswered;
  if (alreadyAnswered) renderResults(question);
  setScreen("answer");
  if (!alreadyAnswered) answerInput.focus({ preventScroll: true });
}

async function loadQuestions() {
  const data = await request("/api/questions");
  questions = data.questions;
  questionCategories = data.categories;
  updateProgress();
  renderCategoryFilters();
  renderQuestionList();
  if (!screens.myAnswers.hidden) renderMyAnswers();
  if (activeQuestionId !== null && !screens.answer.hidden) {
    const current = questions.find((question) => question.id === activeQuestionId);
    if (current && answeredQuestions().has(activeQuestionId)) renderResults(current);
  }
}

function setOnlineCount(count) {
  document.querySelector("#online-count").textContent =
    `${count} ${count === 1 ? "person" : "people"} online now`;
}

function connectPresence() {
  const socketUrl = new URL("/api/ws", API_BASE_URL);
  socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(socketUrl);

  socket.addEventListener("open", () => {
    socket.send("ping");
    request("/api/status")
      .then((data) => setOnlineCount(data.online))
      .catch((error) => showNotice(error.message));
    heartbeat = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send("ping");
    }, 25000);
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "presence") setOnlineCount(message.online);
    if (message.type === "results-updated") {
      loadQuestions().catch((error) => showNotice(error.message));
    }
  });

  socket.addEventListener("close", () => {
    clearInterval(heartbeat);
    setTimeout(connectPresence, 3000);
  });

  socket.addEventListener("error", () => socket.close());
}

document.querySelector("#start-button").addEventListener("click", () => {
  setScreen("questions");
  searchInput.focus({ preventScroll: true });
});

document.querySelector("#random-question-button").addEventListener("click", () => {
  openRandomQuestion();
});

document.querySelector("#next-random-question-button").addEventListener("click", () => {
  openRandomQuestion();
});

document.querySelector("#my-answers-button").addEventListener("click", () => {
  renderMyAnswers();
  setScreen("myAnswers");
});

document.querySelectorAll('[data-screen="questions"]').forEach((button) => {
  button.addEventListener("click", () => {
    setScreen("questions");
    renderQuestionList();
  });
});

function openRandomQuestion() {
  const query = searchInput.value.trim().toLowerCase();
  const matching = questions.filter((question) =>
    (activeCategory === "All" || question.category === activeCategory) &&
    `${question.text} ${question.category}`.toLowerCase().includes(query),
  );
  const savedAnswers = answeredQuestions();
  const unanswered = matching.filter((question) =>
    !savedAnswers.has(question.id) && !savedAnswers.has(String(question.id)),
  );
  const choices = unanswered.length > 0 ? unanswered : matching;

  if (choices.length === 0) {
    showNotice("No questions match those filters. Clear your search or choose another topic.");
    return;
  }

  const question = choices[Math.floor(Math.random() * choices.length)];
  openQuestion(question.id);
}

async function copyQuestionLink(url) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }

  const field = document.createElement("textarea");
  field.value = url;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Your browser couldn’t copy the question link.");
}

document.querySelector("#share-question-button").addEventListener("click", async () => {
  const question = questions.find((item) => item.id === activeQuestionId);
  if (!question) return;

  const url = new URL(window.location.href);
  url.searchParams.set("question", String(question.id));
  const shareData = {
    title: "How Long Is “A While”?",
    text: question.text,
    url: url.toString(),
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (error) {
      if (error.name === "AbortError") return;
      try {
        await copyQuestionLink(shareData.url);
        showNotice("Question link copied!");
      } catch (copyError) {
        showNotice(copyError.message);
      }
    }
    return;
  }

  try {
    await copyQuestionLink(shareData.url);
    showNotice("Question link copied!");
  } catch (error) {
    showNotice(error.message);
  }
});

document.querySelectorAll('[data-screen="home"]').forEach((button) => {
  button.addEventListener("click", () => setScreen("home"));
});

document.querySelector("#back-to-questions").addEventListener("click", () => {
  setScreen("questions");
  renderQuestionList();
});

searchInput.addEventListener("input", renderQuestionList);
sortSelect.addEventListener("change", renderQuestionList);

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && screens.questions.hidden === false &&
      document.activeElement !== searchInput && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    searchInput.focus();
  }
});

answerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (activeQuestionId === null) return;

  submitButton.disabled = true;
  try {
    const amount = Number(answerInput.value);
    if (!Number.isFinite(amount) || amount < 0) {
      showNotice("Enter a valid number of seconds, minutes, hours, days, weeks, months, or years.");
      return;
    }

    const data = await request("/api/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        questionId: activeQuestionId,
        amount: answerInput.value,
        unit: answerUnit.value,
      }),
    });
    rememberAnswer(activeQuestionId);
    questions = questions.map((question) =>
      question.id === data.question.id ? data.question : question,
    ).sort((a, b) => b.total - a.total || a.id - b.id);
    renderQuestionList();
    answerForm.hidden = true;
    document.querySelector("#already-answered").hidden = false;
    renderResults(data.question);
    showAnswerCelebration();
  } catch (error) {
    showNotice(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#online-count").textContent = "Connecting…";
Promise.all([
  loadQuestions(),
  request("/api/status").then((data) => setOnlineCount(data.online)),
]).then(() => {
  const url = new URL(window.location.href);
  const questionId = Number(url.searchParams.get("question"));
  if (Number.isInteger(questionId) && questions.some((question) => question.id === questionId)) {
    openQuestion(questionId);
    url.searchParams.delete("question");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
}).catch((error) => showNotice(error.message));
connectPresence();
