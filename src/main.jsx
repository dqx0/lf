import React, { useState, useEffect, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  Search,
  Settings2,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  X,
  Copy,
  Check,
  AlertCircle,
  CircleCheck,
  Layers,
  Terminal,
  Braces,
  FileText,
  Code2,
  Maximize2,
  Minimize2,
  CornerDownLeft,
  LoaderCircle,
  Waypoints,
  RotateCcw,
  PanelLeftClose,
  PanelLeftOpen,
  FlaskConical,
  Clock3,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { demoQuery, demoTraces } from "./demo";
import "./style.css";

const raw = (value) =>
  value === undefined
    ? ""
    : typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2);
function parse(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      /* Keep original text. */
    }
  }
  return value;
}
function kind(value) {
  const p = parse(value);
  if (p !== null && typeof p === "object") return "JSON";
  if (typeof p === "string" && /^\s*<[^>]+>/.test(p)) return "XML";
  if (typeof p === "string" && /(^#{1,6} |\*\*|^[-*] |```|\]\()/m.test(p))
    return "Markdown";
  return "Text";
}
function duration(o) {
  const n = new Date(o.endTime) - new Date(o.startTime);
  return !Number.isFinite(n) || !o.endTime
    ? "—"
    : n < 1000
      ? `${n} ms`
      : `${(n / 1000).toFixed(2)} s`;
}
function Highlight({ text, query }) {
  if (!query) return text;
  const parts = String(text).split(
    new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
  );
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase() ? <mark key={i}>{p}</mark> : p,
  );
}
function CopyButton({ value, label = "コピー" }) {
  const [state, setState] = useState("");
  return (
    <button
      className="quiet"
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(raw(value));
          setState("コピー済み");
        } catch {
          setState("コピーできません");
        }
        setTimeout(() => setState(""), 1800);
      }}
    >
      {state === "コピー済み" ? <Check size={14} /> : <Copy size={14} />}
      <span>{state || label}</span>
    </button>
  );
}

