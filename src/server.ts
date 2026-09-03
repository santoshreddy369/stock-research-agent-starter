/**
 * server.ts: web service after the Workflows tutorial step.
 *
 * Keeps the starter’s HTML/CSS/JS serving (inline CSS + /client.js bundle).
 * Research no longer awaits in-process: POST starts the root Workflow task and
 * returns a receipt (taskRunId). GET polls that root task run for status / memo.
 *
 * Env: WORKFLOW_SERVICE_SLUG = Dashboard Workflow Slug only (not slug/taskName).
 * Env: RENDER_API_KEY = API key used by the Render SDK client.
 */

import express from "express"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Render } from "@renderinc/sdk"

const app = express()
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const publicDir = join(root, "public")
const render = new Render()

app.use(express.json())

app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store")
  next()
})

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true })
})

/** Inline CSS + point the page at the single /client.js bundle. */
function sendIndex(res: express.Response): void {
  const css = readFileSync(join(publicDir, "styles.css"), "utf8")
  let html = readFileSync(join(publicDir, "index.html"), "utf8")
  html = html.replace(
    /<link\s+rel="stylesheet"\s+href="\/styles\.css[^"]*"\s*\/?>/,
    `<style>\n${css}\n</style>`,
  )
  html = html.replace(
    /<script\s+src="\/app\.js[^"]*"\s+type="module"><\/script>/,
    `<script src="/client.js" type="module"></script>`,
  )
  res.type("html").set("Cache-Control", "no-cache").send(html)
}

/** Concatenate tracker + app so the browser makes one JS request. */
function sendClientBundle(res: express.Response): void {
  const tracker = readFileSync(join(publicDir, "tracker.js"), "utf8")
    .replace(/\bexport\s+const\b/g, "const")
    .replace(/\bexport\s+function\b/g, "function")
  const appJs = readFileSync(join(publicDir, "app.js"), "utf8").replace(
    /import\s*\{[^}]*\}\s*from\s*["']\.\/tracker\.js["']\s*;?\s*/,
    "",
  )
  res
    .type("js")
    .set("Cache-Control", "no-cache")
    .send(`${tracker}\n${appJs}`)
}

app.get("/", (_req, res) => sendIndex(res))
app.get("/index.html", (_req, res) => sendIndex(res))
app.get("/client.js", (_req, res) => sendClientBundle(res))

app.use(
  express.static(publicDir, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".js") || filePath.endsWith(".html") || filePath.endsWith(".css")) {
        res.set("Cache-Control", "no-cache")
      }
    },
  }),
)

/** Workflow Slug from the Dashboard (example: stock-research-agent-starter-1). */
function workflowSlug(): string {
  const slug = process.env.WORKFLOW_SERVICE_SLUG?.trim()
  if (!slug) {
    throw new Error("WORKFLOW_SERVICE_SLUG is required")
  }
  return slug
}

/**
 * Starts the root researchStock task and returns the task-run ID immediately.
 * Do not start step tasks from here: the root chains them.
 * Payload is [ticker] only. Render injects ctx; it is not in the array.
 */
app.post("/api/research", async (req, res) => {
  const ticker = String(req.body?.ticker ?? "").trim()
  if (!ticker) {
    res.status(400).json({ error: "ticker is required" })
    return
  }

  try {
    const started = await render.workflows.startTask(
      `${workflowSlug()}/researchStock`,
      [ticker],
    )
    res.status(202).json({
      taskRunId: started.taskRunId,
      statusUrl: `/api/research/${started.taskRunId}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start research"
    res.status(500).json({ error: message })
  }
})

/**
 * Returns root task-run status, and the memo when the root run succeeded
 * or completed. Clients poll this with the taskRunId from POST.
 */
app.get("/api/research/:taskRunId", async (req, res) => {
  try {
    const details = await render.workflows.getTaskRun(req.params.taskRunId)

    if (details.status === "succeeded" || details.status === "completed") {
      res.json({
        status: details.status,
        startedAt: details.startedAt ?? null,
        memo: details.results?.[0] ?? null,
      })
      return
    }

    if (details.status === "failed" || details.status === "canceled") {
      res.status(500).json({
        status: details.status,
        startedAt: details.startedAt ?? null,
        error: details.error ?? "Research failed",
      })
      return
    }

    res.json({
      status: details.status,
      startedAt: details.startedAt ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load research"
    res.status(500).json({ error: message })
  }
})

const port = Number(process.env.PORT ?? "3000")
app.listen(port, "0.0.0.0", () => {
  console.log(`stock-research listening on ${port}`)
})