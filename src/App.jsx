import React, { useState, useEffect, useRef, useCallback } from "react";

// ── BLE UUIDs (matches ESP32 firmware config) ──────────────────────────────
const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const CHAR_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

// ── Helpers ────────────────────────────────────────────────────────────────
const pad  = n => String(n).padStart(2, "0");
const pad4 = n => String(n).padStart(4, "0");
const DAYS_LONG  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAYS_SHORT = ["SUN","MON","TUE","WED","THU","FRI","SAT"];

function getNow() {
  const n = new Date();
  return { date: n, h: n.getHours(), m: n.getMinutes(), s: n.getSeconds(),
           dow: n.getDay(), day: n.getDate(), month: n.getMonth()+1, year: n.getFullYear() };
}

// ── App Modes (mirrors firmware enum) ──────────────────────────────────────
const MODE = {
  CLOCK:            "CLOCK",
  MENU:             "MENU",
  SET_HOUR:         "SET_HOUR",
  SET_MINUTE:       "SET_MINUTE",
  SET_DAY:          "SET_DAY",
  SET_MONTH:        "SET_MONTH",
  SET_YEAR:         "SET_YEAR",
  SET_ALARM_HOUR:   "SET_ALARM_HOUR",
  SET_ALARM_MINUTE: "SET_ALARM_MINUTE",
  SET_ALARM_STATE:  "SET_ALARM_STATE",
  NOTIFICATION:     "NOTIFICATION",
  WEATHER:          "WEATHER",
  ALERTS:           "ALERTS",
};

const MENU_ITEMS = [
  "1. Set Time",
  "2. Set Date",
  "3. Set Alarm",
  "4. Alarm Status",
  "5. Weather Data",
  "6. Push Alert",
  "7. Exit Menu",
];

// ── Design tokens ──────────────────────────────────────────────────────────
const C = {
  bg: "#060b14", card: "rgba(8,18,38,0.95)", border: "rgba(37,99,235,0.18)",
  borderHi: "rgba(37,99,235,0.4)", blue: "#2563eb", blueLight: "#60a5fa",
  blueDim: "#1e3a5f", text: "#e2e8f0", muted: "#475569",
  oledBg: "#000", oledBlue: "#60a5fa", oledDim: "#1d4ed8",
};
const logCol = { info:"#2563eb", success:"#10b981", err:"#f43f5e" };