function TextValue({ value, query, forced }) {
  const text = raw(value);
  const format = forced || kind(value);
  if (format === "Markdown" && !query)
    return (
      <div className="markdown">
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            img: ({ alt }) => (
              <span className="muted">[画像: {alt || "外部画像"}]</span>
            ),
            a: ({ children, href }) => (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
          }}
        >
          {text}
        </Markdown>
      </div>
    );
  return (
    <pre className={`value-text ${format === "XML" ? "xml" : ""}`}>
      {format === "XML" && !query ? (
        text.split(/(<[^>]*>)/g).map((part, index) => (
          <span key={index} className={part.startsWith("<") ? "xml-tag" : ""}>
            {part}
          </span>
        ))
      ) : (
        <Highlight text={text} query={query} />
      )}
    </pre>
  );
}
function JsonNode({
  name,
  value,
  path = "$",
  depth = 0,
  query,
  onInspect,
  expand,
}) {
  const parsed = parse(value);
  const object = parsed !== null && typeof parsed === "object";
  const entries = object ? Object.entries(parsed) : [];
  const [open, setOpen] = useState(depth < 2);
  useEffect(() => {
    if (expand !== null) setOpen(expand.open);
  }, [expand]);
  const matches =
    !query ||
    `${name} ${raw(value)}`.toLowerCase().includes(query.toLowerCase());
  if (!matches) return null;
  return (
    <div className="json-node">
      <div className="json-line">
        {object ? (
          <button
            className="icon tiny"
            aria-label={`${name || "$"} を${open ? "折りたたむ" : "展開"}`}
            onClick={() => setOpen(!open)}
          >
            {open || query ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </button>
        ) : (
          <span className="json-indent" />
        )}
        <button
          className="json-key"
          onClick={() => onInspect({ value, path })}
          title="この値を広く表示"
        >
          <Highlight text={name ?? "$"} query={query} />
        </button>
        <span className="muted">:</span>
        {object ? (
          <span className="json-summary">
            {Array.isArray(parsed)
              ? `[ ${entries.length} items ]`
              : `{ ${entries.length} keys }`}
          </span>
        ) : (
          <span className={`json-scalar ${typeof parsed}`}>
            <Highlight
              text={raw(value) || (value === null ? "null" : '""')}
              query={query}
            />
          </span>
        )}
        {typeof value === "string" && kind(value) !== "Text" && (
          <span className="format-tag">{kind(value)}</span>
        )}
        <button
          className="icon inspect"
          title={`${path} を開く`}
          aria-label={`${path} を開く`}
          onClick={() => onInspect({ value, path })}
        >
          <Maximize2 size={13} />
        </button>
      </div>
      {object && (open || query) && (
        <div className="json-children">
          {entries.map(([key, val]) => (
            <JsonNode
              key={key}
              name={key}
              value={val}
              path={`${path}.${key}`}
              depth={depth + 1}
              query={query}
              onInspect={onInspect}
              expand={expand}
            />
          ))}
        </div>
      )}
    </div>
  );
}
function ValueViewer({ value, label }) {
  const [mode, setMode] = useState("auto");
  const [query, setQuery] = useState("");
  const [wrap, setWrap] = useState(true);
  const [focus, setFocus] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [expand, setExpand] = useState(null);
  const [formatOverride, setFormatOverride] = useState("auto");
  const current = focus ? focus.value : value;
  const display = parse(current);
  const format = formatOverride === "auto" ? kind(current) : formatOverride;
  const text = mode === "raw" ? raw(current) : raw(display);
  useEffect(() => {
    setFocus(null);
    setQuery("");
    setMode("auto");
  }, [value]);
  useEffect(() => {
    const esc = (e) => {
      if (e.key === "Escape") {
        setExpanded(false);
        setFocus(null);
      }
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);
  const count = query
    ? text.toLowerCase().split(query.toLowerCase()).length - 1
    : 0;
  return (
    <section
      className={`viewer ${expanded ? "fullscreen" : ""} ${wrap ? "" : "nowrap"}`}
      aria-label={`${label}の値`}
    >
      <div className="viewer-toolbar">
        <div className="segmented">
          {[
            ["auto", "読みやすく"],
            ["raw", "原文"],
          ].map(([v, title]) => (
            <button
              key={v}
              className={mode === v ? "active" : ""}
              onClick={() => setMode(v)}
            >
              {title}
            </button>
          ))}
        </div>
        {mode === "raw" ? (
          <span className="format-tag">RAW</span>
        ) : (
          <select
            className="format-select"
            aria-label="表示形式"
            value={formatOverride}
            onChange={(e) => setFormatOverride(e.target.value)}
          >
            <option value="auto">自動 · {kind(current)}</option>
            <option>JSON</option>
            <option>Markdown</option>
            <option>XML</option>
            <option value="Text">テキスト</option>
          </select>
        )}
        <div className="spacer" />
        <CopyButton value={current} />
        <button
          className="icon"
          aria-label={expanded ? "拡大を終了" : "値を全画面で表示"}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
      <div className="viewer-search">
        <Search size={14} />
        <input
          aria-label="表示中の値を検索"
          placeholder="この値の中を検索…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && <span>{count} 件</span>}
        <label>
          <input
            type="checkbox"
            checked={wrap}
            onChange={(e) => setWrap(e.target.checked)}
          />
          折り返し
        </label>
      </div>
      {focus && (
        <div className="value-breadcrumb">
          <button className="quiet" onClick={() => setFocus(null)}>
            <ArrowLeft size={13} />
            全体に戻る
          </button>
          <code>{focus.path}</code>
        </div>
      )}
      {mode === "auto" && format === "JSON" && (
        <div className="json-actions">
          <span>キーをクリックして値を詳しく表示</span>
          <button onClick={() => setExpand({ open: true })}>すべて展開</button>
          <button onClick={() => setExpand({ open: false })}>折りたたむ</button>
        </div>
      )}
      <div className="viewer-content">
        {value === undefined ? (
          <div className="empty-value">この項目は記録されていません。</div>
        ) : mode === "raw" ? (
          <pre className="value-text">
            <Highlight text={text} query={query} />
          </pre>
        ) : format === "JSON" ? (
          <JsonNode
            key={focus?.path || "$"}
            path={focus?.path || "$"}
            value={current}
            query={query}
            onInspect={setFocus}
            expand={expand}
          />
        ) : (
          <TextValue value={display} query={query} forced={format} />
        )}
      </div>
      <div className="viewer-footer">
        <span>{text.length.toLocaleString()} characters</span>
        <span>
          {query
            ? "検索中はテキストで一致箇所を表示"
            : "元データを保持して表示"}
        </span>
      </div>
    </section>
  );
}

function Settings({ config, onClose, onSave }) {
  const dialog = useRef();
  const [draft, setDraft] = useState({ ...config, secretKey: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  return (
    <dialog ref={dialog} className="settings-dialog" onCancel={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await onSave(draft);
          } catch (e) {
            setError(e.message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">CONNECTION</span>
            <h2>Langfuse に接続</h2>
          </div>
          <button
            type="button"
            className="icon"
            aria-label="設定を閉じる"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="muted">一つのプロジェクトの API キーで接続します。</p>
        <label>
          接続先 URL
          <input
            required
            type="url"
            placeholder="https://cloud.langfuse.com"
            value={draft.baseUrl}
            onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
          />
        </label>
        <div className="two-fields">
          <label>
            Public Key
            <input
              required
              value={draft.publicKey}
              placeholder="pk-lf-…"
              onChange={(e) =>
                setDraft({ ...draft, publicKey: e.target.value })
              }
            />
          </label>
          <label>
            Secret Key
            <input
              type="password"
              autoComplete="new-password"
              required={!config.configured}
              placeholder={
                config.configured ? "保存済み（変更時のみ入力）" : "sk-lf-…"
              }
              value={draft.secretKey}
              onChange={(e) =>
                setDraft({ ...draft, secretKey: e.target.value })
              }
            />
          </label>
        </div>
        <label>
          識別子だけを入力した場合の検索項目
          <input
            required
            list="fields"
            value={draft.defaultField}
            onChange={(e) =>
              setDraft({ ...draft, defaultField: e.target.value })
            }
          />
          <datalist id="fields">
            <option value="sessionId" />
            <option value="traceId" />
            <option value="userId" />
            <option value="metadata.request_id" />
          </datalist>
        </label>
        <p className="hint">
          独自項目は <code>metadata.request_id</code> のように指定。
          <br />
          キーはこの PC の .local/connection.json に保存します。
        </p>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <button className="primary" disabled={saving}>
          {saving ? "保存中…" : "接続設定を保存"}
          <ArrowRight size={16} />
        </button>
      </form>
    </dialog>
  );
}
async function api(path, data) {
  const response = await fetch(
    path,
    data
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : undefined,
  );
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "取得できませんでした。");
  return body;
}
function ordered(observations) {
  const byId = new Map(observations.map((o) => [o.id, o]));
  const visited = new Set();
  const output = [];
  function visit(o, depth) {
    if (visited.has(o.id)) return;
    visited.add(o.id);
    output.push({ ...o, depth });
    observations
      .filter((c) => c.parentObservationId === o.id)
      .forEach((c) => visit(c, depth + 1));
  }
  observations
    .filter((o) => !byId.has(o.parentObservationId))
    .forEach((o) => visit(o, 0));
  observations.forEach((o) => visit(o, 0));
  return output;
}
function App() {
  const [config, setConfig] = useState({
    baseUrl: "",
    publicKey: "",
    defaultField: "sessionId",
    configured: false,
  });
  const [settings, setSettings] = useState(false);
  const [query, setQuery] = useState("");
  const [days, setDays] = useState("7");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [traces, setTraces] = useState([]);
  const [selected, setSelected] = useState(null);
  const [demo, setDemo] = useState(false);
  const [searched, setSearched] = useState(false);
  const [resultQuery, setResultQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("output");
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [sidebar, setSidebar] = useState(true);
  const [history, setHistory] = useState([]);
  const searchRef = useRef();
  const controller = useRef();
  useEffect(() => {
    api("/api/config")
      .then(setConfig)
      .catch(() => setError("ローカルサーバーに接続できません。"));
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const all = useMemo(
    () =>
      traces.flatMap((t) =>
        t.observations.map((o) => ({ ...o, traceName: t.name })),
      ),
    [traces],
  );
  const errors = all.filter((o) => o.level === "ERROR");
  const active = all.find((o) => o.id === selected);
  const trace = traces.find((t) => t.id === active?.traceId);
  const siblings = trace ? ordered(trace.observations) : [];
  const currentIndex = siblings.findIndex((o) => o.id === selected);
  const choose = (id) => {
    setSelected(id);
    setTab("output");
    requestAnimationFrame(() => {
      const panel = document.querySelector(".detail-panel");
      if (
        panel &&
        (innerWidth <= 720 ||
          panel.getBoundingClientRect().top > innerHeight - 250)
      )
        panel.scrollIntoView({ block: "start", behavior: "instant" });
    });
  };
  const loadDemo = () => {
    controller.current?.abort();
    setLoading(false);
    setTraces(demoTraces);
    setQuery(demoQuery);
    setResultQuery(demoQuery);
    setSelected("shipping");
    setDemo(true);
    setSearched(true);
    setError("");
    setFilter("");
    setCollapsed({});
  };
  const search = async (e) => {
    e?.preventDefault();
    if (!query.trim()) {
      searchRef.current.focus();
      return;
    }
    if (!config.configured) {
      setSettings(true);
      return;
    }
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setLoading(true);
    setError("");
    setDemo(false);
    setTraces([]);
    setSelected(null);
    setSearched(false);
    const submitted = query.trim();
    try {
      const until =
        days === "custom"
          ? new Date(to).toISOString()
          : new Date().toISOString();
      const since =
        days === "custom"
          ? new Date(from).toISOString()
          : new Date(Date.now() - Number(days) * 86400000).toISOString();
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: submitted, from: since, to: until }),
        signal: ctrl.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setTraces(data.traces);
      const observations = data.traces.flatMap((t) => t.observations);
      setSelected(
        (observations.find((o) => o.level === "ERROR") || observations[0])
          ?.id || null,
      );
      setTab("output");
      setResultQuery(submitted);
      setSearched(true);
      setFilter("");
      setCollapsed({});
      setHistory((h) =>
        [submitted, ...h.filter((q) => q !== submitted)].slice(0, 5),
      );
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      if (controller.current === ctrl) setLoading(false);
    }
  };
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="Logperch ホーム">
          <span className="brand-symbol">
            <Waypoints size={22} />
          </span>
          logperch
          <span className="brand-divider" />
          <span className="brand-sub">Trace explorer</span>
        </a>
        <div className="header-right">
          <span
            className={`connection ${config.configured ? "connected" : ""}`}
          >
            <i />
            {config.configured
              ? "接続設定済み · Langfuse v4"
              : "ローカル · 未接続"}
          </span>
          <button
            className="quiet settings-button"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={16} />
            接続設定
          </button>
        </div>
      </header>
      <main className={searched ? "has-results" : ""}>
        <section className="search-section">
          <div className="page-title">
            <div>
              <span className="eyebrow">TRACE WORKSPACE</span>
              <h1>識別子から、原因へ。</h1>
              <p>エラーも、その前後の値も。一つの場所で追いかける。</p>
            </div>
            <button className="quiet demo-button" onClick={loadDemo}>
              <FlaskConical size={16} />
              {demo ? "デモをリセット" : "デモで操作を試す"}
              <ArrowRight size={14} />
            </button>
          </div>
          <form className="search-form" onSubmit={search}>
            <div className="search-input">
              <Search size={21} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="識別子"
                placeholder="session_id: UUID、trace_id: …、metadata.request_id: …"
              />
              <kbd>Ctrl K</kbd>
            </div>
            <select
              aria-label="検索期間"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            >
              <option value="1">過去24時間</option>
              <option value="7">過去7日間</option>
              <option value="30">過去30日間</option>
              <option value="90">過去90日間</option>
              <option value="custom">期間を指定</option>
            </select>
            <button
              className="primary search-submit"
              disabled={loading || !query.trim()}
            >
              {loading ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Search size={17} />
              )}
              検索
              <CornerDownLeft size={14} />
            </button>
          </form>
          {days === "custom" && (
            <div className="date-range">
              <label>
                開始
                <input
                  type="datetime-local"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <span>→</span>
              <label>
                終了
                <input
                  type="datetime-local"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
            </div>
          )}
          <div className="search-hint">
            <span>
              <span className="small-dot" />
              完全一致で検索
            </span>
            <span>
              項目名を省略すると <code>{config.defaultField}</code> を検索
            </span>
            <span className="spacer" />
            <span>複数トレースをまとめて確認</span>
          </div>
        </section>
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={19} />
            <span>{error}</span>
            <button className="quiet" onClick={() => setSettings(true)}>
              接続設定
            </button>
          </div>
        )}
        {loading && (
          <div className="loading-state" role="status">
            <LoaderCircle className="spin" size={28} />
            <h2>トレースと実測値を取得中</h2>
            <p>該当する全ページと、各トレースの処理を読み込んでいます。</p>
            <button
              className="quiet"
              onClick={() => {
                controller.current?.abort();
                setLoading(false);
              }}
            >
              検索を中止
            </button>
          </div>
        )}
        {!loading && searched && (
          <>
            <div className="results-header">
              <div>
                <span className="eyebrow">SEARCH RESULTS</span>
                <span className="result-count">
                  {traces.length} トレース <span> / </span>
                  {all.length} 処理
                </span>
                {demo && <span className="demo-pill">サンプルデータ</span>}
              </div>
              <span className="result-query" title={resultQuery}>
                {resultQuery}
              </span>
            </div>
            {traces.length > 0 ? (
              <>
                <section
                  className={`error-overview ${errors.length ? "" : "healthy"}`}
                >
                  <div className="error-overview-title">
                    {errors.length ? (
                      <AlertCircle size={19} />
                    ) : (
                      <CircleCheck size={19} />
                    )}
                    <strong>
                      {errors.length
                        ? `${errors.length} 件のエラー`
                        : "記録されたエラーはありません"}
                    </strong>
                    <span>
                      {errors.length
                        ? "選択して、入出力と処理の流れを確認"
                        : "すべての処理から、実測値を確認できます"}
                    </span>
                  </div>
                  {errors.length > 0 && (
                    <div className="error-cards">
                      {errors.map((o, i) => (
                        <button
                          className={`error-card ${selected === o.id ? "selected" : ""}`}
                          key={o.id}
                          onClick={() => {
                            choose(o.id);
                            setCollapsed((c) => ({ ...c, [o.traceId]: false }));
                          }}
                        >
                          <span className="error-number">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div>
                            <strong>{o.name || o.id}</strong>
                            <p>
                              {o.statusMessage || "ERROR として記録された処理"}
                            </p>
                            <small>{o.traceName}</small>
                          </div>
                          <ArrowRight size={16} />
                        </button>
                      ))}
                    </div>
                  )}
                </section>
                <div className={`workspace ${sidebar ? "" : "sidebar-hidden"}`}>
                  <aside className="trace-panel">
                    <div className="panel-heading">
                      <h2>
                        <Layers size={16} />
                        すべての処理
                      </h2>
                      <span className="count-pill">{all.length}</span>
                      <button
                        className="icon"
                        title="処理一覧を隠す"
                        onClick={() => setSidebar(false)}
                      >
                        <PanelLeftClose size={16} />
                      </button>
                    </div>
                    <div className="tree-search">
                      <Search size={14} />
                      <input
                        aria-label="処理・実測値を検索"
                        placeholder="処理名・入出力・実測値を検索"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      />
                      {filter && (
                        <button
                          className="icon tiny"
                          aria-label="処理の検索をクリア"
                          onClick={() => setFilter("")}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    <div className="tree-list">
                      {traces.map((t) => {
                        const rows = ordered(t.observations).filter(
                          (o) =>
                            !filter ||
                            raw(o).toLowerCase().includes(filter.toLowerCase()),
                        );
                        return (
                          <div className="trace-group" key={t.id}>
                            <button
                              className="trace-title"
                              onClick={() =>
                                setCollapsed((c) => ({
                                  ...c,
                                  [t.id]: !c[t.id],
                                }))
                              }
                              aria-expanded={!collapsed[t.id] || !!filter}
                            >
                              {collapsed[t.id] && !filter ? (
                                <ChevronRight size={14} />
                              ) : (
                                <ChevronDown size={14} />
                              )}
                              <div>
                                <strong>{t.name}</strong>
                                <code>{t.id.slice(0, 12)}…</code>
                              </div>
                              <span>{rows.length}</span>
                            </button>
                            {(!collapsed[t.id] || filter) &&
                              rows.map((o) => (
                                <button
                                  key={o.id}
                                  className={`observation-row ${selected === o.id ? "selected" : ""}`}
                                  style={{
                                    paddingLeft: 15 + Math.min(o.depth, 5) * 14,
                                  }}
                                  onClick={() => choose(o.id)}
                                  aria-current={
                                    selected === o.id ? "true" : undefined
                                  }
                                >
                                  <span
                                    className={`status-icon ${o.level === "ERROR" ? "error" : o.level === "WARNING" ? "warning" : ""}`}
                                  >
                                    {o.level === "ERROR" ? (
                                      <AlertCircle size={14} />
                                    ) : o.type === "GENERATION" ? (
                                      <Braces size={14} />
                                    ) : (
                                      <Waypoints size={14} />
                                    )}
                                  </span>
                                  <span
                                    className="observation-name"
                                    title={o.name}
                                  >
                                    {o.name || o.id}
                                  </span>
                                  <span className="row-duration">
                                    {duration(o)}
                                  </span>
                                </button>
                              ))}
                          </div>
                        );
                      })}
                      {filter &&
                        !all.some((o) =>
                          raw(o).toLowerCase().includes(filter.toLowerCase()),
                        ) && (
                          <p className="empty-value">
                            一致する処理はありません。
                          </p>
                        )}
                    </div>
                    <div className="tree-footer">
                      <span className="small-dot green" />
                      エラーの有無にかかわらず全処理を表示
                    </div>
                  </aside>
                  <article className="detail-panel">
                    {active && (
                      <>
                        <div className="detail-heading">
                          <div className="breadcrumb">
                            {!sidebar && (
                              <button
                                className="icon"
                                aria-label="処理一覧を表示"
                                onClick={() => setSidebar(true)}
                              >
                                <PanelLeftOpen size={16} />
                              </button>
                            )}
                            <span>{trace?.name}</span>
                            <ChevronRight size={12} />
                            <span>{active.type}</span>
                            <div className="spacer" />
                            <button
                              className="icon"
                              aria-label="前の処理"
                              disabled={currentIndex <= 0}
                              onClick={() =>
                                choose(siblings[currentIndex - 1].id)
                              }
                            >
                              <ArrowLeft size={15} />
                            </button>
                            <button
                              className="icon"
                              aria-label="次の処理"
                              disabled={currentIndex >= siblings.length - 1}
                              onClick={() =>
                                choose(siblings[currentIndex + 1].id)
                              }
                            >
                              <ArrowRight size={15} />
                            </button>
                          </div>
                          <div className="detail-title">
                            <h2>{active.name || active.id}</h2>
                            <span
                              className={`status-badge ${active.level === "ERROR" ? "error" : active.level === "WARNING" ? "warning" : ""}`}
                            >
                              {active.level || "DEFAULT"}
                            </span>
                          </div>
                          <div className="detail-meta">
                            <span>
                              <Clock3 size={13} />
                              {duration(active)}
                            </span>
                            <span>
                              {active.startTime
                                ? new Date(active.startTime).toLocaleString(
                                    "ja-JP",
                                    { hour12: false },
                                  )
                                : "時刻なし"}
                            </span>
                            <code title={active.id}>{active.id}</code>
                            <CopyButton value={active.id} label="ID" />
                          </div>
                          {active.parentObservationId && (
                            <button
                              className="parent-link"
                              disabled={
                                !all.some(
                                  (o) => o.id === active.parentObservationId,
                                )
                              }
                              onClick={() => choose(active.parentObservationId)}
                            >
                              親の処理:{" "}
                              {all.find(
                                (o) => o.id === active.parentObservationId,
                              )?.name || active.parentObservationId}
                              <ArrowRight size={12} />
                            </button>
                          )}
                        </div>
                        {active.statusMessage && (
                          <div
                            className={`status-message ${active.level === "ERROR" ? "error" : ""}`}
                          >
                            <AlertCircle size={16} />
                            <pre>{active.statusMessage}</pre>
                            <CopyButton value={active.statusMessage} />
                          </div>
                        )}
                        <div
                          className="detail-tabs"
                          role="tablist"
                          aria-label="実測値の項目"
                        >
                          {[
                            ["output", "出力", FileText],
                            ["input", "入力", Terminal],
                            ["metadata", "Metadata", Braces],
                            ["record", "全フィールド", Code2],
                          ].map(([key, title, Icon]) => (
                            <button
                              role="tab"
                              aria-selected={tab === key}
                              key={key}
                              onClick={() => setTab(key)}
                              className={tab === key ? "active" : ""}
                            >
                              <Icon size={15} />
                              {title}
                              {key !== "record" &&
                                active[key] !== undefined && (
                                  <span className="tab-dot" />
                                )}
                            </button>
                          ))}
                        </div>
                        <div role="tabpanel">
                          <ValueViewer
                            key={`${active.id}-${tab}`}
                            value={
                              tab === "record"
                                ? trace.observations.find(
                                    (observation) => observation.id === active.id,
                                  )
                                : active[tab]
                            }
                            label={tab}
                          />
                        </div>
                      </>
                    )}
                  </article>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <Search size={30} />
                <h2>一致するトレースがありません</h2>
                <p>識別子の項目名と値、検索期間を確認してください。</p>
                <button
                  className="quiet"
                  onClick={() => {
                    setDays("30");
                    searchRef.current.focus();
                  }}
                >
                  期間を過去30日間に変更
                  <ArrowRight size={15} />
                </button>
              </div>
            )}
          </>
        )}
        {!loading && !searched && (
          <section className="welcome">
            <div className="welcome-icon">
              <Waypoints size={30} />
            </div>
            <span className="eyebrow">FOLLOW THE TRACE</span>
            <h2>調査の始まりは、ひとつの ID。</h2>
            <p>
              識別子を貼り付けて、関連するトレースを横断検索。
              <br />
              エラーの先にある、実際の入力と出力まで見通せます。
            </p>
            <div className="welcome-steps">
              <div>
                <span>01</span>
                <Search size={20} />
                <strong>識別子で探す</strong>
                <p>セッション・トレース・独自 ID</p>
              </div>
              <ChevronRight size={16} />
              <div>
                <span>02</span>
                <AlertCircle size={20} />
                <strong>エラーを見つける</strong>
                <p>複数トレースの失敗箇所を集約</p>
              </div>
              <ChevronRight size={16} />
              <div>
                <span>03</span>
                <FileText size={20} />
                <strong>実測値を読み解く</strong>
                <p>JSON・Markdown・XML を自在に</p>
              </div>
            </div>
            <button
              className="primary"
              onClick={
                config.configured
                  ? () => searchRef.current.focus()
                  : () => setSettings(true)
              }
            >
              {config.configured ? "識別子を入力する" : "Langfuse に接続する"}
              <ArrowRight size={16} />
            </button>
            <button className="quiet" onClick={loadDemo}>
              サンプルデータで試す
              <ArrowRight size={14} />
            </button>
            {history.length > 0 && (
              <div className="history">
                <span>このセッションの検索</span>
                {history.map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setQuery(q);
                      searchRef.current.focus();
                    }}
                  >
                    <RotateCcw size={13} />
                    {q}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
        <footer className="app-footer">
          <span>
            logperch <span> / </span> 見つける。たどる。理解する。
          </span>
          <span>Langfuse v4 · 読み取り専用</span>
        </footer>
      </main>
      {settings && (
        <Settings
          config={config}
          onClose={() => setSettings(false)}
          onSave={async (draft) => {
            await api("/api/config", draft);
            setConfig(await api("/api/config"));
            setSettings(false);
          }}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
