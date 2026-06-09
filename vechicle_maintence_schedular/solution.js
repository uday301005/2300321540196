/**
 * Vehicle Maintenance Scheduler Microservice
 * Solves the 0/1 Knapsack problem to maximise operational impact
 * within mechanic-hour budget constraints.
 */

const http = require("http");

const { Log, setToken } = require("../logging_middleware/index.js");

// Use token from environment when available (safer than hardcoding)
try {
  setToken(process.env.AUTH_TOKEN || "");
} catch (e) {
  // If middleware doesn't export setToken, ignore silently
}
// ─── Logging Middleware (inline stub — replace with your shared middleware) ───
function createLogger(context) {
  return {
    info: (msg, meta = {}) => {
      console.log(JSON.stringify({ level: "info", context, msg, ...meta }));
      Log("backend", "info", "service", `${context}: ${msg}`);
    },
    error: (msg, meta = {}) => {
      console.error(JSON.stringify({ level: "error", context, msg, ...meta }));
      Log("backend", "error", "service", `${context}: ${msg}`);
    },
  };
}

const logger = createLogger("vehicle-scheduler");

// ─── HTTP helper ──────────────────────────────────────────────────────────────
const BASE_URL = "http://4.224.186.213/evaluation-service";
const AUTH_HEADER = process.env.AUTH_TOKEN
  ? { Authorization: `Bearer ${process.env.AUTH_TOKEN}` }
  : {};

function fetchJSON(path) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    logger.info("Fetching URL", { url });
    http
      .get(url, { headers: AUTH_HEADER }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        });
      })
      .on("error", reject);
  });
}

// ─── Core Algorithm: 0/1 Knapsack (DP) ───────────────────────────────────────
/**
 * Solves the 0/1 knapsack problem.
 * @param {Array<{TaskID:string, Duration:number, Impact:number}>} vehicles
 * @param {number} capacity - mechanic-hours budget
 * @returns {{ selectedTasks: Array, totalImpact: number, totalDuration: number }}
 */
function knapsack(vehicles, capacity) {
  const n = vehicles.length;
  logger.info("Starting knapsack DP", { n, capacity });

  // dp[i][w] = max impact using first i items with budget w
  // Use 1-D rolling array for space efficiency: O(capacity)
  const dp = new Array(capacity + 1).fill(0);

  for (let i = 0; i < n; i++) {
    const { Duration: w, Impact: v } = vehicles[i];
    // Traverse backwards to avoid using the same item twice
    for (let j = capacity; j >= w; j--) {
      if (dp[j - w] + v > dp[j]) {
        dp[j] = dp[j - w] + v;
      }
    }
  }

  const maxImpact = dp[capacity];

  // Back-trace to identify selected items (requires 2-D table for exact trace)
  // Rebuild 2-D table for back-tracing (only when n is manageable)
  const table = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    const { Duration: w, Impact: v } = vehicles[i - 1];
    for (let j = 0; j <= capacity; j++) {
      table[i][j] = table[i - 1][j];
      if (j >= w && table[i - 1][j - w] + v > table[i][j]) {
        table[i][j] = table[i - 1][j - w] + v;
      }
    }
  }

  // Back-trace selected tasks
  const selectedTasks = [];
  let w = capacity;
  for (let i = n; i > 0; i--) {
    if (table[i][w] !== table[i - 1][w]) {
      selectedTasks.push(vehicles[i - 1]);
      w -= vehicles[i - 1].Duration;
    }
  }

  const totalDuration = selectedTasks.reduce((s, t) => s + t.Duration, 0);
  const totalImpact = selectedTasks.reduce((s, t) => s + t.Impact, 0);

  logger.info("Knapsack solved", { totalImpact, totalDuration, selectedCount: selectedTasks.length });

  return { selectedTasks, totalImpact, totalDuration };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  try {
    logger.info("Fetching depots and vehicles...");
    const [{ depots }, { vehicles }] = await Promise.all([
      fetchJSON("/depots"),
      fetchJSON("/vehicles"),
    ]);

    logger.info("Data fetched", { depotCount: depots.length, vehicleCount: vehicles.length });

    const results = [];

    for (const depot of depots) {
      const { ID: depotId, MechanicHours: budget } = depot;
      logger.info("Scheduling for depot", { depotId, budget });

      const { selectedTasks, totalImpact, totalDuration } = knapsack(vehicles, budget);

      const depotResult = {
        depotId,
        mechanicHoursBudget: budget,
        mechanicHoursUsed: totalDuration,
        totalOperationalImpact: totalImpact,
        scheduledTasks: selectedTasks.map((t) => ({
          taskId: t.TaskID,
          duration: t.Duration,
          impact: t.Impact,
        })),
      };

      results.push(depotResult);

      console.log("\n" + "=".repeat(60));
      console.log(`DEPOT ${depotId} — Budget: ${budget}h`);
      console.log(`  Tasks selected : ${selectedTasks.length}`);
      console.log(`  Hours used     : ${totalDuration} / ${budget}`);
      console.log(`  Total impact   : ${totalImpact}`);
      console.log("  Tasks:");
      selectedTasks.forEach((t) =>
        console.log(`    - ${t.TaskID}  duration=${t.Duration}h  impact=${t.Impact}`)
      );
    }

    console.log("\n" + "=".repeat(60));
    console.log("SUMMARY");
    results.forEach((r) =>
      console.log(
        `  Depot ${r.depotId}: impact=${r.totalOperationalImpact}  used=${r.mechanicHoursUsed}/${r.mechanicHoursBudget}h  tasks=${r.scheduledTasks.length}`
      )
    );

    logger.info("Scheduling complete", { depots: results.map((r) => ({ id: r.depotId, impact: r.totalOperationalImpact })) });

    return results;
  } catch (err) {
    logger.error("Fatal error", { message: err.message, stack: err.stack });
    process.exit(1);
  }
}

