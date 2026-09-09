const time = (seconds) =>
  new Date(Date.UTC(2026, 8, 9, 5, 32, seconds)).toISOString();
const observation = (id, name, type, start, end, data = {}) => ({
  id,
  name,
  type,
  startTime: time(start),
  endTime: time(end),
  level: "DEFAULT",
  metadata: {},
  ...data,
});
export const demoQuery = "session_id: 8b61f4c2-73a9-4e28-b650-9c02f8d31a77";
export const demoTraces = [
  {
    id: "a8f20c1e947b4a60924d51b8f76e3d09",
    name: "customer-support-agent",
    observations: [
      observation("root-1", "customer-support-agent", "AGENT", 0, 12, {
        input: {
          message: "注文 #JP-2048 の配送状況を教えてください。",
          language: "ja",
        },
        output: "配送状況を取得できませんでした。時間をおいてお試しください。",
        metadata: {
          session_id: "8b61f4c2-73a9-4e28-b650-9c02f8d31a77",
          environment: "production",
          request_id: "req_7ca291",
        },
      }),
      observation("classify", "classify-intent", "GENERATION", 0, 2, {
        parentObservationId: "root-1",
        model: "support-model",
        input: {
          messages: [
            {
              role: "system",
              content:
                "# 分類ルール\n\nユーザーの質問を次のカテゴリに分類してください。\n\n- **shipping**: 配送状況・お届け日\n- **returns**: 返品・交換\n- **other**: その他\n\n必ず JSON で返答してください。",
            },
            {
              role: "user",
              content: "注文 #JP-2048 の配送状況を教えてください。",
            },
          ],
        },
        output: { intent: "shipping", confidence: 0.98, order_id: "JP-2048" },
      }),
      observation("lookup", "lookup-order", "TOOL", 2, 3, {
        parentObservationId: "root-1",
        input: { order_id: "JP-2048" },
        output:
          '<order id="JP-2048">\n  <status>shipped</status>\n  <carrier>yamato</carrier>\n  <tracking>1234-5678-9012</tracking>\n  <items>\n    <item quantity="1">ワイヤレスキーボード</item>\n  </items>\n</order>',
      }),
      observation("shipping", "fetch-shipping-status", "TOOL", 3, 8, {
        parentObservationId: "root-1",
        level: "ERROR",
        statusMessage:
          "TimeoutError: Shipping API did not respond within 5000ms",
        input: {
          url: "https://shipping.example.com/v1/tracking",
          method: "GET",
          params: { tracking_number: "1234-5678-9012", carrier: "yamato" },
          timeout_ms: 5000,
        },
        output: {
          error: {
            type: "TimeoutError",
            message: "Shipping API did not respond within 5000ms",
            code: "ETIMEDOUT",
            retryable: true,
          },
          stack:
            "TimeoutError: Shipping API did not respond within 5000ms\n    at ShippingClient.getStatus (shipping/client.ts:84:11)\n    at async fetchShippingStatus (tools/shipping.ts:32:18)\n    at async Agent.execute (agent.ts:126:9)",
        },
        metadata: { attempt: 1, region: "ap-northeast-1" },
      }),
      observation("retry", "retry-shipping-status", "TOOL", 8, 11, {
        parentObservationId: "shipping",
        level: "ERROR",
        statusMessage: "HTTP 503: Shipping service temporarily unavailable",
        input: { tracking_number: "1234-5678-9012", attempt: 2 },
        output:
          "<error>\n  <code>SERVICE_UNAVAILABLE</code>\n  <message>Upstream connection refused</message>\n  <retryAfter>30</retryAfter>\n</error>",
      }),
      observation("answer", "compose-response", "GENERATION", 11, 12, {
        parentObservationId: "root-1",
        input: {
          context: "配送サービスから応答がありません。",
          instructions: "ユーザーに状況を簡潔に伝えてください。",
        },
        output:
          "## 配送状況について\n\n注文 **#JP-2048** は発送済みです。\n\n現在、配送会社のシステムに接続できないため、詳しい配送状況を確認できません。\n\n### 次にできること\n\n- 少し時間をおいて、もう一度お問い合わせください。\n- お急ぎの場合は、追跡番号 `1234-5678-9012` を使って配送会社にご確認ください。",
      }),
    ],
  },
  {
    id: "b73f19d5028e4c87a009e2bf67ac1453",
    name: "follow-up-response",
    observations: [
      observation("root-2", "follow-up-response", "AGENT", 30, 33, {
        input: "わかりました。追跡番号をコピーしたいです。",
        output: "追跡番号は 1234-5678-9012 です。",
      }),
      observation("format", "format-tracking-number", "GENERATION", 30, 32, {
        parentObservationId: "root-2",
        input: { tracking: "123456789012" },
        output: {
          display: "1234-5678-9012",
          raw: "123456789012",
          note: "配送会社のウェブサイトで確認できます。",
        },
      }),
      observation("complete", "send-response", "SPAN", 32, 33, {
        parentObservationId: "root-2",
        input: { text: "追跡番号は 1234-5678-9012 です。" },
        output: { delivered: true },
      }),
    ],
  },
].map((t) => ({
  ...t,
  observations: t.observations.map((o) => ({ ...o, traceId: t.id })),
}));
