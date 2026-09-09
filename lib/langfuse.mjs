export function parseQuery(text, defaultField = "sessionId") {
  const match = text.trim().match(/^([\w.\-]+)\s*:\s*(.+)$/s);
  const aliases = {
    session_id: "sessionId",
    trace_id: "traceId",
    user_id: "userId",
    observation_id: "id",
  };
  const field = match ? aliases[match[1]] || match[1] : defaultField;
  const value = (match ? match[2] : text).trim();
  if (!value) throw new Error("識別子を入力してください。");
  if (field.startsWith("metadata.") && field.length > 9)
    return {
      type: "stringObject",
      column: "metadata",
      key: field.slice(9),
      operator: "=",
      value,
    };
  if (
    !["sessionId", "traceId", "userId", "id", "name", "traceName"].includes(
      field,
    )
  )
    throw new Error(
      "検索項目は session_id / trace_id / user_id / observation_id / name / traceName / metadata.キー を指定してください。",
    );
  return { type: "string", column: field, operator: "=", value };
}

export async function readPages(
  config,
  filters,
  { fetcher = fetch, signal, full = false } = {},
) {
  let cursor;
  const seen = new Set();
  const rows = new Map();
  do {
    const params = new URLSearchParams({
      limit: "200",
      fields: full
        ? "core,basic,time,io,metadata,model,usage,prompt,metrics,trace_context"
        : "core,basic,trace_context",
      filter: JSON.stringify(filters),
    });
    if (cursor) params.set("cursor", cursor);
    const response = await fetcher(
      `${config.baseUrl.replace(/\/$/, "")}/api/public/v2/observations?${params}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString("base64")}`,
        },
        signal: signal || AbortSignal.timeout(60000),
        redirect: "error",
      },
    );
    if (!response.ok)
      throw new Error(
        response.status === 401 || response.status === 403
          ? "Langfuse の認証に失敗しました。接続設定を確認してください。"
          : `Langfuse API エラー (${response.status})。検索期間・接続先・API の状態を確認してください。`,
      );
    const result = await response.json();
    if (!Array.isArray(result.data))
      throw new Error("Langfuse API の応答形式が不正です。");
    result.data.forEach((row) => rows.set(row.id, row));
    cursor = result.meta?.cursor;
    if (cursor && seen.has(cursor))
      throw new Error("ページ取得が進みません。結果は未完了です。");
    seen.add(cursor);
  } while (cursor);
  return [...rows.values()];
}

export async function searchTraces(config, request, options = {}) {
  const filter = parseQuery(request.query, config.defaultField);
  const from = new Date(request.from);
  const to = new Date(request.to);
  if (!Number.isFinite(+from) || !Number.isFinite(+to) || from >= to)
    throw new Error("有効な検索期間を指定してください。");
  const bounds = [
    {
      type: "datetime",
      column: "startTime",
      operator: ">=",
      value: from.toISOString(),
    },
    {
      type: "datetime",
      column: "startTime",
      operator: "<",
      value: to.toISOString(),
    },
  ];
  const matches = await readPages(config, [filter, ...bounds], options);
  const ids = [...new Set(matches.map((row) => row.traceId))];
  // Once a trace matches, retrieve every observation, including those outside the search window.
  const traces = [];
  for (const id of ids) {
    let observations = await readPages(
      config,
      [{ type: "string", column: "traceId", operator: "=", value: id }],
      { ...options, full: true },
    );
    const keys = [
      ...new Set(
        observations.flatMap((row) => Object.keys(row.metadata || {})),
      ),
    ];
    if (keys.length) {
      const originalFetcher = options.fetcher || fetch;
      observations = await readPages(
        config,
        [{ type: "string", column: "traceId", operator: "=", value: id }],
        {
          ...options,
          full: true,
          fetcher: (url, init) => {
            const expanded = new URL(url);
            expanded.searchParams.set("expandMetadata", keys.join(","));
            return originalFetcher(expanded, init);
          },
        },
      );
    }
    observations.sort((a, b) =>
      String(a.startTime).localeCompare(String(b.startTime)),
    );
    traces.push({
      id,
      name:
        observations.find((o) => o.traceName)?.traceName ||
        observations[0]?.name ||
        id,
      observations,
    });
  }
  return { traces, matched: matches.length };
}
