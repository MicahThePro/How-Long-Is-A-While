window.QUIZ_API_URL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8787"
    : "https://how-long-is-a-while.micah-nordlund.workers.dev";
