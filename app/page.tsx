// ─────────────────────────────────────────────────────────
// これは「業務アプリの画面」です。宣伝ページ（LP）ではありません。
//
// 顧客ヒアリング管理 ── 顧客ごとの段階・課題・次にやることを1画面で追う
//
// 画面の骨格（この形は崩さない）:
//   左メニュー（.side）＋ 上部バー（.topbar）＋ 本体（.content）
//   一覧 / 新規登録 / 設定 の3画面を view で切り替える
// ─────────────────────────────────────────────────────────
"use client";

import { useEffect, useMemo, useState } from "react";

// ═══════════════════════════════════════════════════════════
//  画面の型 ── ここだけ選び直せば、見た目と並び方が変わります
//  docs/03_spec.md の「0. 画面の型」のとおりに設定しています。
//  ⚠ 新しいCSSは書かない。下の選択肢から選ぶこと。
// ═══════════════════════════════════════════════════════════

/** 色み。業種の空気に合わせる
 *  "pine"   教育・サービス・その他
 *  "indigo" 士業・不動産・BtoB（今回：企業の新規事業部・経営企画部）
 *  "clay"   建設・工務店・現場仕事
 *  "sea"    医療・介護・公共
 *  "wine"   飲食・小売・美容
 */
const TONE = "indigo";

/** 密度。1日に見る件数で決める
 *  "compact" 1日20件以上（多くの行を1画面に）
 *  "normal"  ふつう（今回：同時並行20社前後）
 *  "roomy"   1日5件以下で、1件が重い（ゆったり）
 */
const DENSITY = "normal";

/** 画面の型。3行目「何が一覧で見られると助かるか」で決める
 *  "queue" 待たせているものを、古い順に片づける
 *  "stage" いくつかの段階を順に進んでいく（今回：打診→初回→深掘り→提示→合意）
 *  "due"   期限がある
 */
const LAYOUT: "queue" | "stage" | "due" = "stage";

/** 数え方。件 / 名 / 棟 / 台 / 点 / 本 など、その仕事の言葉で */
const UNIT = "社";

/** 区分の選択肢。LAYOUT が "stage" のときは、これが「段階」になる（順番どおりに並ぶ） */
const CATEGORIES = ["アポ打診中", "初回ヒアリング", "課題を深掘り", "解決策の提示", "検証の合意"];

// ═══════════════════════════════════════════════════════════

/** 1社ぶんのヒアリング記録 */
type Record = {
  id: string;
  name: string;      // 顧客・部署
  category: string;  // いまの段階
  issue: string;     // 聞き取った課題
  note: string;      // 次にやること・仮説
  date: string;      // YYYY-MM-DD（最後に話した日）
  done: boolean;     // 追いかけ終わったか
};

type View = "list" | "new" | "settings";
type Filter = "open" | "done" | "all";

const KEY = "hearing-records";
const NAME_KEY = "hearing-appname";

/** 画面の型ごとの言葉。ここを直せば画面じゅうの文言が揃って変わる */
const TEXT = {
  queue: {
    sub: "未対応のものが、待たせている順に並びます",
    open: "未対応", done: "対応済",
    toTo: "対応済みにする", toBack: "未対応に戻す",
    dateLabel: "受けた日", catLabel: "区分",
    stat2: "3日以上 放置",
    headOpen: "未対応（待たせている順）",
  },
  stage: {
    sub: "どの段階で止まっているかが、段階ごとに分かります",
    open: "追いかけ中", done: "決着済み",
    toTo: "決着済みにする", toBack: "追いかけ中に戻す",
    dateLabel: "最後に話した日", catLabel: "いまの段階",
    stat2: "7日以上 動きなし",
    headOpen: "追いかけ中",
  },
  due: {
    sub: "期限が近い順に並びます",
    open: "未完了", done: "完了",
    toTo: "完了にする", toBack: "未完了に戻す",
    dateLabel: "期限", catLabel: "種別",
    stat2: "期限切れ",
    headOpen: "未完了（期限が近い順）",
  },
}[LAYOUT];

/** n日前の日付。マイナスを渡すとn日後（"due" の見本データで使う） */
const ago = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const today = () => ago(0);