main();


// const axios = require("axios");

// const AUTH_URL = "http://4.224.186.213/evaluation-service/auth";
// const DEPOTS_URL = "http://4.224.186.213/evaluation-service/depots";
// const VEHICLES_URL = "http://4.224.186.213/evaluation-service/vehicles";

// const bearerToken = process.env.AUTH_TOKEN;
// const authPayload = {
//     email: process.env.AUTH_EMAIL ,
//     name: process.env.AUTH_NAME ,
//     rollNo: process.env.AUTH_ROLL_NO ,
//     accessCode: process.env.AUTH_ACCESS_CODE ,
//     clientID: process.env.AUTH_CLIENT_ID ,
//     clientSecret: process.env.AUTH_CLIENT_SECRET
// };

// function validateAuthPayload(payload) {
//     const missing = Object.entries(payload)
//         .filter(([, value]) => !value)
//         .map(([key]) => key);

//     if (missing.length) {
//         throw new Error(
//             `Missing auth configuration: ${missing.join(", ")}. ` +
//             "Set environment variables AUTH_TOKEN or AUTH_EMAIL, AUTH_NAME, AUTH_ROLL_NO, AUTH_ACCESS_CODE, AUTH_CLIENT_ID, AUTH_CLIENT_SECRET."
//         );
//     }
// }

// async function getAuthToken() {
//     if (bearerToken) {
//         return `Bearer ${bearerToken}`;
//     }

//     validateAuthPayload(authPayload);

//     const response = await axios.post(AUTH_URL, authPayload, {
//         headers: {
//             "Content-Type": "application/json"
//         }
//     });

//     const data = response.data || {};
//     const token = data.token || data.access_token || data.accessToken || data.id_token;

//     if (!token) {
//         console.error("Authentication response did not include a token:", data);
//         throw new Error("Unable to obtain auth token.");
//     }

//     const type = (data.token_type || "Bearer").trim();
//     return `${type} ${token}`;
// }

// async function getDepots(authHeader) {
//     const response = await axios.get(DEPOTS_URL, {
//         headers: {
//             Authorization: authHeader
//         }
//     });

//     return response.data.depots;
// }

// async function getVehicles(authHeader) {
//     const response = await axios.get(VEHICLES_URL, {
//         headers: {
//             Authorization: authHeader
//         }
//     });

//     return response.data.vehicles;
// }

// function knapsack(tasks, capacity) {
//     const n = tasks.length;
//     const dp = Array(n + 1).fill().map(() => Array(capacity + 1).fill(0));

//     for (let i = 1; i <= n; i++) {
//         const duration = tasks[i - 1].Duration;
//         const impact = tasks[i - 1].Impact;

//         for (let w = 0; w <= capacity; w++) {
//             if (duration <= w) {
//                 dp[i][w] = Math.max(
//                     dp[i - 1][w],
//                     impact + dp[i - 1][w - duration]
//                 );
//             } else {
//                 dp[i][w] = dp[i - 1][w];
//             }
//         }
//     }

//     return dp;
// }

// function getSelectedTasks(tasks, dp, capacity) {
//     let w = capacity;
//     const selected = [];

//     for (let i = tasks.length; i > 0; i--) {
//         if (dp[i][w] !== dp[i - 1][w]) {
//             selected.push(tasks[i - 1]);
//             w -= tasks[i - 1].Duration;
//         }
//     }

//     return selected.reverse();
// }

// async function main() {
//     try {
//         const authHeader = await getAuthToken();
//         const depots = await getDepots(authHeader);
//         const vehicles = await getVehicles(authHeader);

//         if (!Array.isArray(depots) || !Array.isArray(vehicles)) {
//             throw new Error("Invalid API response: depots or vehicles is not an array.");
//         }

//         for (const depot of depots) {
//             const capacity = Number(depot.MechanicHours) || 0;
//             const dp = knapsack(vehicles, capacity);
//             const selectedTasks = getSelectedTasks(vehicles, dp, capacity);

//             console.log("\n======================");
//             console.log(`Depot ID: ${depot.ID}`);
//             console.log(`Mechanic Hours: ${capacity}`);
//             console.log(`Maximum Impact: ${dp[vehicles.length][capacity]}`);
//             console.log("Selected Tasks:");

//             selectedTasks.forEach(task => {
//                 console.log(task.TaskID, task.Duration, task.Impact);
//             });
//         }
//     } catch (error) {
//         console.error("Error:", error.response ? error.response.data || error.response.statusText : error.message);
//     }
// }

// main();
