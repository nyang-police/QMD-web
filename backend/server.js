import express from "express";
import cors from "cors";
import { spawn } from "child_process";

const app = express();
const port = 8000;
const mcpUrl = "http://localhost:8181/mcp";

app.use(cors());
app.use(express.json());

// MCP Session state
let isInitialized = false;
let requestId = 0;
let postUrl = null;

// Initialize the MCP connection using streamable HTTP JSON-RPC.
const initializeMcp = async () => {
  if (isInitialized) return;

  postUrl = mcpUrl;

  const initPayload = {
    jsonrpc: "2.0",
    id: ++requestId,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "qmd-webgui", version: "1.0.0" },
    },
  };

  const initResponse = await fetch(postUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(initPayload),
  });

  if (!initResponse.ok) {
    const text = await initResponse.text();
    throw new Error(`Failed to initialize MCP: ${initResponse.status} ${initResponse.statusText} ${text}`);
  }

  const data = await initResponse.json();
  if (data.error) throw new Error(data.error.message || "MCP initialize error");

  await fetch(postUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });

  isInitialized = true;
};

// Forward JSON-RPC requests to the MCP Server
const proxyMcpCall = async (method, params = null) => {
  if (!isInitialized && method !== "initialize") {
    await initializeMcp();
  }

  const payload = {
    jsonrpc: "2.0",
    id: ++requestId,
    method,
  };
  if (params) payload.params = params;

  try {
    const response = await fetch(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // In python response.raise_for_status() is called
      const text = await response.text();
      throw new Error(`MCP Error: ${response.statusText} - ${text}`);
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error.message || "MCP RPC Error");
    return data.result || {};
  } catch (error) {
    throw new Error(`Proxying to MCP failed: ${error.message}`);
  }
};

// Tool call helper
const callTool = async (name, args) => {
  const result = await proxyMcpCall("tools/call", { name, arguments: args });
  const contents = result?.content || [];
  for (const content of contents) {
    if (content.type === "text") {
      try {
        return JSON.parse(content.text);
      } catch {
        return { text: content.text };
      }
    }
  }
  return result;
};

const parseCollectionsFromCliOutput = (output) => {
  const collections = [];
  const lines = (output || "").split(/\r?\n/);
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    if (line.startsWith("Collections")) continue;

    const collectionMatch = line.match(/^([^\s].*?)\s+\((qmd:\/\/[^)]+)\)$/);
    if (collectionMatch) {
      if (current) collections.push(current);
      current = {
        name: collectionMatch[1].trim(),
        path: collectionMatch[2].trim(),
      };
      continue;
    }

    if (!current) continue;

    const patternMatch = line.match(/^\s*Pattern:\s*(.+)$/);
    if (patternMatch) {
      current.pattern = patternMatch[1].trim();
      continue;
    }

    const filesMatch = line.match(/^\s*Files:\s*(\d+)/);
    if (filesMatch) {
      current.documents = parseInt(filesMatch[1], 10);
      continue;
    }

    const updatedMatch = line.match(/^\s*Updated:\s*(.+)$/);
    if (updatedMatch) {
      current.updated = updatedMatch[1].trim();
    }
  }

  if (current) collections.push(current);
  return collections;
};

const normalizeStatusPayload = (payload) => {
  if (payload == null) return { collections: [], raw: "" };
  if (typeof payload === "string") return { collections: [], raw: payload };

  if (Array.isArray(payload)) {
    return { collections: payload, raw: JSON.stringify(payload, null, 2) };
  }

  const collections = Array.isArray(payload.collections)
    ? payload.collections
    : Array.isArray(payload.data?.collections)
      ? payload.data.collections
      : [];

  return {
    ...payload,
    collections,
    raw: JSON.stringify(payload, null, 2),
  };
};

const getCollectionsFromCli = async () => {
  const collectionOutput = await runCliCommand(["collection", "list"]);
  return parseCollectionsFromCliOutput(collectionOutput);
};

const stripAnsi = (text) =>
  (text || "").replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");

const normalizeSearchResults = (items) =>
  (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    path: item.path || item.displayPath || item.file || item.uri || "",
  }));

