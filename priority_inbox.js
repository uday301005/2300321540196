
const http = require("http");

function createLogger(ctx) {
  return {
    info: (msg, meta = {}) =>
      console.log(JSON.stringify({ level: "info", ctx, msg, ...meta, ts: new Date().toISOString() })),
    error: (msg, meta = {}) =>
      console.error(JSON.stringify({ level: "error", ctx, msg, ...meta, ts: new Date().toISOString() })),
  };
}
const logger = createLogger("priority-inbox");

const BASE_URL = "http://4.224.186.213/evaluation-service";
const AUTH_HEADER = process.env.AUTH_TOKEN
  ? { Authorization: `Bearer ${process.env.AUTH_TOKEN}` }
  : {};

const TYPE_WEIGHT = { Placement: 3, Result: 2, Event: 1 };

function fetchJSON(path) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    logger.info("GET", { url });
    http
      .get(url, { headers: AUTH_HEADER }, (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
        });
      })
      .on("error", reject);
  });
}

function priorityScore(notification) {
  const weight = TYPE_WEIGHT[notification.Type] ?? 1;
  const ts = new Date(notification.Timestamp).getTime();
  const hoursAgo = (Date.now() - ts) / 3_600_000;
  const recencyFactor = 1 / (1 + hoursAgo);
  return weight * recencyFactor;
}

// ─── Min-Heap ─────────────────────────────────────────────────────────────────
class MinHeap {
  constructor(compareFn) {
    this._heap = [];
    this._compare = compareFn; // returns true if a < b (a should be popped first)
  }

  get size() { return this._heap.length; }

  peek() { return this._heap[0]; }

  push(item) {
    this._heap.push(item);
    this._bubbleUp(this._heap.length - 1);
  }

  pop() {
    const top = this._heap[0];
    const last = this._heap.pop();
    if (this._heap.length > 0) {
      this._heap[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._compare(this._heap[i], this._heap[parent])) {
        [this._heap[i], this._heap[parent]] = [this._heap[parent], this._heap[i]];
        i = parent;
      } else break;
    }
  }

  _sinkDown(i) {
    const n = this._heap.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this._compare(this._heap[l], this._heap[smallest])) smallest = l;
      if (r < n && this._compare(this._heap[r], this._heap[smallest])) smallest = r;
      if (smallest === i) break;
      [this._heap[i], this._heap[smallest]] = [this._heap[smallest], this._heap[i]];
      i = smallest;
    }
  }
}


function getTopN(notifications, N = 10) {
  const heap = new MinHeap((a, b) => a.score < b.score);

  for (const notif of notifications) {
    const score = priorityScore(notif);
    const item = { ...notif, score };

    if (heap.size < N) {
      heap.push(item);
    } else if (score > heap.peek().score) {
      heap.pop();
      heap.push(item);
    }
  }

  const result = [];
  while (heap.size > 0) result.push(heap.pop());
  return result.sort((a, b) => b.score - a.score);
}

async function main(topN = 10) {
  try {
    logger.info("Fetching notifications...", { topN });
    const { notifications } = await fetchJSON("/notifications");
    logger.info("Fetched", { count: notifications.length });

    const top = getTopN(notifications, topN);

    console.log(`\n${"=".repeat(60)}`);
    console.log(`TOP ${topN} PRIORITY NOTIFICATIONS`);
    console.log("=".repeat(60));
    top.forEach((n, i) => {
      console.log(
        `${String(i + 1).padStart(2)}. [${n.Type.padEnd(9)}] score=${n.score.toFixed(4)}  msg="${n.Message}"  ts=${n.Timestamp}`
      );
    });
    console.log("=".repeat(60));

    logger.info("Priority inbox computed", {
      topN,
      results: top.map((n) => ({ id: n.ID, type: n.Type, score: n.score.toFixed(4) })),
    });

    return top;
  } catch (err) {
    logger.error("Fatal", { message: err.message });
    process.exit(1);
  }
}

main(10);


