// ── OLED Screen Component (Matches Premium Watchface) ─────────────────────
function OledScreen({ mode, clock, alarmHour, alarmMinute, alarmActive,
                      editH, editM, editDay, editMonth, editYear,
                      editAlHour, editAlMin, editAlActive,
                      menuCursor, notifyTitle, notifyBody,
                      weather, connected }) {

  const { h, m, s, dow, day, month, year } = clock;
  const Row = ({ children, style }) => (
    <div style={{ display:"flex", alignItems:"center", ...style }}>{children}</div>
  );

  const getMonthAbbrev = (m) => {
    const months = ["", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return months[m] || "ERR";
  };

  const renderContent = () => {
    switch (mode) {

      // ── MODE_CLOCK (Premium Layout Mockup) ───────────────────────────
      case MODE.CLOCK: return (
        <div style={{ display:"flex", flexDirection:"column", height:"100%", justifyContent:"space-between" }}>
          {/* Top Line: Temp & Icon | Status Icons */}
          <Row style={{ justifyContent:"space-between", fontSize:10 }}>
            <span className="oled-glow" style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}>
              {weather.temp ? `${weather.temp}°` : "34°"} ⛈️
            </span>
            <span className="oled-dim" style={{ display: "flex", gap: 5, alignItems: "center" }}>
              {alarmActive && "🔔"} {connected && "[B]"} 🔋{weather.bat ? `${weather.bat}%` : "100%"}
            </span>
          </Row>

          {/* Time Centerpiece (Blinking stationary colon simulated) */}
          <div style={{ textAlign:"center" }}>
            <span className="oled-glow" style={{ fontSize:32, fontWeight:700, letterSpacing:"0.04em", fontFamily: "Space Mono, monospace" }}>
              {pad(h)}{s % 2 === 0 ? ":" : " "}{pad(m)}
            </span>
          </div>

          {/* Footer Row */}
          <Row style={{ justifyContent:"space-between", fontSize:11, fontWeight:700, borderTop: "1px solid rgba(29,78,216,0.15)", paddingTop: 2 }}>
            <span className="oled-glow">{getMonthAbbrev(month)} / {pad(day)}</span>
            <span className="oled-dim" style={{ fontSize: 9 }}>{DAYS_SHORT[dow]}</span>
          </Row>
        </div>
      );

      // ── MODE_NOTIFICATION ────────────────────────────────────────────
      case MODE.NOTIFICATION: return (
        <div style={{ display:"flex", flexDirection:"column", height:"100%", gap:4 }}>
          <span className="oled-glow" style={{ fontSize:11, fontWeight:700, borderBottom:"1px solid #1e3a5f", paddingBottom:3 }}>
            REMOTE NOTIFY
          </span>
          <span className="oled-dim" style={{ fontSize:10 }}>From: {notifyTitle.substring(0,14)}</span>
          <span className="oled-blue" style={{ fontSize:10 }}>{notifyBody.substring(0,20)}</span>
          <span className="oled-dim" style={{ fontSize:9, marginTop:"auto", textAlign:"center" }}>- Press any key to clear -</span>
        </div>
      );

      // ── MODE_MENU ────────────────────────────────────────────────────
      case MODE.MENU: return (
        <div style={{ display:"flex", flexDirection:"column", height:"100%", gap:1 }}>
          <span className="oled-glow" style={{ fontSize:10, fontWeight:700, marginBottom:2 }}>=== MAIN MENU ===</span>
          {MENU_ITEMS.map((item, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:3 }}>
              <span className="oled-glow" style={{ fontSize:9, width:8 }}>{i===menuCursor ? ">" : " "}</span>
              <span className={i===menuCursor ? "oled-glow" : "oled-dim"} style={{ fontSize:9, fontWeight: i===menuCursor ? 700:400 }}>
                {item}
              </span>
            </div>
          ))}
        </div>
      );

      // ── SETTERS ──────────────────────────────────────────────────────
      case MODE.SET_HOUR: return (
        <div style={{ display:"flex", flexDirection:"column", height:"100%", justifyContent:"space-between" }}>
          <span className="oled-dim" style={{ fontSize:10 }}>Set Time: Hour</span>
          <span className="oled-glow" style={{ fontSize:26, fontWeight:700, textAlign:"center" }}>{pad(editH)} : --</span>
          <span className="oled-dim" style={{ fontSize:9, textAlign:"center" }}>▲ UP  ▼ DOWN  ● SELECT</span>
        </div>
      );

      case MODE.SET_MINUTE: return (
        <div style={{ display:"flex", flexDirection:"column", height:"100%", justifyContent:"space-between" }}>
          <span className="oled-dim" style={{ fontSize:10 }}>Set Time: Minute</span>
          <span className="oled-glow" style={{ fontSize:26, fontWeight:700, textAlign:"center" }}>{pad(editH)} : {pad(editM)}</span>
          <span className="oled-dim" style={{ fontSize:9, textAlign:"center" }}>● SELECT to save</span>
        </div>
      );

      case MODE.SET_DAY: return (
        <div style={{ display:"flex", flexDirection:"column", height:"100%", justifyContent:"space-between" }}>
          <span className="oled-dim" style={{ fontSize:10 }}>Set Date: Day</span>
          <span className="oled-glow" style={{ fontSize:26, fontWeight:700, textAlign:"center" }}>{pad(editDay)}/--/--</span>
          <span className="oled-dim" style={{ fontSize:9, textAlign:"center" }}>▲ UP  ▼ DOWN  ● SELECT</span>
        </div>
      );

      case MODE.SET_MONTH: return (
        <div style={{ display:"flex", flexDirection:"column", height:"100%", justifyContent:"space-between" }}>
          <span className="oled-dim" style={{ fontSize:10 }}>Set Date: Month</span>
          <span className="oled-glow" style={{ fontSize:26, fontWeight:700, textAlign:"center" }}>{pad(editDay)}/{pad(editMonth)}/--</span>
          <span className="oled-dim" style={{ fontSize:9, textAlign:"center" }}>● SELECT to continue</span>
        </div>
      );

      case MODE.SET_YEAR: return (
        <div style={{ display:"flex", flexDirection:"column", height:"100%", justifyContent:"space-between" }}>
          <span className="oled-dim" style={{ fontSize:10 }}>Set Date: Year</span>
          <span className="oled-glow" style={{ fontSize:22, fontWeight:700, textAlign:"center" }}>{pad(editDay)}/{pad(editMonth)}/{pad4(editYear)}</span>
          <span className="oled-dim" style={{ fontSize:9, textAlign:"center" }}>● SELECT to save</span>
        </div>
      );

      case MODE.SET_ALARM_HOUR: return (
        <div style={{ display:"flex", flexDirection:"column", height:"100%", justifyContent:"space-between" }}>
          <span className="oled-dim" style={{ fontSize:10 }}>Set Alarm: Hour</span>
          <span className="oled-glow" style={{ fontSize:26, fontWeight:700, textAlign:"center" }}>{pad(editAlHour)} : --</span>
          <span className="oled-dim" style={{ fontSize:9, textAlign:"center" }}>▲ UP  ▼ DOWN  ● SELECT</span>
        </div>
      );

      case MODE.SET_ALARM_MINUTE: return (
        <div style={{ display:"flex", flexDirection:"column", height:"100%", justifyContent:"space-between" }}>
          <span className="oled-dim" style={{ fontSize:10 }}>Set Alarm: Minute</span>
          <span className="oled-glow" style={{ fontSize:26, fontWeight:700, textAlign:"center" }}>{pad(editAlHour)} : {pad(editAlMin)}</span>
          <span className="oled-dim" style={{ fontSize:9, textAlign:"center" }}>● SELECT to save</span>
        </div>
      );

      case MODE.SET_ALARM_STATE: return (
        <div style={{ display:"flex", flexDirection:"column", height:"100%", justifyContent:"space-between" }}>
          <span className="oled-dim" style={{ fontSize:10 }}>Toggle Alarm Status</span>
          <span className="oled-glow" style={{ fontSize:20, fontWeight:700, textAlign:"center" }}>
            {editAlActive ? "[ ACTIVE ]" : "[  OFF   ]"}
          </span>
          <span className="oled-dim" style={{ fontSize:9, textAlign:"center" }}>▲/▼ toggle  ● SELECT to save</span>
        </div>
      );

      default: return <span className="oled-dim" style={{ fontSize:10 }}>--</span>;
    }
  };

  return (
    <div style={{ width:272, height:136, background:C.oledBg, border:"3px solid #1e3a5f", borderRadius:14,
      boxShadow:"0 0 32px rgba(59,130,246,0.12), inset 0 0 24px rgba(0,0,0,0.95)",
      padding:"12px 14px", fontFamily:"Space Mono, monospace", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", inset:0, pointerEvents:"none", borderRadius:11,
        backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(96,165,250,0.012) 2px,rgba(96,165,250,0.012) 4px)" }} />
      <div style={{ height:"100%", position:"relative" }}>
        {renderContent()}
      </div>
    </div>
  );
}

