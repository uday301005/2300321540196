const express = require("express");
const axios = require("axios");
const { requestLogger, errorLogger } = require("./logging_middleware");

const app = express();
app.use(express.json());
app.use(requestLogger);

const BASE_URL = "http://4.224.186.213/evaluation-service";
const DEMO_MODE = process.argv.includes("--demo") || process.env.DEMO_MODE === "true";
const TYPE_WEIGHT = { Placement: 3, Result: 2, Event: 1 };

const MOCK_NOTIFICATIONS = [
  {
    ID: "d146065a-ed86-404b-9e6b-39eca14576bc",
    Type: "Placement",
    Message: "Advanced Micro Devices campus drive scheduled for next week",
    Timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    ID: "ecaeb581-bdfc-43e0-a047-871fdafe8167",
    Type: "Placement",
    Message: "Goldman Sachs internship opportunity - Winter 2026",
    Timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  {
    ID: "2e26063a-22bc-404b-8f9c-39eca14576bc",
    Type: "Result",
    Message: "Mid-semester examination results published",
    Timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    ID: "4b6e22ee-b4ed-45a4-a6af-5294b8d69f37",
    Type: "Event",
    Message: "Tech conference registration open - apply now",
    Timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  },
  {
    ID: "fb1e3165-67c9-4e96-a3c3-2d2ee85d293b",
    Type: "Result",
    Message: "Project submission grades available",
    Timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
  },
  {
    ID: "338065ce-3815-4e1e-a18a-b93b117e3ea8",
    Type: "Event",
    Message: "Campus recruitment drive - Deloitte",
    Timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
  },
  {
    ID: "8a7ff5b1-335c-4a2f-b6d8-a9c4a362e781",
    Type: "Placement",
    Message: "Accenture hiring for graduate program",
    Timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    ID: "a1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6",
    Type: "Event",
    Message: "Hackathon 2026 registration open",
    Timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    ID: "f5e4d3c2-b1a0-9f8e-7d6c-5b4a39281726",
    Type: "Placement",
    Message: "Microsoft internship applications closing soon",
    Timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

function priorityScore(notification) {
  const weight = TYPE_WEIGHT[notification.Type] ?? 1;
  const ts = new Date(notification.Timestamp).getTime();
  const hoursAgo = (Date.now() - ts) / 3_600_000;
  const recencyFactor = 1 / (1 + hoursAgo);
  return weight * recencyFactor;
}

function getTopN(notifications, topN = 10) {
  const scored = notifications.map((notification) => ({
    ...notification,
    score: priorityScore(notification),
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

function buildAuthHeader(token) {
  if (!token) return {};
  if (token.startsWith("Bearer ")) return { Authorization: token };
  return { Authorization: `Bearer ${token}` };
}

async function requestAuthToken(payload) {
  const response = await axios.post(`${BASE_URL}/auth`, payload, {
    headers: { "Content-Type": "application/json" },
  });

  const body = response.data || {};
  return body.token || body.access_token || body.accessToken || body.id_token;
}

async function requestNotifications(token) {
  const headers = buildAuthHeader(token);
  const response = await axios.get(`${BASE_URL}/notifications`, { headers });
  return response.data;
}

app.get("/", (req, res) => {
  res.json({
    service: "notification-priority",
    status: "ok",
    demoMode: DEMO_MODE,
    documentation: "/notifications/priority",
  });
});

app.post("/auth/token", async (req, res, next) => {
  try {
    const token = await requestAuthToken(req.body);
    if (!token) {
      return res.status(502).json({ error: "Auth endpoint did not return token" });
    }
    res.json({ access_token: token });
  } catch (error) {
    next(error);
  }
});

app.get("/notifications/priority", async (req, res, next) => {
  try {
    let notifications = [];
    const topN = Number(req.query.topN) || 10;
    const token = req.query.token || req.headers.authorization || process.env.AUTH_TOKEN;

    if (DEMO_MODE || !token) {
      notifications = MOCK_NOTIFICATIONS;
    } else {
      try {
        const payload = await requestNotifications(token);
        if (!payload || !Array.isArray(payload.notifications)) {
          throw new Error("Unexpected notifications payload");
        }
        notifications = payload.notifications;
      } catch (error) {
        console.warn("Notification fetch failed, using demo data", error.message);
        notifications = MOCK_NOTIFICATIONS;
      }
    }

    const topNotifications = getTopN(notifications, topN);
    res.json({ topN: topNotifications.length, notifications: topNotifications });
  } catch (error) {
    next(error);
  }
});

app.use(errorLogger);

app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message || "Internal server error" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Notification service listening on http://localhost:${port}`);
});