/** 今日との差。0=今日、-3=3日過ぎている、+2=あと2日 */
const diff = (d: string) =>
  Math.round(
    (new Date(d + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime()) / 86400000
  );

/** 何日動きがないか（"queue" / "stage" 用） */
const waiting = (d: string) => Math.max(0, -diff(d));

/**
 * 見本データ。14社（追いかけ中9 / 決着済み5）。
 * ⚠ 実在の人名・会社名・連絡先は使わない。
 */
const SAMPLE: Record[] = [
  { id: "s01", name: "北山フーズ 経営企画部",       category: "アポ打診中",     issue: "工場ごとに原価の出し方が違うらしい",       note: "紹介元に、担当者へつないでもらえないか依頼する",     date: ago(0),  done: false },
  { id: "s02", name: "サンリード物流 事業開発課",   category: "アポ打診中",     issue: "配車の割り当てが特定の1人の頭の中にある",  note: "来週の展示会で顔を合わせるので、その場で打診する",   date: ago(2),  done: false },
  { id: "s03", name: "みどり電機 生産技術部",       category: "初回ヒアリング", issue: "設備の点検記録が紙で、探すのに時間がかかる", note: "実際の点検表を見せてもらう。次回は9/1",              date: ago(1),  done: false },
  { id: "s04", name: "東和セラミック 管理本部",     category: "初回ヒアリング", issue: "月次の集計を経理が手作業で3日かけている",   note: "「3日」の内訳を作業ごとに分解して聞く",              date: ago(4),  done: false },
  { id: "s05", name: "あさひ工機 製造二部",         category: "課題を深掘り",   issue: "不良の原因を後から追えず、同じ手直しが再発", note: "直近3件の手直し伝票を見せてもらう約束",             date: ago(6),  done: false },
  { id: "s06", name: "新見コーポレーション 新規事業室", category: "課題を深掘り", issue: "他社事例を集めても自社に当てはめられない",   note: "本当の困りごとは別にありそう。もう一度聞き直す",     date: ago(9),  done: false },
  { id: "s07", name: "カワセ紙業 業務改革チーム",   category: "解決策の提示",   issue: "受注の変更連絡が電話とFAXに分かれている",   note: "画面の叩き台を見せて、要らない項目を削ってもらう",   date: ago(3),  done: false },
  { id: "s08", name: "大石建材 営業管理部",         category: "解決策の提示",   issue: "見積の履歴が担当者ごとのExcelに散っている",  note: "現場の2名にも見てもらえないか打診中。返事待ち",     date: ago(11), done: false },
  { id: "s09", name: "ユキノ精密 品質保証部",       category: "検証の合意",     issue: "検査結果の転記ミスが月に数件出ている",       note: "1ラインだけで2週間試す方向。開始日を詰める",         date: ago(5),  done: false },
  { id: "s10", name: "立花ケミカル 総務部",         category: "課題を深掘り",   issue: "備品の発注が部署ごとにバラバラ",             note: "困ってはいるが優先度が低いとのこと。一旦ここまで",   date: ago(13), done: true },
  { id: "s11", name: "三雲リネン 店舗運営部",       category: "解決策の提示",   issue: "店舗からの在庫問い合わせが毎日20件ほど",     note: "既存システムの改修で対応することになった",           date: ago(15), done: true },
  { id: "s12", name: "白樺ハウジング 営業企画部",   category: "検証の合意",     issue: "追客のタイミングが担当者の記憶頼り",         note: "試用を開始。9月末に結果を振り返る",                 date: ago(17), done: true },
  { id: "s13", name: "コトブキ産業 情報システム課", category: "初回ヒアリング", issue: "情シスが1人で、新しい仕組みを入れる余力がない", note: "導入の担い手がいない。今回は見送り",              date: ago(19), done: true },
  { id: "s14", name: "南野モータース サービス部",   category: "検証の合意",     issue: "整備の予約が電話のみで、二重予約が起きる",   note: "2店舗で試用開始。次は運用の負担を確認する",         date: ago(21), done: true },
];

/** 一覧をどう束ねるか。LAYOUT ごとに変わる */
type Group = { key: string; label: string; mark?: "late" | "now"; items: Record[] };

function grouped(list: Record[], filter: Filter): Group[] {
  const head = filter === "open" ? TEXT.headOpen : filter === "done" ? TEXT.done : "すべて";

  if (LAYOUT === "stage" && filter === "open") {
    // 段階ごとに束ねる。CATEGORIES の順に並べ、中身が無い段階は出さない
    return CATEGORIES.map((c) => ({
      key: c,
      label: c,
      mark: undefined,
      items: list.filter((i) => i.category === c),
    })).filter((g) => g.items.length > 0);
  }

  if (LAYOUT === "due" && filter === "open") {
    const buckets: Group[] = [
      { key: "late",  label: "期限が過ぎている", mark: "late", items: [] },
      { key: "now",   label: "今日・明日",       mark: "now",  items: [] },
      { key: "week",  label: "今週のうち",                     items: [] },
      { key: "later", label: "それ以降",                       items: [] },
    ];
    list.forEach((i) => {
      const d = diff(i.date);
      if (d < 0) buckets[0].items.push(i);
      else if (d <= 1) buckets[1].items.push(i);
      else if (d <= 7) buckets[2].items.push(i);
      else buckets[3].items.push(i);
    });
    return buckets.filter((b) => b.items.length > 0);
  }

  return [{ key: "all", label: head, items: list }];
}

/** 行の右に出す小さなバッジ。LAYOUT ごとに意味が変わる */
function rowBadge(r: Record): { text: string; kind: "warn" | "danger" } | null {
  if (r.done) return null;
  if (LAYOUT === "due") {
    const d = diff(r.date);
    if (d < 0) return { text: `${-d}日 超過`, kind: "danger" };
    if (d === 0) return { text: "今日", kind: "warn" };
    return null;
  }
  const w = waiting(r.date);
  const limit = LAYOUT === "stage" ? 7 : 3;
  return w >= limit ? { text: `${w}日`, kind: "warn" } : null;
}

export default function Home() {
  const [items, setItems] = useState<Record[]>([]);
  const [appName, setAppName] = useState("顧客ヒアリング管理");
  const [loaded, setLoaded] = useState(false);

  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Record | null>(null);

  const [form, setForm] = useState({
    name: "",
    category: CATEGORIES[0],
    issue: "",
    note: "",
    date: today(),
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setItems(raw ? (JSON.parse(raw) as Record[]) : SAMPLE);
      const n = localStorage.getItem(NAME_KEY);
      if (n) setAppName(n);
    } catch {
      setItems(SAMPLE);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(KEY, JSON.stringify(items));
    localStorage.setItem(NAME_KEY, appName);
  }, [items, appName, loaded]);

  // 見本データのまま触っていない状態か（1件でも足す・消すと false になる）
  const isSample = items.length === SAMPLE.length && items.every((i) => i.id.startsWith("s"));

  const counts = useMemo(
    () => ({
      open: items.filter((i) => !i.done).length,
      done: items.filter((i) => i.done).length,
      all: items.length,
    }),
    [items]
  );

  /** 2つ目の統計。LAYOUT で意味が変わる */
  const attention = useMemo(() => {
    const open = items.filter((i) => !i.done);
    if (LAYOUT === "due") return open.filter((i) => diff(i.date) < 0).length;
    const limit = LAYOUT === "stage" ? 7 : 3;
    return open.filter((i) => waiting(i.date) >= limit).length;
  }, [items]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return items
      .filter((i) => (filter === "all" ? true : filter === "open" ? !i.done : i.done))
      .filter((i) => !k || (i.name + i.issue + i.note + i.category).toLowerCase().includes(k))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [items, filter, q]);

  const groups = useMemo(() => grouped(shown, filter), [shown, filter]);

  function resetForm() {
    setForm({ name: "", category: CATEGORIES[0], issue: "", note: "", date: today() });
    setEditing(null);
  }

  function save() {
    const name = form.name.trim();
    if (!name) return;
    if (editing) {
      setItems(items.map((i) => (i.id === editing.id ? { ...i, ...form, name } : i)));
    } else {
      setItems([...items, { id: String(Date.now()), ...form, name, done: false }]);
    }
    resetForm();
    setView("list");
  }

  function startEdit(r: Record) {
    setEditing(r);
    setForm({ name: r.name, category: r.category, issue: r.issue ?? "", note: r.note, date: r.date });
    setView("new");
  }

  const toggle = (id: string) => setItems(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const remove = (id: string) => setItems(items.filter((i) => i.id !== id));

  const NAV: { k: View; label: string; count?: number }[] = [
    { k: "list", label: "一覧", count: counts.open },
    { k: "new", label: "新規登録" },
    { k: "settings", label: "設定" },
  ];

  const titles: { [K in View]: [string, string] } = {
    list: ["一覧", TEXT.sub],
    new: [editing ? "編集" : "新規登録", "入力して保存すると、その段階の一覧に並びます"],
    settings: ["設定", "表示名の変更と、データの初期化"],
  };

  return (
    <div className="shell" data-tone={TONE} data-density={DENSITY}>
      {/* ───────── 左メニュー ───────── */}
      <nav className="side">
        <div className="side-brand">
          <div className="n">{appName}</div>
          <div className="s">この端末に保存</div>
        </div>
        <div className="side-label">メニュー</div>
        <div className="side-nav">
          {NAV.map((n) => (
            <button
              key={n.k}
              className="side-item"
              aria-current={view === n.k ? "page" : undefined}
              onClick={() => { if (n.k !== "new") resetForm(); setView(n.k); }}
            >
              {n.label}
              {typeof n.count === "number" && <span className="c">{n.count}</span>}
            </button>
          ))}
        </div>
        <div className="side-foot">ヒアリングの記録は、このブラウザにだけ残ります</div>
      </nav>

      {/* ───────── 本体 ───────── */}
      <div className="main">
        <header className="topbar">
          <span className="t">{titles[view][0]}</span>
          <span className="d">{titles[view][1]}</span>
          {view === "list" && (
            <span className="right">
              <button className="btn" onClick={() => { resetForm(); setView("new"); }}>新規登録</button>
            </span>
          )}
        </header>

        <div className="content">
          {/* ── 一覧 ── */}
          {view === "list" && (
            <>
              {isSample && (
                <div className="notice">
                  表示中のデータは<b>見本</b>です。そのまま触って試せます。
                  消したいときは、左メニューの<b>設定</b>から。
                </div>
              )}

              <div className="stats">
                <div className="stat"><div className="n accent">{counts.open}</div><div className="l">{TEXT.open}</div></div>
                <div className="stat"><div className="n">{attention}</div><div className="l">{TEXT.stat2}</div></div>
                <div className="stat"><div className="n">{counts.all}</div><div className="l">全{UNIT}</div></div>
              </div>

              <div className="filters">
                <div className="search">
                  <input className="field" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="顧客名・課題・次にやることで検索" />
                </div>
                <div className="seg">
                  {(["open", "done", "all"] as Filter[]).map((f) => (
                    <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                      {f === "open" ? `${TEXT.open} ${counts.open}`
                        : f === "done" ? `${TEXT.done} ${counts.done}`
                        : `全部 ${counts.all}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="list">
                {shown.length === 0 ? (
                  <>
                    <div className="list-head">
                      {filter === "open" ? TEXT.headOpen : filter === "done" ? TEXT.done : "すべて"}
                      <span className="count">0 {UNIT}</span>
                    </div>
                    <div className="empty">
                      <div className="t">{q ? "見つかりませんでした" : "ここに表示する顧客がいません"}</div>
                      <div className="d">
                        {q ? "検索の言葉を変えてみてください。" : "右上の「新規登録」から、話を聞いた顧客を追加できます。"}
                      </div>
                    </div>
                  </>
                ) : (
                  groups.map((g) => (
                    <div key={g.key}>
                      <div className={"group-head" + (g.mark ? ` is-${g.mark}` : "")}>
                        {g.mark && <span className="dot" />}
                        {g.label}
                        <span className="count">{g.items.length} {UNIT}</span>
                      </div>
                      {g.items.map((r) => {
                        const b = rowBadge(r);
                        return (
                          <div className="row" key={r.id}>
                            <div className="row-main">
                              <div className="row-title">{r.name}</div>
                              {r.issue && <div className="row-sub">課題: {r.issue}</div>}
                              {r.note && <div className="row-sub">次: {r.note}</div>}
                            </div>
                            <div className="row-meta">
                              {b && <span className={`badge badge-${b.kind}`}>{b.text}</span>}
                              {!(LAYOUT === "stage" && filter === "open") && (
                                <span className="badge">{r.category}</span>
                              )}
                              <span className="row-time">{r.date.slice(5).replace("-", "/")}</span>
                              <button className="btn-ghost" onClick={() => startEdit(r)}>編集</button>
                              <button className="btn-ghost" onClick={() => toggle(r.id)}>
                                {r.done ? TEXT.toBack : TEXT.toTo}
                              </button>
                              <button className="btn-ghost danger-btn" onClick={() => remove(r.id)}>削除</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
              <p className="note">データはこの端末のブラウザにだけ保存されます。外部には送信されません。</p>
            </>
          )}

          {/* ── 新規登録・編集 ── */}
          {view === "new" && (
            <div className="panel">
              <div className="form-row">
                <label className="label" htmlFor="f-name">顧客・部署<span className="req">必須</span></label>
                <input id="f-name" className="field" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                  placeholder="例：北山フーズ 経営企画部" />
                <span className="hint">あとで見て、どこの誰か分かる書き方にします</span>
              </div>

              <div className="form-row">
                <div className="inline">
                  <div>
                    <label className="label" htmlFor="f-cat">{TEXT.catLabel}</label>
                    <select id="f-cat" className="select" value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="f-date">{TEXT.dateLabel}</label>
                    <input id="f-date" className="field" type="date" value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="form-row">
                <label className="label" htmlFor="f-issue">聞き取った課題</label>
                <textarea id="f-issue" className="field" value={form.issue}
                  onChange={(e) => setForm({ ...form, issue: e.target.value })}
                  placeholder="相手が言ったことをそのまま。例：月次の集計を経理が手作業で3日かけている" />
                <span className="hint">解釈を足さず、聞いた言葉のまま書くと、あとで読み返せます</span>
              </div>

              <div className="form-row">
                <label className="label" htmlFor="f-note">次にやること・仮説</label>
                <textarea id="f-note" className="field" value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="例：「3日」の内訳を作業ごとに分解して聞く" />
              </div>

              <div className="form-actions">
                <button className="btn" onClick={save} disabled={!form.name.trim()}>
                  {editing ? "保存する" : "一覧に追加"}
                </button>
                <button className="btn-ghost" onClick={() => { resetForm(); setView("list"); }}>やめる</button>
                <span className="spacer" />
                {editing && (
                  <button className="btn-ghost danger-btn"
                    onClick={() => { remove(editing.id); resetForm(); setView("list"); }}>
                    この1{UNIT}を削除
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── 設定 ── */}
          {view === "settings" && (
            <div className="panel">
              <div className="form-row">
                <label className="label" htmlFor="f-app">画面の表示名</label>
                <input id="f-app" className="field" value={appName}
                  onChange={(e) => setAppName(e.target.value)} />
                <span className="hint">左上に表示されます。変えるとすぐ反映されます</span>
              </div>

              <div className="form-row">
                <label className="label">データ</label>
                <div className="inline">
                  <button className="btn-ghost" onClick={() => setItems(SAMPLE)}>見本データを入れ直す</button>
                  <button className="btn-ghost danger-btn"
                    onClick={() => { if (confirm("全部消します。よろしいですか？")) setItems([]); }}>
                    全部消す
                  </button>
                </div>
                <span className="hint">
                  現在 {counts.all} {UNIT}（{TEXT.open} {counts.open} / {TEXT.done} {counts.done}）
                </span>
              </div>

              <p className="note">
                データはこの端末のブラウザにだけ保存されます。
                別の端末や他の人とは共有されません（共有は第3回で扱います）。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