// const axios = require('axios');

// const NOTIFICATION_WEIGHTS = {
//   'Placement': 3.0,
//   'Result': 2.0,
//   'Event': 1.0
// };

// const AUTH_URL = "http://4.224.186.213/evaluation-service/auth";
// const NOTIFICATIONS_URL = "http://4.224.186.213/evaluation-service/notifications";

// const authPayload = {
//     email: process.env.AUTH_EMAIL,
//     name: process.env.AUTH_NAME ,
//     rollNo: process.env.AUTH_ROLL_NO ,
//     accessCode: process.env.AUTH_ACCESS_CODE ,
//     clientID: process.env.AUTH_CLIENT_ID,
//     clientSecret: process.env.AUTH_CLIENT_SECRET
// };

// const mockNotifications = [
//   {
//     "ID": "d146065a-ed86-404b-9e6b-39eca14576bc",
//     "Type": "Placement",
//     "Message": "Advanced Micro Devices campus drive scheduled for next week",
//     "Timestamp": new Date(Date.now() - 30 * 60 * 1000).toISOString()
//   },
//   {
//     "ID": "2e26063a-22bc-404b-8f9c-39eca14576bc",
//     "Type": "Result",
//     "Message": "Mid-semester examination results published",
//     "Timestamp": new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
//   },
//   {
//     "ID": "4b6e22ee-b4ed-45a4-a6af-5294b8d69f37",
//     "Type": "Event",
//     "Message": "Tech conference registration open - apply now",
//     "Timestamp": new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
//   },
//   {
//     "ID": "ecaeb581-bdfc-43e0-a047-871fdafe8167",
//     "Type": "Placement",
//     "Message": "Goldman Sachs internship opportunity - Winter 2026",
//     "Timestamp": new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
//   },
//   {
//     "ID": "fb1e3165-67c9-4e96-a3c3-2d2ee85d293b",
//     "Type": "Result",
//     "Message": "Project submission grades available",
//     "Timestamp": new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
//   },
//   {
//     "ID": "338065ce-3815-4e1e-a18a-b93b117e3ea8",
//     "Type": "Event",
//     "Message": "Campus recruitment drive - Deloitte",
//     "Timestamp": new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
//   },
//   {
//     "ID": "8a7ff5b1-335c-4a2f-b6d8-a9c4a362e781",
//     "Type": "Placement",
//     "Message": "Accenture hiring for graduate program",
//     "Timestamp": new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
//   },
//   {
//     "ID": "c3d9e2a1-7f5b-4e8c-b1d2-f8a9c3d5e7b9",
//     "Type": "Result",
//     "Message": "Semester GPA updated in your academic record",
//     "Timestamp": new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString()
//   },
//   {
//     "ID": "a1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6",
//     "Type": "Event",
//     "Message": "Hackathon 2026 registration open",
//     "Timestamp": new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
//   },
//   {
//     "ID": "f5e4d3c2-b1a0-9f8e-7d6c-5b4a39281726",
//     "Type": "Placement",
//     "Message": "Microsoft internship applications closing soon",
//     "Timestamp": new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()
//   }
// ];

// function calculateRecencyScore(createdAt) {
//   const now = new Date();
//   const diffMs = now - new Date(createdAt);
//   const diffHours = diffMs / (1000 * 60 * 60);
  
//   if (diffHours <= 1) return 100;
//   if (diffHours <= 6) return 80;
//   if (diffHours <= 24) return 60;
//   if (diffHours <= 168) return 30;
//   return 10;
// }

// function calculatePriority(notification) {
//   const weight = NOTIFICATION_WEIGHTS[notification.Type] || 1.0;
//   const recencyScore = calculateRecencyScore(notification.Timestamp);
  
//   return {
//     ...notification,
//     weight,
//     recencyScore,
//     priorityScore: (weight * 100) + recencyScore
//   };
// }

// async function getAuthToken() {
//     if (process.env.AUTH_TOKEN) {
//         return `Bearer ${process.env.AUTH_TOKEN}`;
//     }