// ── Button Simulation ──────────────────────────────────────────────────────
function HwButton({ label, icon, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex:1, padding:"10px 4px", borderRadius:12, border:"1px solid rgba(37,99,235,0.25)",
      background:"rgba(10,20,40,0.9)", color:C.blueLight, cursor:"pointer",
      fontFamily:"Space Grotesk,sans-serif", fontSize:11, fontWeight:700,
      display:"flex", flexDirection:"column", alignItems:"center", gap:3,
      transition:"all 0.15s",
    }}
    onMouseDown={e => e.currentTarget.style.transform="scale(0.93)"}
    onMouseUp={e => e.currentTarget.style.transform="scale(1)"}
    onTouchStart={e => e.currentTarget.style.transform="scale(0.93)"}
    onTouchEnd={e => e.currentTarget.style.transform="scale(1)"}
    >
      <span style={{ fontSize:16 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [clock, setClock] = useState(getNow());
  const [connected, setConnected]   = useState(false);
  const [connecting, setConnecting] = useState(false);
  const deviceRef = useRef(null);
  const rxRef     = useRef(null);
  const hasBT = typeof navigator !== "undefined" && !!navigator.bluetooth;

  const [mode, setMode]         = useState(MODE.CLOCK);
  const [menuCursor, setMenuCursor] = useState(0);

  const [editH,     setEditH]     = useState(12);
  const [editM,     setEditM]     = useState(0);
  const [editDay,   setEditDay]   = useState(1);
  const [editMonth, setEditMonth] = useState(1);
  const [editYear,  setEditYear]  = useState(2026);
  const [editAlHour,  setEditAlHour]  = useState(7);
  const [editAlMin,   setEditAlMin]   = useState(0);
  const [editAlActive,setEditAlActive]= useState(false);

  const [alarmHour,   setAlarmHour]   = useState(7);
  const [alarmMinute, setAlarmMinute] = useState(0);
  const [alarmActive, setAlarmActive] = useState(false);

  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyBody,  setNotifyBody]  = useState("");
  const notifyTimerRef = useRef(null);

  const [weather, setWeather] = useState({ temp:"34", hum:"65", bat:"100" });
  const [alertTitle, setAlertTitle] = useState("");
  const [alertBody,  setAlertBody]  = useState("");

  const [logs, setLogs] = useState([{ msg:"AK-Band idle. Tap Connect to begin.", type:"info", t:"" }]);
  const logRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setClock(getNow()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (mode === MODE.NOTIFICATION) {
      if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
      notifyTimerRef.current = setTimeout(() => setMode(MODE.CLOCK), 8000);
    }
    return () => { if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current); };
  }, [mode, notifyTitle]);

  function addLog(msg, type = "info") {
    const t = new Date().toLocaleTimeString([], { hour12:false });
    setLogs(p => [...p, { msg, type, t }]);
  }

  async function transmit(payload) {
    if (!rxRef.current) { addLog("Not connected to watch.", "err"); return false; }
    try {
      await rxRef.current.writeValue(new TextEncoder().encode(payload));
      addLog(`TX → ${payload}`, "success");
      return true;
    } catch(e) { addLog(`TX failed: ${e.message}`, "err"); return false; }
  }

  function triggerNotification(title, body) {
    setNotifyTitle(title);
    setNotifyBody(body);
    setMode(MODE.NOTIFICATION);
    addLog(`Notify: [${title}] ${body}`, "info");
  }

  async function syncTime() {
    const n = new Date();
    const payload = `TS:${n.getFullYear()},${pad(n.getMonth()+1)},${pad(n.getDate())},${pad(n.getHours())},${pad(n.getMinutes())},${pad(n.getSeconds())}`;
    addLog("Auto-syncing clock...");
    const ok = await transmit(payload);
    if (ok) triggerNotification("System Sync", "Time & Date Updated!");
  }

  async function handleConnect() {
    if (connected && deviceRef.current) { deviceRef.current.gatt.disconnect(); return; }
    setConnecting(true);
    addLog("Scanning for AK-Band (ESP32-Smartwatch)...");
    try {
      const dev = await navigator.bluetooth.requestDevice({
        filters: [{ name:"ESP32-Smartwatch" }],
        optionalServices: [SERVICE_UUID],
      });
      deviceRef.current = dev;
      addLog(`Found: ${dev.name}. Connecting...`);
      const server  = await dev.gatt.connect();
      const svc     = await server.getPrimaryService(SERVICE_UUID);
      rxRef.current = await svc.getCharacteristic(CHAR_RX_UUID);
      setConnected(true);
      addLog("BLE link established!", "success");
      await syncTime();
      dev.addEventListener("gattserverdisconnected", () => {
        setConnected(false); rxRef.current = null;
        addLog("Watch disconnected.", "err");
      });
    } catch(e) {
      addLog(`Connect failed: ${e.message}`, "err");
    } finally { setConnecting(false); }
  }

  async function fetchWeather() {
    addLog("Detecting location for weather...");
    if (!navigator.geolocation) { addLog("Geolocation unavailable.", "err"); return; }
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const { latitude:lat, longitude:lon } = pos.coords;
        const res  = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m`);
        const data = await res.json();
        const t = Math.round(data.current.temperature_2m);
        const h = data.current.relative_humidity_2m;
        setWeather(w => ({ ...w, temp:String(t), hum:String(h) }));
        addLog(`Weather: ${t}°C, ${h}% RH`, "success");
      } catch(e) { addLog(`Weather fetch failed: ${e.message}`, "err"); }
    }, () => addLog("Location access denied.", "err"));
  }

  const pressUp     = useCallback(() => dispatch("UP"),     [mode, menuCursor, editH, editM, editDay, editMonth, editYear, editAlHour, editAlMin, editAlActive]);
  const pressDown   = useCallback(() => dispatch("DOWN"),   [mode, menuCursor, editH, editM, editDay, editMonth, editYear, editAlHour, editAlMin, editAlActive]);
  const pressSelect = useCallback(() => dispatch("SELECT"), [mode, menuCursor, editH, editM, editDay, editMonth, editYear, editAlHour, editAlMin, editAlActive]);

  function dispatch(btn) {
    const up  = btn === "UP";
    const dn  = btn === "DOWN";
    const sel = btn === "SELECT";

    if (mode === MODE.NOTIFICATION) { setMode(MODE.CLOCK); return; }

    switch(mode) {
      case MODE.CLOCK:
        if (sel) { setMode(MODE.MENU); setMenuCursor(0); }
        break;

      case MODE.MENU:
        if (up)  setMenuCursor(c => (c - 1 + MENU_ITEMS.length) % MENU_ITEMS.length);
        if (dn)  setMenuCursor(c => (c + 1) % MENU_ITEMS.length);
        if (sel) {
          switch(menuCursor) {
            case 0: // Set Time
              setEditH(clock.h); setEditM(clock.m); setMode(MODE.SET_HOUR); break;
            case 1: // Set Date
              setEditDay(clock.day); setEditMonth(clock.month); setEditYear(clock.year); setMode(MODE.SET_DAY); break;
            case 2: // Set Alarm
              setEditAlHour(alarmHour); setEditAlMin(alarmMinute); setMode(MODE.SET_ALARM_HOUR); break;
            case 3: // Alarm Status
              setEditAlActive(alarmActive); setMode(MODE.SET_ALARM_STATE); break;
            case 4: // Weather Data
              setMode(MODE.WEATHER); break;
            case 5: // Push Alert
              setMode(MODE.ALERTS); break;
            case 6: // Exit
              setMode(MODE.CLOCK); break;
          }
        }
        break;

      case MODE.SET_HOUR:
        if (up)  setEditH(h => (h + 1) % 24);
        if (dn)  setEditH(h => (h - 1 + 24) % 24);
        if (sel) setMode(MODE.SET_MINUTE);
        break;

      case MODE.SET_MINUTE:
        if (up)  setEditM(m => (m + 1) % 60);
        if (dn)  setEditM(m => (m - 1 + 60) % 60);
        if (sel) {
          const n = new Date();
          const payload = `TS:${n.getFullYear()},${pad(n.getMonth()+1)},${pad(n.getDate())},${pad(editH)},${pad(editM)},00`;
          transmit(payload);
          addLog(`Time set to ${pad(editH)}:${pad(editM)}`, "success");
          setMode(MODE.CLOCK);
        }
        break;

      case MODE.SET_DAY:
        if (up)  setEditDay(d => (d % 31) + 1);
        if (dn)  setEditDay(d => d === 1 ? 31 : d - 1);
        if (sel) setMode(MODE.SET_MONTH);
        break;

      case MODE.SET_MONTH:
        if (up)  setEditMonth(m => (m % 12) + 1);
        if (dn)  setEditMonth(m => m === 1 ? 12 : m - 1);
        if (sel) setMode(MODE.SET_YEAR);
        break;

      case MODE.SET_YEAR:
        if (up)  setEditYear(y => y + 1);
        if (dn)  setEditYear(y => y - 1);
        if (sel) {
          const n = new Date();
          const payload = `TS:${editYear},${pad(editMonth)},${pad(editDay)},${pad(n.getHours())},${pad(n.getMinutes())},${pad(n.getSeconds())}`;
          transmit(payload);
          addLog(`Date set to ${pad(editDay)}/${pad(editMonth)}/${editYear}`, "success");
          setMode(MODE.CLOCK);
        }
        break;

      case MODE.SET_ALARM_HOUR:
        if (up)  setEditAlHour(h => (h + 1) % 24);
        if (dn)  setEditAlHour(h => (h - 1 + 24) % 24);
        if (sel) setMode(MODE.SET_ALARM_MINUTE);
        break;

      case MODE.SET_ALARM_MINUTE:
        if (up)  setEditAlMin(m => (m + 1) % 60);
        if (dn)  setEditAlMin(m => (m - 1 + 60) % 60);
        if (sel) {
          setAlarmHour(editAlHour); setAlarmMinute(editAlMin); setAlarmActive(true);
          transmit(`AL:${pad(editAlHour)},${pad(editAlMin)},1`);
          setMode(MODE.CLOCK);
        }
        break;

      case MODE.SET_ALARM_STATE:
        if (up || dn) setEditAlActive(a => !a);
        if (sel) {
          setAlarmActive(editAlActive);
          transmit(`AL:${pad(alarmHour)},${pad(alarmMinute)},${editAlActive ? 1 : 0}`);
          setMode(MODE.CLOCK);
        }
        break;
    }
  }

  // ── Sub-panel: Weather ────────────────────────────────────────────────
  const WeatherPanel = () => (
    <div style={panelStyle}>
      <PanelHeader icon="🌤️" title="Weather Data" sub="Pushed to OLED Line 1"
        action={<SmallBtn onClick={fetchWeather}>📍 Auto-Detect</SmallBtn>} />
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12 }}>
        {[
          { label:"Temp",     val:weather.temp, key:"temp", unit:"°C" },
          { label:"Humidity", val:weather.hum,  key:"hum",  unit:"%"  },
          { label:"Battery",  val:weather.bat,  key:"bat",  unit:"%"  },
        ].map(({ label, val, key, unit }) => (
          <div key={key} style={{ background:"rgba(0,0,0,0.4)", border:`1px solid ${C.blueDim}`, borderRadius:12, padding:"10px 8px", textAlign:"center" }}>
            <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4 }}>{label}</div>
            <input type="number" value={val} placeholder="--"
              onChange={e => setWeather(w => ({ ...w, [key]:e.target.value }))}
              style={{ width:"100%", background:"transparent", border:"none", textAlign:"center", color:C.blueLight, fontWeight:700, fontSize:22, fontFamily:"Space Mono,monospace", outline:"none" }} />
            <div style={{ fontSize:9, color:"#334155", marginTop:2 }}>{unit}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <ActionBtn onClick={async () => {
          if (!weather.temp || !weather.hum) { addLog("Fill temp & humidity first.", "err"); return; }
          await transmit(`WX:${weather.temp},${weather.hum},${weather.bat||0}`);
        }}>↑ Push Weather to Watch</ActionBtn>
        <ActionBtn onClick={() => setMode(MODE.CLOCK)} secondary>← Back</ActionBtn>
      </div>
    </div>
  );

  // ── Sub-panel: Push Alerts ────────────────────────────────────────────
  const AlertsPanel = () => (
    <div style={panelStyle}>
      <PanelHeader icon="💬" title="Push Alerts" sub="Send notifications to OLED" />
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
        {[
          { icon:"💬", label:"WhatsApp", sub:"Preset", t:"WhatsApp", b:"Mom: Call me!" },
          { icon:"📞", label:"Phone Call", sub:"Incoming", t:"Call",  b:"Incoming: Dad..." },
        ].map(({ icon, label, sub, t, b }) => (
          <button key={label} onClick={() => { setAlertTitle(t); setAlertBody(b); addLog(`Preset: ${t}`); }}
            style={{ background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderRadius:12, padding:10, textAlign:"left", cursor:"pointer", display:"flex", alignItems:"center", gap:8, fontFamily:"inherit" }}>
            <span style={{ fontSize:18 }}>{icon}</span>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.text }}>{label}</div>
              <div style={{ fontSize:9, color:C.muted }}>{sub}</div>
            </div>
          </button>
        ))}
      </div>
      <div style={{ background:"rgba(0,0,0,0.4)", border:`1px solid ${C.blueDim}`, borderRadius:14, padding:"12px 14px", marginBottom:12 }}>
        <input value={alertTitle} onChange={e => setAlertTitle(e.target.value)} placeholder="Sender / App name"
          style={{ width:"100%", background:"transparent", border:"none", borderBottom:`1px solid ${C.blueDim}`, paddingBottom:8, marginBottom:8, color:C.text, fontSize:12, outline:"none", fontFamily:"inherit" }} />
        <input value={alertBody} onChange={e => setAlertBody(e.target.value)} placeholder="Message content..."
          style={{ width:"100%", background:"transparent", border:"none", color:C.text, fontSize:12, outline:"none", fontFamily:"inherit" }} />
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <ActionBtn onClick={async () => {
          if (!alertTitle || !alertBody) { addLog("Fill title & message.", "err"); return; }
          await transmit(`NT:${alertTitle}|${alertBody}`);
        }}>✈ Push Alert</ActionBtn>
        <ActionBtn onClick={() => setMode(MODE.CLOCK)} secondary>← Back</ActionBtn>
      </div>
    </div>
  );

  const panelStyle = { background:C.card, border:`1px solid ${C.border}`, borderRadius:24, padding:20, display:"flex", flexDirection:"column", gap:0 };

  function PanelHeader({ icon, title, sub, action }) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:12, background:"rgba(29,78,216,0.15)", border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>{icon}</div>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>{title}</div>
            <div style={{ fontSize:10, color:C.muted }}>{sub}</div>
          </div>
        </div>
        {action}
      </div>
    );
  }

  function SmallBtn({ onClick, children }) {
    return (
      <button onClick={onClick} style={{ fontSize:10, fontWeight:700, color:C.blueLight, border:`1px solid ${C.border}`, padding:"5px 10px", borderRadius:8, background:"transparent", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
        {children}
      </button>
    );
  }

  function ActionBtn({ onClick, children, secondary }) {
    return (
      <button onClick={onClick} style={{
        flex: secondary ? "0 0 auto" : 1, padding:"10px 14px", borderRadius:12, border:`1px solid ${C.border}`,
        background: secondary ? "rgba(0,0,0,0.3)" : "rgba(29,78,216,0.15)",
        color: secondary ? C.muted : C.blueLight,
        fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, fontFamily:"inherit",
        transition:"all 0.15s",
      }}>
        {children}
      </button>
    );
  }

  return (
    <div style={{ background:C.bg, fontFamily:"'Space Grotesk','Segoe UI',sans-serif", minHeight:"100vh", color:C.text }}>
      <style>{`
        @import url('[https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Space+Mono:wght@400;700&display=swap](https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Space+Mono:wght@400;700&display=swap)');
        *{box-sizing:border-box;margin:0;padding:0}
        input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none}
        input[type=number]{-moz-appearance:textfield}
        input::placeholder{color:#1e3a5f}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:3px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .ak-pulse{animation:pulse 2s infinite}
        .ak-spin{animation:spin .8s linear infinite;display:inline-block}
        .oled-glow{color:#60a5fa;text-shadow:0 0 10px rgba(96,165,250,.75)}
        .oled-dim{color:#1d4ed8;text-shadow:0 0 5px rgba(29,78,216,.5)}
        .oled-blue{color:#3b82f6}
        button:active{transform:scale(0.95)}
      `}</style>

      {/* Header banner */}
      <header style={{ background:"rgba(6,11,20,0.92)", borderBottom:`1px solid ${C.border}`, backdropFilter:"blur(16px)", position:"sticky", top:0, zIndex:50, padding:"13px 20px" }}>
        <div style={{ maxWidth:480, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:42, height:42, borderRadius:14, background:"linear-gradient(135deg,#1e3a5f,#1d4ed8)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 0 18px rgba(37,99,235,0.25)", flexShrink:0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#fff", lineHeight:1.2 }}>AK-Band</div>
              <div style={{ fontSize:10, color:"rgba(96,165,250,0.55)", textTransform:"uppercase", letterSpacing:"0.14em", fontFamily:"Space Mono" }}>ESP32 Link Controller</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ padding:"5px 12px", borderRadius:999, fontSize:10, fontWeight:700, border:`1px solid ${C.blueDim}`, color:C.blueLight, background:"rgba(29,78,216,0.08)", fontFamily:"Space Mono" }}>
              {mode.replace(/_/g," ")}
            </div>
            <div style={{ padding:"6px 14px", borderRadius:999, fontSize:11, fontWeight:700,
              border:`1px solid ${connected ? "rgba(16,185,129,0.25)" : "rgba(244,63,94,0.25)"}`,
              background:connected ? "rgba(16,185,129,0.08)" : "rgba(244,63,94,0.08)",
              color:connected ? "#34d399" : "#fb7185", display:"flex", alignItems:"center", gap:7 }}>
              <span className={connected ? "" : "ak-pulse"} style={{ width:8, height:8, borderRadius:"50%", background:connected ? "#34d399":"#fb7185", display:"inline-block" }}></span>
              {connected ? "Connected" : "Offline"}
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth:480, margin:"0 auto", padding:"18px 16px 36px", display:"flex", flexDirection:"column", gap:14 }}>

        {!hasBT && (
          <div style={{ background:"rgba(245,158,11,0.07)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:16, padding:"13px 16px", display:"flex", gap:12 }}>
            <span style={{ fontSize:18 }}>⚠️</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:"#fcd34d", marginBottom:4 }}>HTTPS Required</div>
              <div style={{ fontSize:11, color:"#94a3b8", lineHeight:1.5 }}>Web Bluetooth needs HTTPS or localhost. Host on GitHub Pages, Netlify, or Tinyhost.</div>
            </div>
          </div>
        )}

        {/* OLED screen frame card */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:24, padding:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <span style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.15em", color:"rgba(96,165,250,0.4)", fontFamily:"Space Mono" }}>SH1106 OLED · 128×64px</span>
            <span style={{ fontSize:10, color:"#334155", fontFamily:"Space Mono" }}>1.3"</span>
          </div>

          <div style={{ display:"flex", justifyContent:"center", marginBottom:18 }}>
            <OledScreen
              mode={mode} clock={clock}
              alarmHour={alarmHour} alarmMinute={alarmMinute} alarmActive={alarmActive}
              editH={editH} editM={editM}
              editDay={editDay} editMonth={editMonth} editYear={editYear}
              editAlHour={editAlHour} editAlMin={editAlMin} editAlActive={editAlActive}
              menuCursor={menuCursor}
              notifyTitle={notifyTitle} notifyBody={notifyBody}
              weather={weather} connected={connected}
            />
          </div>

          {/* Hardware buttons simulation */}
          {(mode !== MODE.WEATHER && mode !== MODE.ALERTS) && (
            <div>
              <div style={{ textAlign:"center", fontSize:9, color:C.muted, fontFamily:"Space Mono", textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:8 }}>
                Simulate Hardware Buttons
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <HwButton icon="▲" label="UP"     onClick={() => dispatch("UP")} />
                <HwButton icon="▼" label="DOWN"   onClick={() => dispatch("DOWN")} />
                <HwButton icon="●" label="SELECT" onClick={() => dispatch("SELECT")} />
              </div>
            </div>
          )}

          {/* BLE connection handle button */}
          <button onClick={handleConnect} disabled={!hasBT} style={{
            width:"100%", marginTop:14, padding:"13px", borderRadius:16, border:"none",
            cursor:hasBT ? "pointer" : "not-allowed", fontWeight:700, fontSize:13,
            textTransform:"uppercase", letterSpacing:"0.08em", color:"#fff",
            background:connected ? "linear-gradient(135deg,#991b1b,#dc2626)" : "linear-gradient(135deg,#1d4ed8,#2563eb)",
            boxShadow:`0 4px 20px ${connected ? "rgba(220,38,38,0.2)" : "rgba(37,99,235,0.22)"}`,
            display:"flex", alignItems:"center", justifyContent:"center", gap:10,
            opacity:hasBT ? 1 : 0.4, fontFamily:"inherit", transition:"all 0.2s",
          }}>
            {connecting ? <span className="ak-spin">↻</span> : <span>{connected ? "⛔":"⚡"}</span>}
            {connected ? "Disconnect Watch" : connecting ? "Connecting..." : "Connect & Auto-Sync"}
          </button>
        </div>

        {/* Context panel modules */}
        {mode === MODE.WEATHER && <WeatherPanel />}
        {mode === MODE.ALERTS  && <AlertsPanel />}

        {/* Quick shortcuts */}
        {mode === MODE.CLOCK && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <button onClick={() => setMode(MODE.WEATHER)} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:"12px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, fontFamily:"inherit" }}>
              <span style={{ fontSize:20 }}>🌤️</span>
              <div style={{ textAlign:"left" }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#fff" }}>Weather</div>
                <div style={{ fontSize:10, color:C.muted }}>Push to OLED</div>
              </div>
            </button>
            <button onClick={() => setMode(MODE.ALERTS)} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:"12px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, fontFamily:"inherit" }}>
              <span style={{ fontSize:20 }}>💬</span>
              <div style={{ textAlign:"left" }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#fff" }}>Push Alert</div>
                <div style={{ fontSize:10, color:C.muted }}>Send notification</div>
              </div>
            </button>
          </div>
        )}

        {/* Console logger system */}
        <div style={{ background:"rgba(0,0,0,0.65)", border:`1px solid ${C.blueDim}`, borderRadius:16, padding:"13px 15px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <span style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.15em", color:C.blueDim, fontFamily:"Space Mono" }}>System Log</span>
            <button onClick={() => setLogs([{ msg:"Log cleared.", type:"info", t:"" }])} style={{ fontSize:10, color:"#334155", background:"transparent", border:"none", cursor:"pointer" }}>Clear</button>
          </div>
          <div ref={logRef} style={{ height:110, overflowY:"auto", fontFamily:"Space Mono,monospace", fontSize:10, display:"flex", flexDirection:"column", gap:3 }}>
            {logs.map((l, i) => (
              <div key={i} style={{ color:logCol[l.type] }}>
                {l.t && <span style={{ color:"#334155" }}>[{l.t}] </span>}{">"} {l.msg}
              </div>
            ))}
          </div>
        </div>

      </main>

      <footer style={{ textAlign:"center", fontSize:10, color:C.blueDim, paddingBottom:16, fontFamily:"Space Mono", letterSpacing:"0.1em" }}>
        AK-Band Controller © 2026
      </footer>
    </div>
  );
}