// GET /api/search
// Parameters: query, limit, mode (search|vsearch|query), collection, min_score
app.get("/api/search", async (req, res) => {
  try {
    const { query, limit = 20, mode = "query", collection = "" } = req.query;
    if (!query) return res.status(400).json({ error: "Missing query parameter" });

    const args = { limit: parseInt(limit, 10) };
    if (collection) args.collection = collection;

    try {
      let data;
      if (mode === "query") {
        args.query = query;
        data = await callTool("query", args);
      } else {
        const type = mode === "search" ? "lex" : "vec";
        args.queries = [{ type, query }];
        data = await callTool("query", args);
      }

      const mcpResults = Array.isArray(data) ? data : data?.results || data?.documents || [];
      return res.json(normalizeSearchResults(mcpResults));
    } catch (mcpError) {
      // Fallback to CLI when MCP is unavailable.
      const collectionArgs = collection ? ["-c", collection] : [];
      const baseArgs = ["-n", String(parseInt(limit, 10) || 20), "--json", ...collectionArgs];

      let cliCmd = mode;
      if (mode === "vsearch") cliCmd = "vsearch";
      if (mode === "search") cliCmd = "search";
      if (mode === "query") cliCmd = "query";

      try {
        const raw = await runCliCommand([cliCmd, query, ...baseArgs]);
        const parsed = JSON.parse(raw);
        const cliResults = Array.isArray(parsed) ? parsed : parsed?.results || parsed?.documents || [];
        return res.json(normalizeSearchResults(cliResults));
      } catch (cliError) {
        // Final fallback: if hybrid query fails, return BM25 search results.
        if (mode === "query") {
          try {
            const raw = await runCliCommand(["search", query, ...baseArgs]);
            const parsed = JSON.parse(raw);
            const fallbackResults = Array.isArray(parsed) ? parsed : parsed?.results || parsed?.documents || [];
            return res.json(normalizeSearchResults(fallbackResults));
          } catch {
            // fall through to combined error below
          }
        }

        return res.status(500).json({
          error: `Search failed (MCP and CLI): ${mcpError.message} / ${cliError.message}`,
        });
      }
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/document
app.get("/api/document", async (req, res) => {
  try {
    const { path } = req.query;
    if (!path) return res.status(400).json({ error: "Missing path parameter" });

    try {
      const data = await callTool("get", { path });
      return res.json(data);
    } catch {
      // Fallback to CLI when MCP is unavailable.
      const text = await runCliCommand(["get", String(path), "--full"]);
      return res.json({ text });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/status
app.get("/api/status", async (req, res) => {
  try {
    let normalized = null;

    try {
      const data = await callTool("status", {});
      normalized = normalizeStatusPayload(data);
    } catch {
      // Fallback to CLI below.
    }

    const collections = await getCollectionsFromCli();

    let statusOutput = "";
    try {
      statusOutput = await runCliCommand(["status"]);
    } catch {
      // Leave empty if status command fails; collections are still useful for the UI.
    }

    const response = {
      ...(normalized || {}),
      collections,
      statusText: statusOutput,
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/collections
app.get("/api/collections", async (req, res) => {
  try {
    const collections = await getCollectionsFromCli();
    res.json({ collections });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/collections/:name/files
app.get("/api/collections/:name/files", async (req, res) => {
  try {
    const { name } = req.params;
    if (!name) return res.status(400).json({ error: "Missing collection name" });

    const output = await runCliCommand(["ls", name]);
    const files = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// For CLI fallbacks operations (add, remove, update)
const runCliCommand = (args) => {
  return new Promise((resolve, reject) => {
    const process = spawn("qmd", args);
    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => { stdout += data.toString(); });
    process.stderr.on("data", (data) => { stderr += data.toString(); });

    process.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr || "qmd error"));
      else resolve(stdout);
    });
  });
};

app.post("/api/collections/add", async (req, res) => {
  try {
    const { path, name, mask } = req.body;
    const args = ["collection", "add", path, "--name", name];
    if (mask) args.push("--mask", mask);
    const output = await runCliCommand(args);
    res.json({ success: true, message: output });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/collections/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const output = await runCliCommand(["collection", "remove", name]);
    res.json({ success: true, message: output });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/collections/:name/rename", async (req, res) => {
  try {
    const { name } = req.params;
    const { newName } = req.body;
    const output = await runCliCommand(["collection", "rename", name, newName]);
    res.json({ success: true, message: output });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/collections/:name/update", async (req, res) => {
  try {
    const { name } = req.params;
    const args = ["update"];
    if (name && name !== "all") args.push("--collection", name);
    const output = await runCliCommand(args);
    res.json({ success: true, message: output });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/embed (SSE for long running process)
app.get("/api/embed", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const force = req.query.force === "true";
  
  // Actually run `qmd embed` (we can't easily capture embed_runner.py JSON outputs dynamically here unless we write a node version of embed_runner.py, so we will capture the stdout lines and parse them)
  
  const args = ["embed"];
  if (force) args.push("-f");
  
  const process = spawn("qmd", args);

  process.stdout.on("data", (data) => {
    // qmd embed emits terminal control sequences; strip ANSI before streaming.
    const lines = data.toString().split("\\n");
    for (const line of lines) {
      const cleaned = stripAnsi(line).trim();
      if (cleaned) {
        res.write(`data: ${JSON.stringify({ type: "log", text: cleaned })}\n\n`);
      }
    }
  });

  process.stderr.on("data", (data) => {
    const lines = data.toString().split("\\n");
    for (const line of lines) {
      const cleaned = stripAnsi(line).trim();
      if (cleaned) {
        res.write(`data: ${JSON.stringify({ type: "log", text: "ERR: " + cleaned })}\n\n`);
      }
    }
  });

  process.on("close", (code) => {
    res.write(`data: ${JSON.stringify({ type: "done", exit_code: code })}\n\n`);
    res.end();
  });
});

// Start Express proxy server
app.listen(port, () => {
  console.log(`Backend API Server running at http://localhost:${port}`);
});
