import express from "express";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { searchTraces } from "./lib/langfuse.mjs";
const app = express();
const port = Number(process.env.PORT || 4310);
app.use((req, res, next) => {
  const expected = `127.0.0.1:${port}`;
  if (![expected, `localhost:${port}`].includes(req.headers.host))
    return res.status(403).end();
  if (
    req.headers.origin &&
    ![`http://${expected}`, `http://localhost:${port}`].includes(
      req.headers.origin,
    )
  )
    return res.status(403).end();
  if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "64kb" }));
const configPath = new URL("./.local/connection.json", import.meta.url);
async function getConfig() {
  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    return {};
  }
}
app.get("/api/config", async (req, res) => {
  const c = await getConfig();
  res.json({
    baseUrl: c.baseUrl || "",
    publicKey: c.publicKey || "",
    defaultField: c.defaultField || "sessionId",
    configured: !!c.secretKey,
  });
});
app.post("/api/config", async (req, res) => {
  try {
    const old = await getConfig();
    const { baseUrl, publicKey, defaultField } = req.body;
    const url = new URL(baseUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("接続先 URL を確認してください。");
    const secretKey = req.body.secretKey || old.secretKey;
    if (!publicKey || !secretKey)
      throw new Error("Public Key と Secret Key が必要です。");
    const { parseQuery } = await import("./lib/langfuse.mjs");
    parseQuery("validation", defaultField);
    await mkdir(new URL("./.local/", import.meta.url), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        baseUrl: baseUrl.replace(/\/$/, ""),
        publicKey,
        secretKey,
        defaultField,
      }),
      { mode: 0o600 },
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/api/search", async (req, res) => {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  const timeout = setTimeout(() => controller.abort(), 300000);
  try {
    const config = await getConfig();
    if (!config.secretKey)
      throw new Error("先に Langfuse の接続設定を保存してください。");
    res.json(
      await searchTraces(config, req.body, { signal: controller.signal }),
    );
  } catch (e) {
    if (!res.destroyed)
      res
        .status(400)
        .json({
          error: controller.signal.aborted
            ? "取得が中断されました。期間を狭めて再検索してください。"
            : e.message,
        });
  } finally {
    clearTimeout(timeout);
  }
});
if (process.argv.includes("--production")) {
  app.use(express.static("dist"));
  app.get("/{*path}", (req, res) =>
    res.sendFile(
      new URL("./dist/index.html", import.meta.url).pathname.replace(
        /^\/(\w:)/,
        "$1",
      ),
    ),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.listen(port, "127.0.0.1", () =>
  console.log(`Logperch: http://127.0.0.1:${port}`),
);
