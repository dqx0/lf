import test from "node:test";
import assert from "node:assert/strict";
import { parseQuery, readPages, searchTraces } from "../lib/langfuse.mjs";
const config = {
  baseUrl: "https://langfuse.example.test",
  publicKey: "pk-test",
  secretKey: "sk-test",
  defaultField: "sessionId",
};
const json = (body) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
test("identifiers preserve values, support aliases and exact metadata keys", () => {
  assert.deepEqual(parseQuery("session_id: 8b61f4c2"), {
    type: "string",
    column: "sessionId",
    operator: "=",
    value: "8b61f4c2",
  });
  assert.equal(parseQuery(" abc ", "traceId").column, "traceId");
  assert.deepEqual(parseQuery("metadata.request.id: urn:example:123"), {
    type: "stringObject",
    column: "metadata",
    key: "request.id",
    operator: "=",
    value: "urn:example:123",
  });
  assert.throws(() => parseQuery(""), /識別子/);
  assert.throws(() => parseQuery("unknown: abc"), /検索項目/);
});
test("cursor pagination fetches every page and preserves raw IO", async () => {
  let calls = 0;
  const rows = await readPages(config, [], {
    full: true,
    fetcher: async (url, init) => {
      calls++;
      const params = new URL(url).searchParams;
      assert.equal(
        init.headers.Authorization,
        `Basic ${Buffer.from("pk-test:sk-test").toString("base64")}`,
      );
      assert.equal(init.redirect, "error");
      assert.ok(params.get("fields").includes("io"));
      if (calls === 1)
        return json({
          data: [{ id: "1", output: '{"answer":"# Markdown"}' }],
          meta: { cursor: "next" },
        });
      assert.equal(params.get("cursor"), "next");
      return json({ data: [{ id: "2", output: "<xml />" }], meta: {} });
    },
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].output, '{"answer":"# Markdown"}');
});
test("matches expand to whole traces, beyond search bounds, with full metadata", async () => {
  const requests = [];
  const result = await searchTraces(
    config,
    {
      query: "metadata.request_id: request-1",
      from: "2026-09-01",
      to: "2026-09-10",
    },
    {
      fetcher: async (url) => {
        const params = new URL(url).searchParams;
        const filters = JSON.parse(params.get("filter"));
        requests.push(params);
        if (filters[0].column === "metadata") {
          assert.equal(filters.length, 3);
          return json({
            data: [{ id: "match", traceId: "trace-1" }],
            meta: {},
          });
        }
        assert.deepEqual(filters, [
          {
            type: "string",
            column: "traceId",
            operator: "=",
            value: "trace-1",
          },
        ]);
        return json({
          data: [
            {
              id: "match",
              traceId: "trace-1",
              startTime: "2026-09-03",
              metadata: {
                long: params.has("expandMetadata")
                  ? "a".repeat(500)
                  : "a".repeat(200),
              },
            },
            {
              id: "other",
              traceId: "trace-1",
              startTime: "2026-08-31",
              level: "ERROR",
              output: "preserved",
            },
          ],
          meta: {},
        });
      },
    },
  );
  assert.equal(result.traces[0].observations.length, 2);
  assert.equal(result.traces[0].observations[0].id, "other");
  assert.equal(result.traces[0].observations[1].metadata.long.length, 500);
  assert.equal(requests[2].get("expandMetadata"), "long");
});
test("no matches return empty results without fetching arbitrary traces", async () => {
  let calls = 0;
  const result = await searchTraces(
    config,
    { query: "session_id: absent", from: "2026-09-01", to: "2026-09-10" },
    {
      fetcher: async () => {
        calls++;
        return json({ data: [], meta: {} });
      },
    },
  );
  assert.deepEqual(result.traces, []);
  assert.equal(calls, 1);
});
test("failed pages do not return incomplete results as success", async () => {
  let calls = 0;
  await assert.rejects(
    readPages(config, [], {
      fetcher: async () =>
        ++calls === 1
          ? json({ data: [{ id: "1" }], meta: { cursor: "next" } })
          : new Response("private details", { status: 429 }),
    }),
    /429/,
  );
  await assert.rejects(
    readPages(config, [], {
      fetcher: async () => new Response("secret", { status: 401 }),
    }),
    /認証/,
  );
  await assert.rejects(
    readPages(config, [], {
      fetcher: async () => json({ data: [], meta: { cursor: "same" } }),
    }),
    /未完了/,
  );
});
test("invalid or reversed dates are rejected before a network request", async () => {
  await assert.rejects(
    searchTraces(config, { query: "id", from: "bad", to: "2026-01-01" }),
    /検索期間/,
  );
  await assert.rejects(
    searchTraces(config, { query: "id", from: "2026-02-01", to: "2026-01-01" }),
    /検索期間/,
  );
});
