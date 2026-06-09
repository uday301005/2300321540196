const http = require("http");

// Express middleware (jo pehle se tha)
function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  const { method, url } = req;
  const timestamp = new Date().toISOString();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    console.log(JSON.stringify({
      level: "info", type: "request", method, url,
      status: res.statusCode, durationMs: durationMs.toFixed(2), timestamp,
    }));
  });
  next();
}

function errorLogger(err, req, res, next) {
  console.error(JSON.stringify({
    level: "error", type: "error", message: err.message,
    stack: err.stack, method: req.method, url: req.url,
    timestamp: new Date().toISOString(),
  }));
  next(err);
}

// ✅ Naya — Test server pe logs bhejne ke liye
let AUTH_TOKEN = "";

function setToken(token) {
  AUTH_TOKEN = token;
}

function Log(stack, level, package_name, message) {
  const body = JSON.stringify({ stack, level, package: package_name, message });

  return new Promise((resolve) => {
    const req = http.request(
      "http://4.224.186.213/evaluation-service/logs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AUTH_TOKEN}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); } catch { resolve({}); }
        });
      }
    );
    req.on("error", (e) => console.error("Log failed:", e.message));
    req.write(body);
    req.end();
  });
}

module.exports = { requestLogger, errorLogger, Log, setToken };