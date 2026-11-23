import React, { useState, useEffect, useCallback, useRef } from "react";
import { Plus, X, Trash2, ChevronLeft, ChevronRight, Users, ClipboardList, RotateCcw, Download, GripVertical, Eye } from "lucide-react";

const COLORS = {
  bg: "#F4F5F1",
  ink: "#1C2321",
  card: "#FFFFFF",
  border: "#DDE1D9",
  borderStrong: "#C7CDC2",
  accent: "#2F6F4E",
  accentSoft: "#E4EFE8",
  amber: "#C97A1A",
  amberSoft: "#FBEEDE",
  amberText: "#7A4A0E",
  slate: "#5B6B84",
  slateSoft: "#E7EBF1",
  slateText: "#3B4657",
  violet: "#6E5A9E",
  violetSoft: "#EBE7F5",
  violetText: "#453A66",
  red: "#B3452F",
  redSoft: "#F8E9E4",
  redText: "#7A2A1C",
  catBlue: "#2F5FA0",
  catBlueSoft: "#E4EBF6",
  catBlueText: "#1E3E6B",
  catTeal: "#1E8A7C",
  catTealSoft: "#E1F1EE",
  catTealText: "#145A51",
  catBrown: "#96652B",
  catBrownSoft: "#F3E9DA",
  catBrownText: "#644419",
  rose: "#B5476D",
  roseSoft: "#F6E5EC",
  roseText: "#7A2F49",
  cyan: "#2E7D96",
  cyanSoft: "#E1EEF2",
  cyanText: "#154655",
  muted: "#6B7267",
};

const STATUS_META = {
  onDuty: { label: "出工", color: COLORS.amber, soft: COLORS.amberSoft, text: COLORS.amberText },
  off: { label: "排休", color: COLORS.slate, soft: COLORS.slateSoft, text: COLORS.slateText },
  holiday: { label: "公休", color: COLORS.violet, soft: COLORS.violetSoft, text: COLORS.violetText },
  injured: { label: "公傷", color: COLORS.red, soft: COLORS.redSoft, text: COLORS.redText },
};

const TEMP_LEAVE_META = { label: "臨請", color: COLORS.cyan, soft: COLORS.cyanSoft, text: COLORS.cyanText };

const LATE_META = { label: "遲到", color: COLORS.rose, soft: COLORS.roseSoft, text: COLORS.roseText };

const CATEGORY_META = {
  regular: { label: "棋傑", color: COLORS.catBlue, soft: COLORS.catBlueSoft, text: COLORS.catBlueText },
  migrant: { label: "移工", color: COLORS.catTeal, soft: COLORS.catTealSoft, text: COLORS.catTealText },
  support: { label: "支援", color: COLORS.catBrown, soft: COLORS.catBrownSoft, text: COLORS.catBrownText },
};

const ROSTER_CATEGORIES = [
  { key: "regular", label: "棋傑" },
  { key: "migrant", label: "移工" },
  { key: "support", label: "支援" },
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDisplayDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"][date.getDay()];
  return { main: `${m}月${d}日`, sub: weekday, compact: `${m}/${d}${weekday}`, iso: key };
}

function addDays(key, delta) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return toDateKey(date);
}