//     try {
//         const response = await axios.post(AUTH_URL, authPayload, {
//             headers: {
//                 "Content-Type": "application/json"
//             }
//         });

//         const data = response.data || {};
//         const token = data.token || data.access_token || data.accessToken || data.id_token;

//         if (!token) {
//             throw new Error("Unable to obtain auth token.");
//         }

//         const type = (data.token_type || "Bearer").trim();
//         return `${type} ${token}`;
//     } catch (error) {
//         throw error;
//     }
// }

// async function getNotifications(authHeader) {
//   try {
//     const response = await axios.get(NOTIFICATIONS_URL, {
//       headers: {
//         'Authorization': authHeader,
//         'Content-Type': 'application/json'
//       }
//     });
    
//     const data = response.data;
//     if (data && data.notifications && Array.isArray(data.notifications)) {
//       return data.notifications;
//     }
    
//     if (Array.isArray(data)) {
//       return data;
//     }
    
//     return [];
//   } catch (error) {
//     return null;
//   }
// }

// function getTopPriorityNotifications(notifications, topN = 10) {
//   const withPriority = notifications.map(calculatePriority);
//   const sorted = withPriority.sort((a, b) => b.priorityScore - a.priorityScore);
//   return sorted.slice(0, topN);
// }

// function formatOutput(notifications) {
//   if (notifications.length === 0) {
//     console.log('No notifications to display.\n');
//     return;
//   }
  
//   notifications.forEach((notif, idx) => {
//     const typeEmoji = {
//       'Placement': '*',
//       'Result': '*',
//       'Event': '*'
//     }[notif.Type] || '*';
    
//     const date = new Date(notif.Timestamp);
//     const formattedDate = date.toLocaleString();
    
//     console.log(`${idx + 1}. ${typeEmoji} [${notif.Type}] Priority: ${notif.priorityScore.toFixed(1)}`);
//     console.log(`   Message: ${notif.Message}`);
//     console.log(`   Date: ${formattedDate}`);
//     console.log(`   Weight: ${notif.weight.toFixed(1)}x, Recency: ${notif.recencyScore}/100`);
//     console.log(`   ID: ${notif.ID}`);
//     console.log('');
//   });
  
//   console.log('═'.repeat(88) + '\n');
// }

// async function main() {
//   try {
//     let allNotifications = null;
//     const useMock = process.env.DEMO_MODE === 'true' || process.argv.includes('--demo');
    
//     if (useMock) {
//       console.log('Using mock notifications (DEMO MODE)\n');
//       allNotifications = mockNotifications;
//     } else {
//       console.log('Authenticating...');
//       try {
//         const authHeader = await getAuthToken();
//         console.log('Authentication successful\n');
        
//         console.log('Fetching notifications...');
//         allNotifications = await getNotifications(authHeader);
//       } catch (authError) {
//         console.log('\n Real authentication failed. Falling back to mock data...\n');
//         allNotifications = mockNotifications;
//       }
//     }
    
//     if (!allNotifications || allNotifications.length === 0) {
//       console.log('No notifications found.');
//       return;
//     }
    
//     console.log(`Processing ${allNotifications.length} notifications...\n`);
    
//     const topNotifications = getTopPriorityNotifications(allNotifications, 10);
    
//     formatOutput(topNotifications);
    
//     const placementCount = topNotifications.filter(n => n.Type === 'Placement').length;
//     const resultCount = topNotifications.filter(n => n.Type === 'Result').length;
//     const eventCount = topNotifications.filter(n => n.Type === 'Event').length;
    
//     console.log(`Summary:`);
//     console.log(`Placements: ${placementCount}`);
//     console.log(`Results: ${resultCount}`);
//     console.log(`Events: ${eventCount}`);
//     console.log(`Total: ${topNotifications.length}\n`);
    
//   } catch (error) {
//     console.error('Error in main:', error.message);
//   }
// }

// main();