function formatMonthDay(iso) {
  if (!iso) return "未定";
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// Browser-native persistence helpers (localStorage is synchronous; this app
// no longer relies on window.storage, which only exists in the Claude.ai
// preview sandbox and is not available in Vite/Safari/WebView/Capacitor).
function readLocalStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function writeLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

export default function DailyDispatch() {
  const todayKey = toDateKey(new Date());
  const [dateKey, setDateKey] = useState(todayKey);
  const [roster, setRoster] = useState([]);
  const [rosterTab, setRosterTab] = useState("regular");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copiedKind, setCopiedKind] = useState(null);
  const [dayStatus, setStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [newWorker, setNewWorker] = useState("");
  const [exporting, setExporting] = useState(false);
  const [siteTitle, setSiteTitle] = useState("");
  const [dutyPerson, setDutyPerson] = useState("");
  const [lateWorkerIds, setLateWorkerIds] = useState([]);
  const [tempLeaveWorkerIds, setTempLeaveWorkerIds] = useState([]);
  const [halfDay, setHalfDay] = useState({}); // { [workerId]: "amOff" | "pmOff" | "custom:<文字>" }
  const [halfDayMenuFor, setHalfDayMenuFor] = useState(null); // 目前點開選項選單的人員 id
  const [customTimeDraft, setCustomTimeDraft] = useState("");
  const [boardDate, setBoardDate] = useState("");
  const [pourDate, setPourDate] = useState("");
  const [rosterDrag, setRosterDrag] = useState(null);
  const rosterCaptureRef = useRef(null);

  // "已讀取完成" 旗標一律用 useState,不用 useRef —
  // ref 的更新不會等 render,如果拿它跟另一個 state 做時間點比對,
  // 會出現「旗標已經是 true,但資料 state 其實還是舊值」的競態問題。
  const [initialized, setInitialized] = useState(false);

  // 名單裡的人每天預設都是「出工」;當天有標記排休/公休/公傷才改成那個狀態。
  const status = { ...dayStatus };
  roster.forEach((w) => {
    if (!(w.id in status)) status[w.id] = "onDuty";
  });

  const showError = useCallback((msg) => {
    setErrorMsg(msg);
    window.clearTimeout(showError._t);
    showError._t = window.setTimeout(() => setErrorMsg(""), 3000);
  }, []);

  // 出勤相關(誰上工、誰排休...)是「每一天」各自獨立的資料。
  const loadDay = useCallback((key) => {
    try {
      const raw = readLocalStorage(`day:${key}`);
      const parsed = raw
        ? JSON.parse(raw)
        : { status: {}, duty: "", boardDate: "", pourDate: "", lateWorkerIds: [], tempLeaveWorkerIds: [], halfDay: {} };
      let statusVal = parsed.status;
      if (!statusVal && Array.isArray(parsed.onDuty)) {
        statusVal = {};
        parsed.onDuty.forEach((id) => {
          statusVal[id] = "onDuty";
        });
      }
      setStatus(statusVal || {});
      setDutyPerson(parsed.duty || "");
      setBoardDate(parsed.boardDate || "");
      setPourDate(parsed.pourDate || "");
      setLateWorkerIds(Array.isArray(parsed.lateWorkerIds) ? parsed.lateWorkerIds : []);
      setTempLeaveWorkerIds(Array.isArray(parsed.tempLeaveWorkerIds) ? parsed.tempLeaveWorkerIds : []);
      setHalfDay(parsed.halfDay && typeof parsed.halfDay === "object" ? parsed.halfDay : {});
    } catch (e) {
      setStatus({});
      setDutyPerson("");
      setBoardDate("");
      setPourDate("");
      setLateWorkerIds([]);
      setTempLeaveWorkerIds([]);
      setHalfDay({});
    }
  }, []);

  // 注意:依賴陣列裡故意不放 key/dateKey —— overrides.key 只在明確指定時才切換寫入目標,
  // 平常呼叫都是寫回「目前這個 dateKey」,不會因為切換日期的瞬間把資料存錯地方。
  const persistDayState = useCallback(
    (overrides = {}) => {
      const payload = {
        status: overrides.status !== undefined ? overrides.status : dayStatus,
        duty: overrides.duty !== undefined ? overrides.duty : dutyPerson,
        boardDate: overrides.boardDate !== undefined ? overrides.boardDate : boardDate,
        pourDate: overrides.pourDate !== undefined ? overrides.pourDate : pourDate,
        lateWorkerIds: overrides.lateWorkerIds !== undefined ? overrides.lateWorkerIds : lateWorkerIds,
        tempLeaveWorkerIds: overrides.tempLeaveWorkerIds !== undefined ? overrides.tempLeaveWorkerIds : tempLeaveWorkerIds,
        halfDay: overrides.halfDay !== undefined ? overrides.halfDay : halfDay,
      };
      const ok = writeLocalStorage(`day:${overrides.key || dateKey}`, JSON.stringify(payload));
      if (!ok) showError("儲存失敗,請確認瀏覽器儲存空間或隱私模式設定");
    },
    [dateKey, dayStatus, dutyPerson, boardDate, pourDate, lateWorkerIds, tempLeaveWorkerIds, halfDay, showError]
  );

  const persistRoster = useCallback(
    (rosterVal) => {
      const ok = writeLocalStorage("roster", JSON.stringify(rosterVal));
      if (!ok) showError("儲存失敗,請確認瀏覽器儲存空間或隱私模式設定");
    },
    [showError]
  );

  const persistSiteTitle = useCallback(
    (title) => {
      const ok = writeLocalStorage("siteTitle", title);
      if (!ok) showError("儲存失敗,請確認瀏覽器儲存空間或隱私模式設定");
    },
    [showError]
  );

  // 一次性初始化:讀取人員名單、工地名稱(不分日期),並載入「今天」這個日期的出勤資料。
  useEffect(() => {
    setLoading(true);
    try {
      const raw = readLocalStorage("roster");
      const parsedRoster = raw ? JSON.parse(raw) : [];
      setRoster(parsedRoster.map((w) => ({ ...w, category: w.category || "regular" })));
    } catch (e) {
      setRoster([]);
    }
    try {
      const rawTitle = readLocalStorage("siteTitle");
      setSiteTitle(rawTitle || "");
    } catch (e) {
      setSiteTitle("");
    }
    loadDay(todayKey);
    setInitialized(true);
    setLoading(false);
  }, []);

  // 切換日期時只重新讀取當天的「出勤」資料。
  useEffect(() => {
    if (!initialized) return;
    loadDay(dateKey);
  }, [dateKey, initialized, loadDay]);

  function goToDate(delta) {
    setDateKey((k) => addDays(k, delta));
  }

  // 出工人員名單的拖曳排序。
  const rosterDragRef = useRef(null);
  const moveRosterItemRef = useRef(null);

  useEffect(() => {
    rosterDragRef.current = rosterDrag;
  }, [rosterDrag]);

  useEffect(() => {
    function onMove(e) {
      if (!rosterDragRef.current) return;
      const x = e.clientX;
      const y = e.clientY;
      const el = document.elementFromPoint(x, y);
      let overWorkerId = null;
      if (el) {
        const itemEl = el.closest("[data-roster-item]");
        if (itemEl) overWorkerId = itemEl.getAttribute("data-roster-id");
      }
      setRosterDrag((d) => (d ? { ...d, x, y, overWorkerId } : d));
    }
    function onUp() {
      const d = rosterDragRef.current;
      if (d && d.overWorkerId && d.overWorkerId !== d.workerId && moveRosterItemRef.current) {
        moveRosterItemRef.current(d.workerId, d.overWorkerId);
      }
      setRosterDrag(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  function handleRosterDragStart(e, workerId, name) {
    e.preventDefault();
    setRosterDrag({ workerId, name, x: e.clientX, y: e.clientY, overWorkerId: null });
  }

  function moveRosterItem(workerId, targetWorkerId) {
    const sourceIdx = roster.findIndex((w) => w.id === workerId);
    const targetIdxOriginal = roster.findIndex((w) => w.id === targetWorkerId);
    if (sourceIdx === -1 || targetIdxOriginal === -1 || sourceIdx === targetIdxOriginal) return;
    const next = [...roster];
    const [item] = next.splice(sourceIdx, 1);
    // 正確公式:插入位置一律等於「移除前」目標原本所在的索引,不管往前拖或往後拖都適用,
    // 不需要額外判斷方向或 +1 —— 之前的寫法在「往上拖到緊鄰的項目」時會自我抵銷,等於沒動。
    let insertIdx = Math.max(0, Math.min(targetIdxOriginal, next.length));
    next.splice(insertIdx, 0, item);
    setRoster(next);
    persistRoster(next);
  }

  useEffect(() => {
    moveRosterItemRef.current = moveRosterItem;
  });

  function handleBoardDateChange(value) {
    setBoardDate(value);
    persistDayState({ boardDate: value });
  }

  function handlePourDateChange(value) {
    setPourDate(value);
    persistDayState({ pourDate: value });
  }

  function addWorker() {
    const name = newWorker.trim();
    if (!name) return;
    const w = { id: uid(), name, category: rosterTab };
    const next = [...roster, w];
    setRoster(next);
    persistRoster(next);
    setNewWorker("");

    // 新增人員預設為上工
    const nextStatus = { ...dayStatus, [w.id]: "onDuty" };
    setStatus(nextStatus);
    persistDayState({ status: nextStatus });
  }

  function removeWorker(id) {
    const next = roster.filter((w) => w.id !== id);
    setRoster(next);
    persistRoster(next);
    const nextLate = lateWorkerIds.includes(id) ? lateWorkerIds.filter((x) => x !== id) : lateWorkerIds;
    const nextTempLeave = tempLeaveWorkerIds.includes(id) ? tempLeaveWorkerIds.filter((x) => x !== id) : tempLeaveWorkerIds;
    const nextHalfDay = { ...halfDay };
    const hadHalfDay = id in nextHalfDay;
    if (hadHalfDay) delete nextHalfDay[id];
    if (dayStatus[id] || nextLate !== lateWorkerIds || nextTempLeave !== tempLeaveWorkerIds || hadHalfDay) {
      const nextStatus = { ...dayStatus };
      delete nextStatus[id];
      setStatus(nextStatus);
      setLateWorkerIds(nextLate);
      setTempLeaveWorkerIds(nextTempLeave);
      setHalfDay(nextHalfDay);
      persistDayState({
        status: nextStatus,
        lateWorkerIds: nextLate,
        tempLeaveWorkerIds: nextTempLeave,
        halfDay: nextHalfDay,
      });
    }
  }

  function setPersonStatus(id, kind) {
    const nextStatus = { ...dayStatus };
    if (status[id] === kind) {
      delete nextStatus[id];
    } else {
      nextStatus[id] = kind;
    }
    setStatus(nextStatus);
    const effective = nextStatus[id] || "onDuty";
    // 遲到、臨請都只對「今天有上工」的人有意義,狀態一旦不是上工就自動清掉,避免留下互相矛盾的資料。
    let nextLate = lateWorkerIds;
    if (effective !== "onDuty" && lateWorkerIds.includes(id)) {
      nextLate = lateWorkerIds.filter((x) => x !== id);
      setLateWorkerIds(nextLate);
    }
    let nextTempLeave = tempLeaveWorkerIds;
    if (effective !== "onDuty" && tempLeaveWorkerIds.includes(id)) {
      nextTempLeave = tempLeaveWorkerIds.filter((x) => x !== id);
      setTempLeaveWorkerIds(nextTempLeave);
    }
    // 半天(上午休/下午休)是排休的附加選項,狀態一旦不是排休就自動清掉。
    let nextHalfDay = halfDay;
    if (effective !== "off" && id in halfDay) {
      nextHalfDay = { ...halfDay };
      delete nextHalfDay[id];
      setHalfDay(nextHalfDay);
    }
    persistDayState({
      status: nextStatus,
      lateWorkerIds: nextLate,
      tempLeaveWorkerIds: nextTempLeave,
      halfDay: nextHalfDay,
    });
  }

  function setHalfDayOption(id, option) {
    // option: null(全天) | "amOff"(上午休) | "pmOff"(下午休) | "custom:<文字>"(自訂時間)
    const next = { ...halfDay };
    if (!option) {
      delete next[id];
    } else {
      next[id] = option;
    }
    setHalfDay(next);
    persistDayState({ halfDay: next });
    setHalfDayMenuFor(null);
    setCustomTimeDraft("");
  }

  function halfDayLabel(id, variant = "off") {
    const v = halfDay[id];
    if (!v) return null;
    if (v === "amOff") return variant === "tempLeave" ? "上午臨請" : "上午休";
    if (v === "pmOff") return variant === "tempLeave" ? "下午臨請" : "下午休";
    if (v.startsWith("custom:")) return v.slice(7);
    return null;
  }

  function toggleHalfDayMenu(id) {
    if (halfDayMenuFor === id) {
      setHalfDayMenuFor(null);
      setCustomTimeDraft("");
    } else {
      setHalfDayMenuFor(id);
      const current = halfDay[id];
      setCustomTimeDraft(current && current.startsWith("custom:") ? current.slice(7) : "");
    }
  }

  function confirmCustomTime(id) {
    const text = customTimeDraft.trim();
    if (!text) return;
    setHalfDayOption(id, `custom:${text}`);
  }

  function renderHalfDayMenu(id, variant = "off") {
    const optLabels =
      variant === "tempLeave"
        ? [
            { key: null, label: "全天臨請" },
            { key: "amOff", label: "上午臨請" },
            { key: "pmOff", label: "下午臨請" },
          ]
        : [
            { key: null, label: "全天" },
            { key: "amOff", label: "上午休" },
            { key: "pmOff", label: "下午休" },
          ];
    return (
      <div
        style={{
          flexBasis: "100%",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
          padding: "8px 10px",
          background: "#F1F2EE",
          borderRadius: 9,
        }}
      >
        {optLabels.map((opt) => {
          const active = (halfDay[id] || null) === opt.key;
          return (
            <button
              key={opt.label}
              onClick={() => setHalfDayOption(id, opt.key)}
              style={{
                border: `1px solid ${active ? COLORS.slate : COLORS.border}`,
                background: active ? COLORS.slateSoft : "#FFFFFF",
                color: active ? COLORS.slateText : COLORS.muted,
                borderRadius: 7,
                padding: "4px 9px",
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {opt.label}
            </button>
          );
        })}
        <input
          type="text"
          value={customTimeDraft}
          onChange={(e) => setCustomTimeDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirmCustomTime(id)}
          placeholder="自訂時間,如 14:00後"
          style={{
            fontSize: 11.5,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 7,
            padding: "4px 8px",
            width: 118,
            fontFamily: "inherit",
            color: COLORS.ink,
            background: "#FFFFFF",
          }}
        />
        <button
          onClick={() => confirmCustomTime(id)}
          style={{
            border: "none",
            borderRadius: 7,
            padding: "4px 10px",
            fontSize: 11.5,
            fontWeight: 600,
            background: COLORS.slate,
            color: "#FFFFFF",
            cursor: "pointer",
          }}
        >
          確定
        </button>
      </div>
    );
  }

  function addLateWorker(id) {
    if (!id || lateWorkerIds.includes(id)) return;
    const next = [...lateWorkerIds, id];
    setLateWorkerIds(next);
    persistDayState({ lateWorkerIds: next });
  }

  function removeLateWorker(id) {
    const next = lateWorkerIds.filter((x) => x !== id);
    setLateWorkerIds(next);
    persistDayState({ lateWorkerIds: next });
  }

  function addTempLeaveWorker(id) {
    if (!id || tempLeaveWorkerIds.includes(id)) return;
    const next = [...tempLeaveWorkerIds, id];
    setTempLeaveWorkerIds(next);
    persistDayState({ tempLeaveWorkerIds: next });
  }

  function removeTempLeaveWorker(id) {
    const next = tempLeaveWorkerIds.filter((x) => x !== id);
    setTempLeaveWorkerIds(next);
    persistDayState({ tempLeaveWorkerIds: next });
  }

  const handleSaveImage = async (targetRef, fileLabel) => {
    if (!targetRef.current || exporting) return;
    setExporting(true);
    try {
      // 點擊當下才載入 html2canvas,需先在專案執行:npm install html2canvas
      const mod = await import("html2canvas");
      const html2canvas = mod.default || mod;
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      const canvas = await html2canvas(targetRef.current, {
        backgroundColor: COLORS.bg,
        scale: 2,
        useCORS: true,
      });
      const fileName = `${pageHeading ? pageHeading + "-" : ""}${fileLabel}-${dateKey}.png`;

      canvas.toBlob(async (blob) => {
        if (!blob) {
          setExporting(false);
          showError("圖片產生失敗,請再試一次");
          return;
        }
        const file = new File([blob], fileName, { type: "image/png" });

        // 手機上優先用「分享」,可以直接選「儲存影像」存到相簿
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: fileName });
          } catch (e) {
            // 使用者取消分享時也會進到這裡,不用特別提示錯誤
          }
        } else {
          // 不支援分享 API 的環境(例如桌機瀏覽器),退回一般下載
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
        setExporting(false);
      }, "image/png");
    } catch (e) {
      setExporting(false);
      showError("存圖失敗,請確認專案已執行過 npm install html2canvas");
    }
  };

  const offWorkers = roster.filter((w) => status[w.id] === "off");
  // 上工人員 = 全天上工的人 + 任何被標記半天(上午休/下午休/自訂時間)的人(等於另外半天有上班),
  // 但如果是「全天臨請」(臨請清單裡的人、沒有半天標記),代表整天都請假,不算上工。
  const onDutyWorkers = roster.filter((w) => {
    if (tempLeaveWorkerIds.includes(w.id) && !halfDay[w.id]) return false;
    return status[w.id] === "onDuty" || halfDay[w.id];
  });
  const holidayWorkers = roster.filter((w) => status[w.id] === "holiday");
  const injuredWorkers = roster.filter((w) => status[w.id] === "injured");
  const tempLeaveWorkers = roster.filter((w) => tempLeaveWorkerIds.includes(w.id));
  const lateWorkers = roster.filter((w) => lateWorkerIds.includes(w.id));
  const dateDisplay = formatDisplayDate(dateKey);
  const isToday = dateKey === todayKey;

  const sitePrefix = (siteTitle || "").trim();
  const pageHeading = sitePrefix;

  async function handleCopyText(text, kind) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKind(kind);
      window.setTimeout(() => setCopiedKind((k) => (k === kind ? null : k)), 1500);
    } catch (e) {
      showError("複製失敗,請手動選取文字複製");
    }
  }

  function buildRosterSummaryText() {
    const totalByCat = ROSTER_CATEGORIES.map((c) => roster.filter((w) => w.category === c.key).length);
    const onDutyByCat = ROSTER_CATEGORIES.map((c) => onDutyWorkers.filter((w) => w.category === c.key).length);
    const lines = [
      `${dateDisplay.compact} ${pageHeading}`.trim(),
      "",
      `應到:${totalByCat.join("、")}`,
      `實到:${onDutyByCat.join("、")}`,
      "",
    ];
    let any = false;
    lines.push("出工");
    ROSTER_CATEGORIES.forEach((c) => {
      const names = onDutyWorkers
        .filter((w) => w.category === c.key)
        .map((w) => {
          const hl = tempLeaveWorkerIds.includes(w.id) ? halfDayLabel(w.id, "tempLeave") : halfDayLabel(w.id);
          return hl ? `${w.name}(${hl})` : w.name;
        });
      if (names.length > 0) {
        any = true;
        lines.push(names.join("、"));
        lines.push("");
      }
    });
    if (!any) {
      lines.push("今天還沒有人出工");
    }
    lines.push("");
    const nameWithHalf = (w) => { const hl = halfDayLabel(w.id); return hl ? `${w.name}(${hl})` : w.name; };
    const nameWithTempLeave = (w) => { const hl = halfDayLabel(w.id, "tempLeave"); return hl ? `${w.name}(${hl})` : w.name; };
    if (lateWorkers.length) lines.push(`遲到:${lateWorkers.map((w) => w.name).join("、")}`);
    if (tempLeaveWorkers.length) lines.push(`臨請:${tempLeaveWorkers.map(nameWithTempLeave).join("、")}`);
    if (injuredWorkers.length) lines.push(`公傷:${injuredWorkers.map((w) => w.name).join("、")}`);
    if (offWorkers.length) lines.push(`排休:${offWorkers.map(nameWithHalf).join("、")}`);
    if (holidayWorkers.length) lines.push(`公休:${holidayWorkers.map((w) => w.name).join("、")}`);
    return lines.join("\n");
  }

  const rosterTotalByCat = ROSTER_CATEGORIES.map((c) => roster.filter((w) => w.category === c.key).length);
  const rosterOnDutyByCat = ROSTER_CATEGORIES.map((c) => onDutyWorkers.filter((w) => w.category === c.key).length);

  const rosterSummaryContent = (
    <>
      <div style={{ fontSize: 30, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>
        {dateDisplay.compact} {pageHeading}
      </div>
      <div style={{ height: 1, background: COLORS.border, margin: "14px 0 22px" }} />

      <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.ink, marginBottom: 6 }}>
        應到:{rosterTotalByCat.join("、")}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.ink, marginBottom: 18 }}>
        實到:{rosterOnDutyByCat.join("、")}
      </div>

      <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.amberText, marginBottom: 8 }}>出工</div>
      {onDutyWorkers.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 20, marginBottom: 4 }}>今天還沒有人出工</div>
      ) : (
        ROSTER_CATEGORIES.map((c) => {
          const names = onDutyWorkers
            .filter((w) => w.category === c.key)
            .map((w) => {
              const hl = tempLeaveWorkerIds.includes(w.id) ? halfDayLabel(w.id, "tempLeave") : halfDayLabel(w.id);
              return hl ? `${w.name}(${hl})` : w.name;
            });
          if (names.length === 0) return null;
          return (
            <div key={c.key} style={{ fontSize: 20, color: COLORS.ink, marginBottom: 26 }}>
              {names.join("、")}
            </div>
          );
        })
      )}

      {[
        { show: lateWorkers.length > 0, color: COLORS.roseText, label: "遲到", names: lateWorkers.map((w) => w.name).join("、") },
        {
          show: tempLeaveWorkers.length > 0,
          color: COLORS.cyanText,
          label: "臨請",
          names: tempLeaveWorkers
            .map((w) => { const hl = halfDayLabel(w.id, "tempLeave"); return hl ? `${w.name}(${hl})` : w.name; })
            .join("、"),
        },
        { show: injuredWorkers.length > 0, color: COLORS.redText, label: "公傷", names: injuredWorkers.map((w) => w.name).join("、") },
        {
          show: offWorkers.length > 0,
          color: COLORS.slateText,
          label: "排休",
          names: offWorkers
            .map((w) => { const hl = halfDayLabel(w.id); return hl ? `${w.name}(${hl})` : w.name; })
            .join("、"),
        },
        { show: holidayWorkers.length > 0, color: COLORS.violetText, label: "公休", names: holidayWorkers.map((w) => w.name).join("、") },
      ]
        .filter((s) => s.show)
        .map((s, i) => (
          <div key={s.label} style={{ marginTop: i === 0 ? 22 : 8, fontSize: 18, fontWeight: 700, color: s.color }}>
            {s.label}:<span style={{ color: COLORS.muted, fontWeight: 500 }}>{s.names}</span>
          </div>
        ))}
    </>
  );

  return (
    <div
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        background: COLORS.bg,
        color: COLORS.ink,
        minHeight: "100vh",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap');
        .dd-mono { font-family: 'JetBrains Mono', monospace; }
        .dd-scroll::-webkit-scrollbar { display: none; }
        input[type=text]:focus { outline: 2px solid ${COLORS.accent}; outline-offset: 1px; }
        button:focus-visible { outline: 2px solid ${COLORS.accent}; outline-offset: 2px; }
      `}</style>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px 48px" }}>
        {/* Header / date nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            <ClipboardList size={20} color={COLORS.accent} style={{ flexShrink: 0 }} />
            <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", flex: 1, minWidth: 0 }}>
              <input
                type="text"
                value={siteTitle}
                onChange={(e) => setSiteTitle(e.target.value)}
                onBlur={() => persistSiteTitle(siteTitle)}
                placeholder="填工地名稱"
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                  border: "none",
                  background: "none",
                  outline: "none",
                  color: COLORS.ink,
                  padding: 0,
                  width: "100%",
                  fontFamily: "inherit",
                }}
              />
            </div>
          </div>
        </div>

        <div
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 14,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <button
            onClick={() => goToDate(-1)}
            aria-label="前一天"
            style={{ border: "none", background: "none", cursor: "pointer", padding: 6, color: COLORS.muted, display: "flex" }}
          >
            <ChevronLeft size={20} />
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 19, fontWeight: 700 }} className="dd-mono">
              {dateDisplay.main}
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
              {dateDisplay.sub}
              {isToday ? "・今天" : ""}
            </div>
          </div>
          <button
            onClick={() => goToDate(1)}
            aria-label="後一天"
            style={{ border: "none", background: "none", cursor: "pointer", padding: 6, color: COLORS.muted, display: "flex" }}
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {!isToday && (
          <button
            onClick={() => setDateKey(todayKey)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              margin: "-8px auto 16px",
              border: "none",
              background: "none",
              color: COLORS.accent,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              padding: 4,
            }}
          >
            <RotateCcw size={13} /> 回到今天
          </button>
        )}

        {errorMsg && (
          <div
            style={{
              background: COLORS.redSoft,
              color: COLORS.red,
              border: `1px solid ${COLORS.red}33`,
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", color: COLORS.muted, padding: "40px 0", fontSize: 14 }}>載入中…</div>
        ) : (
          <>
            {/* Roster / status card */}
            <section
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                borderLeft: `3px solid ${COLORS.amber}`,
                borderRadius: 12,
                padding: "16px 16px 14px",
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                <Users size={15} color={COLORS.amber} />
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>出工人員</h2>
                <span className="dd-mono" style={{ color: COLORS.muted, fontWeight: 500, fontSize: 12 }}>
                  {roster.length}人
                </span>
              </div>

              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {ROSTER_CATEGORIES.map((c) => {
                  const active = rosterTab === c.key;
                  const count = roster.filter((w) => w.category === c.key).length;
                  return (
                    <button
                      key={c.key}
                      onClick={() => setRosterTab(c.key)}
                      style={{
                        flex: 1,
                        border: `1px solid ${active ? COLORS.amber : COLORS.border}`,
                        background: active ? COLORS.amberSoft : "#FBFBF9",
                        color: active ? COLORS.amberText : COLORS.muted,
                        borderRadius: 8,
                        padding: "7px 4px",
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {c.label} <span className="dd-mono" style={{ fontWeight: 500 }}>{count}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  value={newWorker}
                  onChange={(e) => setNewWorker(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addWorker()}
                  placeholder="新增名字"
                  style={{
                    flex: 1,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 9,
                    padding: "9px 12px",
                    fontSize: 14,
                    fontFamily: "inherit",
                    color: COLORS.ink,
                    background: "#FBFBF9",
                  }}
                />
                <button
                  onClick={addWorker}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    border: "none",
                    borderRadius: 9,
                    padding: "0 14px",
                    background: COLORS.amber,
                    color: "#FFF",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={14} /> 新增
                </button>
              </div>

              {roster.filter((w) => w.category === rosterTab).length === 0 && (
                <p style={{ fontSize: 13, color: COLORS.muted, margin: "0 0 12px" }}>
                  這裡還沒有人員,先新增第一位{ROSTER_CATEGORIES.find((c) => c.key === rosterTab)?.label}吧。
                </p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                {roster
                  .filter((w) => w.category === rosterTab)
                  .map((w) => {
                  const isDropTarget = rosterDrag && rosterDrag.overWorkerId === w.id;
                  const isDraggingThis = rosterDrag && rosterDrag.workerId === w.id;
                  return (
                    <div
                      key={w.id}
                      data-roster-item="1"
                      data-roster-id={w.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 6px 6px 4px",
                        borderRadius: 9,
                        background: isDropTarget ? "#F1F2EE" : "#FBFBF9",
                        border: `1px solid ${isDropTarget ? COLORS.ink : COLORS.border}`,
                        opacity: isDraggingThis ? 0.4 : 1,
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        onPointerDown={(e) => handleRosterDragStart(e, w.id, w.name)}
                        aria-label={`拖曳移動${w.name}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          flex: "1 1 56px",
                          minWidth: 0,
                          cursor: "grab",
                          touchAction: "none",
                        }}
                      >
                        <GripVertical size={14} color={COLORS.muted} style={{ flexShrink: 0 }} />
                        <span
                          style={{
                            fontSize: 13.5,
                            fontWeight: 600,
                            minWidth: 0,
                            color: COLORS.ink,
                            fontFamily: "inherit",
                            userSelect: "none",
                            WebkitUserSelect: "none",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {w.name}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        {Object.entries(STATUS_META).map(([key, meta]) => {
                          const active = status[w.id] === key;
                          return (
                            <button
                              key={key}
                              onClick={() => setPersonStatus(w.id, key)}
                              style={{
                                border: `1px solid ${active ? meta.color : COLORS.border}`,
                                background: active ? meta.soft : "#FFFFFF",
                                color: active ? meta.text : COLORS.muted,
                                borderRadius: 7,
                                padding: "4px 8px",
                                fontSize: 11.5,
                                fontWeight: 600,
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {meta.label}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => removeWorker(w.id)}
                        aria-label={`移除${w.name}`}
                        style={{
                          flexShrink: 0,
                          border: "none",
                          background: "rgba(0,0,0,0.06)",
                          borderRadius: "50%",
                          width: 20,
                          height: 20,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: COLORS.muted,
                          padding: 0,
                        }}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {roster.length > 0 && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { kind: "status", key: "onDuty", list: onDutyWorkers },
                    {
                      kind: "dropdown",
                      dropKey: "late",
                      meta: LATE_META,
                      list: lateWorkers,
                      excludeIds: lateWorkerIds,
                      onAdd: addLateWorker,
                      onRemove: removeLateWorker,
                      addLabel: "+ 選擇遲到人員",
                    },
                    {
                      kind: "dropdown",
                      dropKey: "tempLeave",
                      meta: TEMP_LEAVE_META,
                      list: tempLeaveWorkers,
                      excludeIds: tempLeaveWorkerIds,
                      onAdd: addTempLeaveWorker,
                      onRemove: removeTempLeaveWorker,
                      addLabel: "+ 選擇臨請人員",
                      supportsHalfDay: true,
                    },
                    { kind: "status", key: "injured", list: injuredWorkers },
                    { kind: "status", key: "off", list: offWorkers },
                    { kind: "status", key: "holiday", list: holidayWorkers },
                  ].map((section) => {
                    if (section.kind === "dropdown") {
                      const { dropKey, meta, list, excludeIds, onAdd, onRemove, addLabel, supportsHalfDay } = section;
                      const candidates = onDutyWorkers.filter((w) => !excludeIds.includes(w.id));
                      return (
                        <div key={dropKey}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: meta.text, marginBottom: 6 }}>
                            {meta.label}人員{" "}
                            <span className="dd-mono" style={{ fontWeight: 500, color: COLORS.muted }}>
                              {list.length}人
                            </span>
                          </div>
                          {list.length === 0 ? (
                            <p style={{ fontSize: 12.5, color: COLORS.muted, margin: "0 0 8px" }}>目前沒有人</p>
                          ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                              {list.map((w) => {
                                const chipMeta = CATEGORY_META[w.category] || CATEGORY_META.regular;
                                const hl = supportsHalfDay ? halfDayLabel(w.id, "tempLeave") : null;
                                const menuOpen = supportsHalfDay && halfDayMenuFor === w.id;
                                return (
                                  <React.Fragment key={w.id}>
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 4,
                                        fontSize: 12.5,
                                        fontWeight: 600,
                                        color: chipMeta.text,
                                        background: chipMeta.soft,
                                        borderRadius: 999,
                                        padding: "3px 4px 3px 10px",
                                        border: `1px solid ${menuOpen ? COLORS.slate : "transparent"}`,
                                      }}
                                    >
                                      {supportsHalfDay ? (
                                        <button
                                          onClick={() => toggleHalfDayMenu(w.id)}
                                          style={{ border: "none", background: "none", padding: 0, color: "inherit", cursor: "pointer", fontWeight: 600, fontSize: "inherit" }}
                                        >
                                          {w.name}
                                          {hl && <span style={{ opacity: 0.75 }}>({hl})</span>}
                                        </button>
                                      ) : (
                                        <>{w.name}</>
                                      )}
                                      <button
                                        onClick={() => onRemove(w.id)}
                                        aria-label={`取消${w.name}的${meta.label}標記`}
                                        style={{
                                          border: "none",
                                          background: "rgba(0,0,0,0.1)",
                                          borderRadius: "50%",
                                          width: 15,
                                          height: 15,
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          cursor: "pointer",
                                          color: "inherit",
                                          padding: 0,
                                        }}
                                      >
                                        <X size={9} />
                                      </button>
                                    </span>
                                    {menuOpen && renderHalfDayMenu(w.id, "tempLeave")}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          )}
                          {candidates.length > 0 && (
                            <select
                              value=""
                              onChange={(e) => e.target.value && onAdd(e.target.value)}
                              style={{
                                fontSize: 12.5,
                                fontWeight: 600,
                                color: COLORS.muted,
                                background: "#F1F2EE",
                                border: "none",
                                borderRadius: 999,
                                padding: "4px 10px",
                                fontFamily: "inherit",
                                cursor: "pointer",
                              }}
                            >
                              <option value="">{addLabel}</option>
                              {candidates.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    }

                    const { key, list } = section;
                    const meta = STATUS_META[key];
                    return (
                      <div key={key}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: meta.text, marginBottom: 6 }}>
                          {meta.label}人員 <span className="dd-mono" style={{ fontWeight: 500, color: COLORS.muted }}>{list.length}人</span>
                        </div>
                        {key === "onDuty" && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                            {ROSTER_CATEGORIES.map((c) => {
                              const catMeta = CATEGORY_META[c.key];
                              const count = list.filter((w) => w.category === c.key).length;
                              return (
                                <span
                                  key={c.key}
                                  className="dd-mono"
                                  style={{
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    color: catMeta.text,
                                    background: catMeta.soft,
                                    borderRadius: 999,
                                    padding: "2px 9px",
                                  }}
                                >
                                  {c.label}{count}人
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {list.length === 0 ? (
                          <p style={{ fontSize: 12.5, color: COLORS.muted, margin: 0 }}>目前沒有人</p>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {[...list]
                              .sort((a, b) => {
                                const ai = ROSTER_CATEGORIES.findIndex((c) => c.key === a.category);
                                const bi = ROSTER_CATEGORIES.findIndex((c) => c.key === b.category);
                                return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                              })
                              .map((w) => {
                                const chipMeta = CATEGORY_META[w.category] || CATEGORY_META.regular;
                                const hl =
                                  key === "onDuty" && tempLeaveWorkerIds.includes(w.id)
                                    ? halfDayLabel(w.id, "tempLeave")
                                    : halfDayLabel(w.id);
                                const clickable = key === "off" || key === "holiday" || key === "injured";

                                if (!clickable) {
                                  return (
                                    <span
                                      key={w.id}
                                      style={{
                                        fontSize: 12.5,
                                        fontWeight: 600,
                                        color: chipMeta.text,
                                        background: chipMeta.soft,
                                        borderRadius: 999,
                                        padding: "3px 10px",
                                      }}
                                    >
                                      {w.name}
                                      {hl && <span style={{ opacity: 0.75 }}>({hl})</span>}
                                    </span>
                                  );
                                }

                                const menuOpen = halfDayMenuFor === w.id;
                                return (
                                  <React.Fragment key={w.id}>
                                    <button
                                      onClick={() => toggleHalfDayMenu(w.id)}
                                      style={{
                                        fontSize: 12.5,
                                        fontWeight: 600,
                                        color: chipMeta.text,
                                        background: chipMeta.soft,
                                        borderRadius: 999,
                                        padding: "3px 10px",
                                        border: `1px solid ${menuOpen ? COLORS.slate : "transparent"}`,
                                        cursor: "pointer",
                                      }}
                                    >
                                      {w.name}
                                      {hl && <span style={{ opacity: 0.75 }}>({hl})</span>}
                                    </button>
                                    {menuOpen && renderHalfDayMenu(w.id)}
                                  </React.Fragment>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button
                onClick={() => handleCopyText(buildRosterSummaryText(), "roster")}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 10,
                  padding: "12px 0",
                  background: COLORS.card,
                  color: COLORS.ink,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {copiedKind === "roster" ? "已複製" : "複製"}
              </button>
              <button
                onClick={() => setPreviewOpen(true)}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 10,
                  padding: "12px 0",
                  background: COLORS.card,
                  color: COLORS.ink,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <Eye size={16} />
                預覽
              </button>
              <button
                onClick={() => handleSaveImage(rosterCaptureRef, "出工人員")}
                disabled={exporting}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  border: `1px solid ${COLORS.accent}`,
                  borderRadius: 10,
                  padding: "12px 0",
                  background: exporting ? COLORS.accentSoft : COLORS.card,
                  color: COLORS.accent,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: exporting ? "default" : "pointer",
                }}
              >
                <Download size={16} />
                {exporting ? "產生中…" : "存圖"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* 隱藏的擷取畫面,html2canvas 會截這個區塊來產生存圖,不會顯示給使用者看 */}
      <div
        ref={rosterCaptureRef}
        style={{
          position: "fixed",
          top: 0,
          left: -99999,
          width: 640,
          background: COLORS.bg,
          padding: 32,
          boxSizing: "border-box",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        {rosterSummaryContent}
      </div>

      {previewOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 10000,
            display: "flex",
            justifyContent: "center",
            padding: "24px 12px",
            overflow: "auto",
          }}
          onClick={() => setPreviewOpen(false)}
        >
          <div
            style={{
              position: "relative",
              background: COLORS.bg,
              borderRadius: 12,
              boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
              height: "fit-content",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: 640,
                maxWidth: "88vw",
                padding: 32,
                boxSizing: "border-box",
                fontFamily: "'Inter', system-ui, sans-serif",
              }}
            >
              {rosterSummaryContent}
            </div>
          </div>
          <button
            onClick={() => setPreviewOpen(false)}
            aria-label="關閉預覽,回到原本畫面"
            style={{
              position: "fixed",
              top: 16,
              right: 16,
              zIndex: 10001,
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: COLORS.ink,
              color: "#FFFFFF",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {rosterDrag && (
        <div
          style={{
            position: "fixed",
            left: rosterDrag.x + 10,
            top: rosterDrag.y + 10,
            zIndex: 9999,
            background: COLORS.amberText,
            color: "#FFFFFF",
            fontSize: 12,
            fontWeight: 700,
            padding: "5px 12px",
            borderRadius: 999,
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          {rosterDrag.name}
        </div>
      )}
    </div>
  );
}
