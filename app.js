/* Tablero ValClabs — app principal */
(function () {
  const store = window.TableroStore;
  const cfg = window.TABLERO_CONFIG || {};
  const $app = document.getElementById("app");
  const $modal = document.getElementById("modal-root");
  const $toast = document.getElementById("toast-root");

  const STATUSES = [
    { id: "pendiente", label: "Por hacer", color: "#9575cd" },
    { id: "en_progreso", label: "En progreso", color: "#5e35b1" },
    { id: "revision", label: "En revisión", color: "#dc0c89" },
    { id: "hecho", label: "Hecho", color: "#2e8b62" }
  ];
  const PRIOS = { alta: "Alta", media: "Media", baja: "Baja" };
  const PALETTE = ["#5e35b1", "#dc0c89", "#9575cd", "#2d1b69", "#e07b00", "#1e88e5", "#2e8b62", "#c2185b"];

  const S = {
    members: [], projects: [], tasks: [], notes: [], notifications: [],
    me: null, user: null,
    view: lsGet("view") || "board",
    filters: Object.assign({ member: "", project: "", priority: "", day: "", date: "", q: "" }, lsGetJSON("filters") || {}),
    filtersOpen: false, notifOpen: false
  };
  let modalFiles = [], removedFiles = []; // adjuntos del formulario abierto
  let seenNotifs = null; // ids ya vistos (para avisar solo de los nuevos)

  // ---------------- utilidades ----------------
  function lsGet(k) { try { return localStorage.getItem("tvc_" + k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem("tvc_" + k, v); } catch (e) {} }
  function lsGetJSON(k) { try { return JSON.parse(lsGet(k)); } catch (e) { return null; } }
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const byId = (arr, id) => arr.find(x => x.id === id);
  const member = id => byId(S.members, id);
  const project = id => byId(S.projects, id);
  function dayStr(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  const today = () => dayStr(new Date());
  function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return dayStr(d); }
  function fmtDay(s) {
    if (!s) return "";
    if (s === today()) return "Hoy";
    if (s === addDays(1)) return "Mañana";
    if (s === addDays(-1)) return "Ayer";
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es", { day: "numeric", month: "short", year: y !== new Date().getFullYear() ? "numeric" : undefined });
  }
  function daysUntil(s) { const [y, m, d] = s.split("-").map(Number); const n = new Date(); return Math.round((new Date(y, m - 1, d) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000); }
  function fmtDateTime(iso) { return new Date(iso).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  function timeAgo(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return "ahora";
    if (s < 3600) return "hace " + Math.floor(s / 60) + " min";
    if (s < 86400) return "hace " + Math.floor(s / 3600) + " h";
    return fmtDateTime(iso);
  }
  function toLocalInput(iso) { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
  function initials(name) { return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(""); }
  function avatar(m, cls) {
    if (!m) return `<span class="avatar empty ${cls || ""}" title="Sin asignar">?</span>`;
    return `<span class="avatar ${cls || ""}" style="background:${esc(m.color || "#5e35b1")}" title="${esc(m.name)}">${esc(initials(m.name))}</span>`;
  }
  function toast(msg) {
    const el = document.createElement("div"); el.className = "toast"; el.textContent = msg;
    $toast.appendChild(el); setTimeout(() => el.remove(), 2800);
  }
  function err(e) { console.error(e); toast("Error: " + (e && e.message ? e.message : e)); }
  const icon = {
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    filter: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg>'
  };

  function fmtSize(b) { return b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(0) + " KB" : (b / 1048576).toFixed(1) + " MB"; }
  function fileIcon(t) { t = t || ""; return t.startsWith("image/") ? "🖼️" : t.includes("pdf") ? "📄" : t.startsWith("video/") ? "🎬" : t.startsWith("audio/") ? "🎵" : /sheet|excel|csv/.test(t) ? "📊" : /word|document/.test(t) ? "📝" : "📎"; }
  function attachmentsField() {
    return `<div class="field full"><label>Archivos</label>
      <div class="att-list" id="att-list"></div>
      <label class="att-drop"><input type="file" multiple data-upload hidden />📎 Subir archivos <span>(fotos, PDF, documentos…)</span></label></div>`;
  }
  function renderAttList() {
    const el = document.getElementById("att-list");
    if (!el) return;
    el.innerHTML = modalFiles.map((f, i) => `<div class="att ${f.uploading ? "loading" : ""}">
      <span class="att-ic">${fileIcon(f.type)}</span>
      <button type="button" class="att-name" data-act="att-open" data-i="${i}" ${f.uploading ? "disabled" : ""}>${esc(f.name)}</button>
      <span class="att-size">${f.uploading ? "Subiendo…" : fmtSize(f.size || 0)}</span>
      ${f.uploading ? "" : `<button type="button" class="att-x" data-act="att-remove" data-i="${i}" title="Quitar">×</button>`}
    </div>`).join("");
  }
  async function handleUpload(input) {
    const files = [...input.files]; input.value = "";
    for (const file of files) {
      const temp = { name: file.name, size: file.size, type: file.type, uploading: true };
      modalFiles.push(temp); renderAttList();
      try { Object.assign(temp, await store.uploadFile(file)); delete temp.uploading; }
      catch (e) { modalFiles = modalFiles.filter(x => x !== temp); err(e); }
      renderAttList();
    }
  }
  async function openAttachment(att) {
    const w = window.open("", "_blank");
    try {
      const url = await store.fileUrl(att);
      if (url.startsWith("data:")) { // modo local: descargar
        if (w) w.close();
        const a = document.createElement("a"); a.href = url; a.download = att.name; a.click();
      } else if (w) w.location = url; else location.href = url;
    } catch (e) { if (w) w.close(); err(e); }
  }
  const cleanFiles = () => modalFiles.filter(f => !f.uploading).map(({ uploading, ...f }) => f);
  async function purgeRemoved() { for (const f of removedFiles) { try { await store.deleteFile(f); } catch (e) {} } removedFiles = []; }

  // ---------------- instalar como app ----------------
  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; if (S.me) render(); });
  window.addEventListener("appinstalled", () => { installPrompt = null; toast("¡App instalada! 🚀"); render(); });
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isMobile = () => isIOS() || /android/i.test(navigator.userAgent);
  async function installApp() {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      installPrompt = null;
      if (outcome !== "accepted") toast("Puedes instalarla cuando quieras desde «Instalar app»");
      return render();
    }
    const ios = isIOS(), android = /android/i.test(navigator.userAgent);
    const inSafari = ios && !/crios|fxios|edgios/i.test(navigator.userAgent);
    openModal(`<h2>📲 Instalar el tablero<button type="button" class="close" data-act="close-modal">×</button></h2>
      <div class="install-steps">
        ${ios ? `${inSafari ? "" : `<p class="install-warn">En iPhone hay que abrir este enlace en <b>Safari</b> para poder instalarlo.</p>`}
          <ol><li>Toca el botón <b>Compartir</b> <span class="kbd">⬆︎</span> (abajo en el centro, o arriba a la derecha en iPad).</li>
          <li>Desliza y elige <b>«Agregar a pantalla de inicio»</b>.</li>
          <li>Toca <b>Agregar</b>. Aparecerá el ícono del cohete 🚀.</li>
          <li>Abre el tablero <b>desde ese ícono</b> y ve a <b>Equipo → Activar notificaciones</b>.</li></ol>`
        : android ? `<ol><li>Toca el menú <span class="kbd">⋮</span> de Chrome (arriba a la derecha).</li>
          <li>Elige <b>«Instalar app»</b> o <b>«Agregar a pantalla principal»</b>.</li>
          <li>Confirma con <b>Instalar</b>. Aparecerá el ícono del cohete 🚀.</li>
          <li>Abre el tablero desde el ícono y activa las notificaciones en <b>Equipo</b>.</li></ol>`
        : `<ol><li>En Chrome o Edge, busca el ícono de instalar <span class="kbd">⊕</span> a la derecha de la barra de direcciones.</li>
          <li>Haz clic en <b>Instalar</b>. El tablero se abrirá en su propia ventana.</li></ol>
          <p class="hint">En el celular: abre <b>${esc(location.href.split("#")[0])}</b> y vuelve a tocar «Instalar app».</p>`}
      </div>
      <div class="modal-actions"><span class="right"><button type="button" class="btn btn-primary" data-act="close-modal">Entendido</button></span></div>`);
  }
  function installBanner() {
    if (isStandalone() || !isMobile() || lsGet("install_dismissed")) return "";
    return `<div class="install-banner"><img src="assets/icon-192.png" alt="" /><div><b>Instala el tablero</b><span>Ábrelo como app y recibe avisos</span></div>
      <button class="btn btn-accent" data-act="install">Instalar</button><button class="install-x" data-act="install-dismiss" aria-label="Cerrar">×</button></div>`;
  }

  // ---------------- datos ----------------
  async function loadAll() {
    const [members, projects, tasks, notes, notifications] = await Promise.all(
      ["members", "projects", "tasks", "notes", "notifications"].map(t => store.all(t))
    );
    Object.assign(S, { members, projects, tasks, notes, notifications });
  }
  async function reload(table) {
    try {
      if (table) S[table] = await store.all(table); else await loadAll();
      if (!S.me || !member(S.me)) return render();
      checkNewNotifications();
      render();
    } catch (e) { err(e); }
  }

  async function notify(memberId, text, taskId) {
    if (!memberId || memberId === S.me) return;
    try { await store.insert("notifications", { member_id: memberId, text, task_id: taskId || null, read: false }); } catch (e) { console.warn(e); }
  }

  // ---------------- filtros ----------------
  function matchDay(due) {
    const f = S.filters.day;
    if (!f) return true;
    const t = today();
    if (f === "hoy") return due === t;
    if (f === "manana") return due === addDays(1);
    if (f === "semana") return !!due && due >= t && due <= addDays(7);
    if (f === "vencidas") return !!due && due < t;
    if (f === "sin") return !due;
    if (f === "fecha") return !S.filters.date || due === S.filters.date;
    return true;
  }
  function filteredTasks() {
    const { member: fm, project: fp, priority: fpr, q } = S.filters;
    const qq = q.trim().toLowerCase();
    return S.tasks.filter(t =>
      (!fm || (fm === "none" ? !t.assignee_id : t.assignee_id === fm)) &&
      (!fp || t.project_id === fp) &&
      (!fpr || t.priority === fpr) &&
      matchDay(t.due_date) &&
      (!qq || (t.title + " " + (t.description || "")).toLowerCase().includes(qq))
    );
  }
  function filteredNotes() {
    const { member: fm, project: fp, q, day, date } = S.filters;
    const qq = q.trim().toLowerCase();
    return S.notes.filter(n => {
      if (fm && !(n.attendees || []).includes(fm)) return false;
      if (fp && n.project_id !== fp) return false;
      if (day === "hoy" && n.meeting_date !== today()) return false;
      if (day === "semana" && !(n.meeting_date >= addDays(-7) && n.meeting_date <= addDays(7))) return false;
      if (day === "fecha" && date && n.meeting_date !== date) return false;
      if (qq && !(n.title + " " + n.content + " " + n.agreements).toLowerCase().includes(qq)) return false;
      return true;
    }).sort((a, b) => (b.meeting_date || "").localeCompare(a.meeting_date || ""));
  }
  function setFilter(k, v) {
    S.filters[k] = v;
    lsSet("filters", JSON.stringify(S.filters));
    renderMain();
  }

  // ---------------- render ----------------
  function render() {
    if (store.mode === "cloud" && !S.user) return renderLogin();
    if (!S.me || !member(S.me)) return renderWho();
    const unread = S.notifications.filter(n => n.member_id === S.me && !n.read).length;
    const me = member(S.me);
    $app.innerHTML = `
      <header class="topbar"><div class="topbar-inner">
        <a class="brand" href="#" data-act="view" data-v="board"><img src="assets/logo.png" alt="ValClabs" /><span>Tablero del equipo</span></a>
        <nav class="tabs">
          ${[["board", "Tablero"], ["notes", "Reuniones"], ["team", "Equipo"]].map(([v, l]) =>
            `<button class="tab ${S.view === v ? "active" : ""}" data-act="view" data-v="${v}">${l}</button>`).join("")}
        </nav>
        <div class="top-actions">
          ${store.mode === "local" ? '<span class="mode-pill" title="Los datos solo se guardan en este navegador. Configura Supabase para compartir con el equipo.">Modo local</span>' : ""}
          ${!isStandalone() ? '<button class="btn btn-ghost install-top" data-act="install">📲 Instalar app</button>' : ""}
          <button class="icon-btn" data-act="notif" aria-label="Notificaciones">${icon.bell}${unread ? `<span class="badge">${unread > 99 ? "99+" : unread}</span>` : ""}</button>
          <button class="me-btn" data-act="view" data-v="team" title="Tu perfil">${avatar(me)}<span class="me-name">${esc(me.name)}</span></button>
        </div>
      </div></header>
      ${installBanner()}
      <section id="filters"></section>
      <main id="main"></main>
      ${S.view === "board" ? '<button class="fab" data-act="new-task" aria-label="Nueva tarea">+</button>' : ""}
      <div id="notif-root"></div>`;
    renderMain();
    renderNotifPanel();
  }

  function renderMain() {
    const $f = document.getElementById("filters"), $m = document.getElementById("main");
    if (!$f || !$m) return;
    $f.innerHTML = S.view === "team" ? "" : filtersHTML();
    if (S.view === "board") renderBoard($m);
    else if (S.view === "notes") renderNotes($m);
    else renderTeam($m);
  }

  function filtersHTML() {
    const F = S.filters;
    const isNotes = S.view === "notes";
    const activeCount = ["member", "project", "day"].concat(isNotes ? [] : ["priority"]).filter(k => F[k]).length;
    const chips = [];
    if (F.member) chips.push(F.member === "none" ? "Sin asignar" : (member(F.member) || {}).name);
    if (F.project) chips.push((project(F.project) || {}).name);
    if (F.priority && !isNotes) chips.push("Urgencia " + PRIOS[F.priority].toLowerCase());
    if (F.day) chips.push(F.day === "fecha" ? fmtDay(F.date) || "Fecha" : { hoy: "Hoy", manana: "Mañana", semana: "Esta semana", vencidas: "Vencidas", sin: "Sin fecha" }[F.day]);
    return `<div class="filters ${S.filtersOpen ? "open" : ""}">
      <div class="f search"><label>Buscar ${isNotes ? "nota" : "tarea"}</label>
        <div style="display:flex;gap:8px"><input class="input" data-filter="q" type="search" placeholder="${isNotes ? "Título o contenido…" : "Nombre de la tarea…"}" value="${esc(F.q)}" />
        <button class="btn btn-ghost filter-toggle" data-act="toggle-filters">${icon.filter}${activeCount ? activeCount : ""}</button></div>
      </div>
      <div class="f"><label>${isNotes ? "Asistente" : "Persona"}</label>
        <select class="input" data-filter="member"><option value="">Todo el equipo</option>
          ${S.members.map(m => `<option value="${m.id}" ${F.member === m.id ? "selected" : ""}>${esc(m.name)}${m.id === S.me ? " (yo)" : ""}</option>`).join("")}
          ${isNotes ? "" : `<option value="none" ${F.member === "none" ? "selected" : ""}>Sin asignar</option>`}
        </select></div>
      <div class="f"><label>Proyecto</label>
        <select class="input" data-filter="project"><option value="">Todos</option>
          ${S.projects.map(p => `<option value="${p.id}" ${F.project === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
        </select></div>
      ${isNotes ? "" : `<div class="f"><label>Urgencia</label>
        <select class="input" data-filter="priority"><option value="">Todas</option>
          ${Object.entries(PRIOS).map(([k, v]) => `<option value="${k}" ${F.priority === k ? "selected" : ""}>${v}</option>`).join("")}
        </select></div>`}
      <div class="f"><label>Día</label>
        <select class="input" data-filter="day">
          <option value="">Cualquier día</option>
          <option value="hoy" ${F.day === "hoy" ? "selected" : ""}>Hoy</option>
          ${isNotes ? "" : `<option value="manana" ${F.day === "manana" ? "selected" : ""}>Mañana</option>`}
          <option value="semana" ${F.day === "semana" ? "selected" : ""}>${isNotes ? "Esta semana (±7 días)" : "Próximos 7 días"}</option>
          ${isNotes ? "" : `<option value="vencidas" ${F.day === "vencidas" ? "selected" : ""}>Vencidas</option>
          <option value="sin" ${F.day === "sin" ? "selected" : ""}>Sin fecha</option>`}
          <option value="fecha" ${F.day === "fecha" ? "selected" : ""}>Elegir fecha…</option>
        </select></div>
      ${F.day === "fecha" ? `<div class="f"><label>Fecha</label><input class="input" type="date" data-filter="date" value="${esc(F.date)}" /></div>` : ""}
      ${activeCount || F.q ? '<button class="link-btn" data-act="clear-filters">Limpiar filtros</button>' : ""}
      ${isNotes ? "" : '<button class="btn btn-accent new-task-btn" data-act="new-task">+ Nueva tarea</button>'}
      ${chips.length && !S.filtersOpen ? `<div class="chips-active">${chips.map(c => `<span class="chip">${esc(c)}</span>`).join("")}</div>` : ""}
    </div>`;
  }

  function cardHTML(t) {
    const p = project(t.project_id), m = member(t.assignee_id);
    const t0 = today();
    const dueCls = t.status !== "hecho" && t.due_date ? (t.due_date < t0 ? "overdue" : t.due_date === t0 ? "today" : "") : "";
    return `<article class="card ${t.status === "hecho" ? "done" : ""}" data-id="${t.id}" style="border-left-color:${esc(p ? p.color : "#d1c4e9")}">
      <div class="card-top">
        ${p ? `<span class="chip" style="background:${esc(p.color)}1a;color:${esc(p.color)}">${esc(p.name)}</span>` : ""}
        <span class="chip prio-${esc(t.priority)}" title="Urgencia">${{ alta: "▲ Alta", media: "● Media", baja: "▽ Baja" }[t.priority] || "● Media"}</span>
      </div>
      <div class="card-title">${esc(t.title)}</div>
      ${t.description ? `<p class="card-desc">${esc(t.description)}</p>` : ""}
      <div class="card-foot">
        ${t.due_date ? `<span class="due ${dueCls}">📅 ${dueCls === "overdue" ? "Venció " : ""}${esc(fmtDay(t.due_date))}</span>` : ""}
        ${(t.attachments || []).length ? `<span class="due" title="Archivos adjuntos">📎 ${t.attachments.length}</span>` : ""}
        ${t.reminder_at && !t.reminder_sent ? `<span class="bell-mini" title="Recordatorio: ${esc(fmtDateTime(t.reminder_at))}">⏰</span>` : ""}
        <span class="spacer"></span>
        <button type="button" class="move-btn" data-act="move" data-id="${t.id}" title="Mover a otra columna">Mover →</button>
        ${avatar(m, "sm")}${m ? `<span style="font-size:12px;font-weight:600">${esc(m.name.split(" ")[0])}</span>` : ""}
      </div>
    </article>`;
  }

  async function moveTask(t, status, position) {
    if (!t) return;
    if (position == null) {
      const col = S.tasks.filter(x => x.status === status && x.id !== t.id);
      position = col.length ? Math.max(...col.map(x => x.position || 0)) + 1 : 1;
    }
    const oldStatus = t.status;
    Object.assign(t, { status, position });
    try {
      await store.update("tasks", t.id, { status, position });
      if (oldStatus !== status) {
        const st = STATUSES.find(s => s.id === status).label;
        if (t.assignee_id && t.assignee_id !== S.me) notify(t.assignee_id, `${member(S.me).name} movió «${t.title}» a ${st}`, t.id);
        if (status === "hecho" && t.created_by && t.created_by !== S.me && t.created_by !== t.assignee_id) notify(t.created_by, `«${t.title}» quedó terminada ✅`, t.id);
        toast("Movida a " + st);
      }
      renderMain();
    } catch (e) { err(e); reload("tasks"); }
  }

  function moveMenu(t) {
    openModal(`<h2>Mover «${esc(t.title)}»<button type="button" class="close" data-act="close-modal">×</button></h2>
      <div class="move-list">${STATUSES.map(s => `<button type="button" class="move-opt ${s.id === t.status ? "current" : ""}" data-act="move-to" data-id="${t.id}" data-status="${s.id}" ${s.id === t.status ? "disabled" : ""}>
        <span class="col-dot" style="background:${s.color}"></span>${s.label}${s.id === t.status ? " <small>(actual)</small>" : ""}</button>`).join("")}</div>`);
  }

  // Pastillas de columnas (celular): resalta la columna visible
  let activeCol = 0;
  function syncPills(board) {
    const cols = [...board.querySelectorAll(".column")];
    const left = board.scrollLeft;
    let best = 0, bestD = Infinity;
    cols.forEach((c, i) => { const d = Math.abs(c.offsetLeft - board.offsetLeft - 16 - left); if (d < bestD) { bestD = d; best = i; } });
    activeCol = best;
    document.querySelectorAll(".col-pill").forEach((p, i) => p.classList.toggle("active", i === best));
    const pill = document.querySelectorAll(".col-pill")[best], bar = pill && pill.parentElement;
    if (pill && bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: pill.offsetLeft - bar.offsetLeft - 16, behavior: "smooth" });
  }

  function renderBoard($m) {
    const tasks = filteredTasks();
    const counts = STATUSES.map(s => tasks.filter(t => t.status === s.id).length);
    $m.innerHTML = `<div class="col-pills">${STATUSES.map((s, i) => `<button class="col-pill ${i === activeCol ? "active" : ""}" data-act="goto-col" data-i="${i}"><span class="col-dot" style="background:${s.color}"></span>${s.label}<b>${counts[i]}</b></button>`).join("")}</div>
    <div class="board">${STATUSES.map(s => {
      const list = tasks.filter(t => t.status === s.id).sort((a, b) => (a.position || 0) - (b.position || 0));
      return `<section class="column">
        <div class="col-head"><span class="col-dot" style="background:${s.color}"></span><span class="col-title">${s.label}</span><span class="col-count">${list.length}</span>
          <button class="col-add" data-act="new-task" data-status="${s.id}" title="Agregar tarea">+</button></div>
        <div class="col-list" data-status="${s.id}">${list.map(cardHTML).join("") || ""}</div>
        <button class="col-add-bottom" data-act="new-task" data-status="${s.id}">+ Agregar tarea</button>
      </section>`;
    }).join("")}</div>`;

    const board = $m.querySelector(".board");
    const col0 = board.querySelectorAll(".column")[activeCol];
    if (col0 && board.scrollWidth > board.clientWidth) board.scrollLeft = col0.offsetLeft - board.offsetLeft - 16;
    let raf; board.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => syncPills(board)); }, { passive: true });

    if (!window.Sortable) return;
    $m.querySelectorAll(".col-list").forEach(el => {
      new Sortable(el, {
        group: "tasks", animation: 150, filter: ".move-btn", preventOnFilter: false, delay: 180, delayOnTouchOnly: true, touchStartThreshold: 6,
        ghostClass: "sortable-ghost", chosenClass: "sortable-chosen",
        onEnd: async (ev) => {
          const id = ev.item.dataset.id, status = ev.to.dataset.status;
          const ids = [...ev.to.children].map(c => c.dataset.id);
          const i = ids.indexOf(id);
          const pos = id => (byId(S.tasks, id) || {}).position || 0;
          const prev = i > 0 ? pos(ids[i - 1]) : null, next = i < ids.length - 1 ? pos(ids[i + 1]) : null;
          let position = prev == null && next == null ? 1 : prev == null ? next - 1 : next == null ? prev + 1 : (prev + next) / 2;
          await moveTask(byId(S.tasks, id), status, position);
        }
      });
    });
  }

  function renderNotes($m) {
    const notes = filteredNotes();
    $m.innerHTML = `<div class="page">
      <div class="page-head"><h1>Notas de reuniones</h1><span class="chip">${notes.length}</span>
        <button class="btn btn-primary" data-act="new-note">+ Nueva nota</button></div>
      ${notes.length ? `<div class="notes-grid">${notes.map(n => {
        const p = project(n.project_id);
        return `<article class="note" data-note="${n.id}" style="border-top-color:${esc(p ? p.color : "#5e35b1")}">
          <div class="note-meta"><span class="chip">📅 ${esc(fmtDay(n.meeting_date))}</span>${p ? `<span class="chip" style="background:${esc(p.color)}1a;color:${esc(p.color)}">${esc(p.name)}</span>` : ""}
            <span class="avatars" style="margin-left:auto">${(n.attendees || []).map(id => avatar(member(id), "sm")).join("")}</span></div>
          <h3>${esc(n.title)}</h3>
          ${n.content ? `<div class="note-body">${esc(n.content)}</div>` : ""}
          ${(n.attachments || []).length ? `<div class="note-meta" style="margin-bottom:8px">📎 ${n.attachments.length} archivo(s): ${n.attachments.slice(0, 3).map(a => esc(a.name)).join(", ")}${n.attachments.length > 3 ? "…" : ""}</div>` : ""}
          ${n.agreements ? `<div class="note-agree"><b>Acuerdos</b>\n${esc(n.agreements)}</div>` : ""}
        </article>`;
      }).join("")}</div>` : `<div class="empty-state"><img src="assets/icon-192.png" alt="" /><p>No hay notas con estos filtros.</p><button class="btn btn-primary" data-act="new-note">Crear la primera nota</button></div>`}
    </div>`;
  }

  function renderTeam($m) {
    const open = S.tasks.filter(t => t.status !== "hecho");
    const t0 = today();
    const pushSupported = "serviceWorker" in navigator && "Notification" in window;
    const perm = "Notification" in window ? Notification.permission : "unsupported";
    $m.innerHTML = `<div class="page">
      <div class="page-head"><h1>Equipo y proyectos</h1></div>
      <div class="panel" style="margin-bottom:20px">
        <h2>Tu perfil: ${esc(member(S.me).name)}</h2>
        <div class="stat">
          <div><b>${open.filter(t => t.assignee_id === S.me).length}</b><span>Tareas abiertas</span></div>
          <div><b>${open.filter(t => t.assignee_id === S.me && t.due_date === t0).length}</b><span>Vencen hoy</span></div>
          <div><b>${open.filter(t => t.assignee_id === S.me && t.due_date && t.due_date < t0).length}</b><span>Vencidas</span></div>
        </div>
        <div class="modal-actions">
          ${pushSupported ? (perm === "granted" ? '<span class="chip prio-baja">🔔 Notificaciones activadas en este dispositivo</span><button class="btn btn-ghost" data-act="test-notif">Probar</button>'
            : perm === "denied" ? '<span class="chip prio-alta">Notificaciones bloqueadas: actívalas en los ajustes del navegador</span>'
            : '<button class="btn btn-accent" data-act="enable-notif">🔔 Activar notificaciones</button>') : '<span class="chip">Este navegador no admite notificaciones. En iPhone: instala la app (Compartir → Agregar a inicio).</span>'}
          <span class="right">
            ${!isStandalone() ? '<button class="btn btn-ghost" data-act="install">📲 Instalar app</button>' : ""}
            ${store.mode === "cloud" ? '<button class="btn btn-danger" data-act="logout">Cerrar sesión</button>' : ""}
          </span>
        </div>
      </div>
      <div class="team-grid">
        <div class="panel"><h2>Personas</h2><p class="help">Quienes pueden recibir tareas. El correo vincula a cada persona con su inicio de sesión.</p>
          ${S.members.map(m => `<div class="row-item">${avatar(m)}<div class="grow"><div class="name">${esc(m.name)}${m.id === S.me ? " · yo" : ""}</div>
            <div class="sub">${esc(m.email || "sin correo")} · ${open.filter(t => t.assignee_id === m.id).length} abiertas</div></div>
            <button data-act="edit-member" data-id="${m.id}">Editar</button></div>`).join("")}
          <form class="add-row" data-form="add-member">
            <input class="input" name="name" placeholder="Nombre" required />
            <input class="input" name="email" type="email" placeholder="Correo (opcional)" />
            <input type="color" name="color" value="${PALETTE[S.members.length % PALETTE.length]}" />
            <button class="btn btn-primary">Agregar</button>
          </form></div>
        <div class="panel"><h2>Proyectos</h2><p class="help">Agrupan tareas y notas. El color se ve en el borde de cada tarjeta.</p>
          ${S.projects.map(p => `<div class="row-item"><span class="avatar" style="background:${esc(p.color)};border-radius:8px">${esc(initials(p.name))}</span><div class="grow"><div class="name">${esc(p.name)}</div>
            <div class="sub">${S.tasks.filter(t => t.project_id === p.id).length} tareas · ${S.notes.filter(n => n.project_id === p.id).length} notas</div></div>
            <button data-act="edit-project" data-id="${p.id}">Editar</button></div>`).join("")}
          <form class="add-row" data-form="add-project">
            <input class="input" name="name" placeholder="Nombre del proyecto" required />
            <input type="color" name="color" value="${PALETTE[(S.projects.length + 1) % PALETTE.length]}" />
            <button class="btn btn-primary">Agregar</button>
          </form></div>
      </div>
    </div>`;
  }

  function renderNotifPanel() {
    const $r = document.getElementById("notif-root");
    if (!$r) return;
    if (!S.notifOpen) { $r.innerHTML = ""; return; }
    const mine = S.notifications.filter(n => n.member_id === S.me).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50);
    const askPerm = "Notification" in window && Notification.permission === "default";
    $r.innerHTML = `<div class="overlay" data-act="close-notif" style="background:transparent"></div>
      <div class="notif-panel">
        <div class="notif-head">Notificaciones ${mine.length ? `<button class="link-btn" data-act="read-all">Marcar todo como leído</button>` : ""}</div>
        ${askPerm ? `<div class="notif-cta">🔔 <span>Recibe avisos y recordatorios en este dispositivo.</span><button class="btn btn-accent" data-act="enable-notif">Activar</button></div>` : ""}
        <div class="notif-list">${mine.length ? mine.map(n => `<div class="notif ${n.read ? "read" : "unread"}" data-notif="${n.id}"><span class="dot"></span><div>${esc(n.text)}<small>${esc(timeAgo(n.created_at))}</small></div></div>`).join("")
          : '<p style="padding:24px;text-align:center;color:var(--muted);font-size:14px">Todo al día ✨</p>'}</div>
      </div>`;
  }

  // ---------------- login y "¿quién eres?" ----------------
  function renderLogin(msg, isErr) {
    $app.innerHTML = `<div class="auth"><form class="auth-card" data-form="login">
      <img class="logo" src="assets/logo.png" alt="ValClabs" />
      <h1>Tablero del equipo</h1>
      <div class="field"><label>Correo</label><input class="input" name="email" type="email" required autocomplete="email" /></div>
      <div class="field"><label>Contraseña</label><input class="input" name="password" type="password" autocomplete="current-password" /></div>
      <button class="btn btn-primary" name="mode" value="in">Entrar</button>
      <button class="btn btn-ghost" name="mode" value="link" formnovalidate>Enviarme un enlace de acceso</button>
      <button class="btn btn-ghost" name="mode" value="up">Crear cuenta</button>
      <p class="auth-msg ${isErr ? "err" : ""}">${esc(msg || "")}</p>
    </form></div>`;
  }
  function renderWho() {
    const email = (S.user && S.user.email) || "";
    $app.innerHTML = `<div class="auth"><div class="auth-card">
      <img class="logo" src="assets/logo.png" alt="ValClabs" />
      <h1>${S.members.length ? "¿Quién eres?" : "Crea tu perfil para empezar"}</h1>
      <div class="who-list">${S.members.map(m => `<button class="who-item" data-act="pick-me" data-id="${m.id}">${avatar(m)} ${esc(m.name)}</button>`).join("")}</div>
      <form class="add-row" data-form="add-me" style="margin-top:16px">
        <input class="input" name="name" placeholder="${S.members.length ? "Soy nuevo/a: mi nombre" : "Tu nombre"}" required />
        <button class="btn btn-primary">Unirme</button>
      </form>
      ${email ? `<p class="auth-msg">Sesión: ${esc(email)}</p>` : ""}
    </div></div>`;
  }
  async function setMe(id) {
    S.me = id; lsSet("me", id);
    const m = member(id);
    if (S.user && S.user.email && m && !m.email) { try { await store.update("members", id, { email: S.user.email }); m.email = S.user.email; } catch (e) {} }
    seenNotifs = new Set(S.notifications.map(n => n.id));
    render();
    checkReminders();
    if ("Notification" in window && Notification.permission === "granted") subscribePush();
  }

  // ---------------- modales ----------------
  function openModal(html, onMount) {
    $modal.innerHTML = `<div class="overlay" data-act="close-modal"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
    const first = $modal.querySelector("input:not([type=color]),textarea");
    if (first && window.innerWidth > 760) first.focus();
    renderAttList();
    if (onMount) onMount($modal.querySelector(".modal"));
  }
  function closeModal() { $modal.innerHTML = ""; modalFiles = []; removedFiles = []; }
  const opt = (arr, sel, empty) => (empty != null ? `<option value="">${empty}</option>` : "") + arr.map(x => `<option value="${x.id}" ${x.id === sel ? "selected" : ""}>${esc(x.name || x.label)}</option>`).join("");

  function taskModal(task, defaults) {
    modalFiles = ((task && task.attachments) || []).map(f => ({ ...f })); removedFiles = [];
    const t = task || Object.assign({ title: "", description: "", status: "pendiente", priority: "media", assignee_id: S.filters.member && S.filters.member !== "none" ? S.filters.member : S.me, project_id: S.filters.project || "", due_date: "", reminder_at: null }, defaults || {});
    openModal(`<form data-form="task" data-id="${t.id || ""}">
      <h2>${task ? "Editar tarea" : "Nueva tarea"}<button type="button" class="close" data-act="close-modal">×</button></h2>
      <div class="form-grid">
        <div class="field full"><label>Tarea</label><input class="input" name="title" required value="${esc(t.title)}" placeholder="¿Qué hay que hacer?" /></div>
        <div class="field full"><label>Detalles</label><textarea class="input" name="description" placeholder="Enlaces, contexto, pasos…">${esc(t.description)}</textarea></div>
        <div class="field"><label>Responsable</label><select class="input" name="assignee_id">${opt(S.members, t.assignee_id, "Sin asignar")}</select></div>
        <div class="field"><label>Proyecto</label><select class="input" name="project_id">${opt(S.projects, t.project_id, "Sin proyecto")}</select></div>
        <div class="field"><label>Estado</label><select class="input" name="status">${opt(STATUSES, t.status)}</select></div>
        <div class="field"><label>Urgencia</label><select class="input" name="priority">${Object.entries(PRIOS).map(([k, v]) => `<option value="${k}" ${t.priority === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div class="field"><label>Fecha límite</label><input class="input" type="date" name="due_date" value="${esc(t.due_date || "")}" /></div>
        <div class="field"><label>Aviso antes de la entrega</label><select class="input" name="remind_days_before">
          ${[[1, "1 día antes"], [2, "2 días antes"], [3, "3 días antes"], [7, "1 semana antes"], [0, "Solo el mismo día"]].map(([v, l]) => `<option value="${v}" ${+(t.remind_days_before ?? 1) === v ? "selected" : ""}>${l}</option>`).join("")}
        </select><span class="hint">Además siempre avisa el mismo día de la entrega.</span></div>
        <div class="field"><label>Recordatorio extra (opcional)</label><input class="input" type="datetime-local" name="reminder_at" value="${esc(toLocalInput(t.reminder_at))}" />
          <span class="hint">${t.reminder_sent ? "Ya se envió. Cambia la hora para programar otro." : "Avisa al responsable en esa fecha y hora."}</span></div>
        ${attachmentsField()}
      </div>
      <div class="modal-actions">
        ${task ? '<button type="button" class="btn btn-danger" data-act="delete-task">Eliminar</button>' : ""}
        ${task && (t.due_date || t.reminder_at) ? '<button type="button" class="btn btn-ghost" data-act="gcal" title="Android, Google Calendar y computador">📅 Google Calendar</button><button type="button" class="btn btn-ghost" data-act="ics" title="iPhone, Mac y Outlook">🍎 Calendario Apple / Outlook</button>' : ""}
        <span class="right"><button type="button" class="btn btn-ghost" data-act="close-modal">Cancelar</button><button class="btn btn-primary">Guardar</button></span>
      </div>
    </form>`);
  }

  function noteModal(note) {
    modalFiles = ((note && note.attachments) || []).map(f => ({ ...f })); removedFiles = [];
    const n = note || { title: "", meeting_date: today(), project_id: S.filters.project || "", attendees: [S.me], content: "", agreements: "" };
    openModal(`<form data-form="note" data-id="${n.id || ""}">
      <h2>${note ? "Nota de reunión" : "Nueva nota de reunión"}<button type="button" class="close" data-act="close-modal">×</button></h2>
      <div class="form-grid">
        <div class="field full"><label>Título</label><input class="input" name="title" required value="${esc(n.title)}" placeholder="Ej: Reunión semanal" /></div>
        <div class="field"><label>Fecha</label><input class="input" type="date" name="meeting_date" required value="${esc(n.meeting_date)}" /></div>
        <div class="field"><label>Proyecto</label><select class="input" name="project_id">${opt(S.projects, n.project_id, "Sin proyecto")}</select></div>
        <div class="field full"><label>Asistentes</label><div class="pick-chips">${S.members.map(m =>
          `<button type="button" class="pick-chip ${(n.attendees || []).includes(m.id) ? "on" : ""}" data-act="toggle-att" data-id="${m.id}">${avatar(m, "sm")}${esc(m.name)}</button>`).join("")}</div></div>
        <div class="field full"><label>Notas</label><textarea class="input" name="content" rows="6" placeholder="Temas tratados, ideas, decisiones…">${esc(n.content)}</textarea></div>
        <div class="field full"><label>Acuerdos / pendientes</label><textarea class="input" name="agreements" rows="4" placeholder="Un acuerdo por línea. Ej: Grabar reel de tarifas — nombre de la persona">${esc(n.agreements)}</textarea>
          <span class="hint">Escribe un acuerdo por línea con el nombre de la persona y conviértelos en tareas con un clic.</span></div>
        ${attachmentsField()}
      </div>
      <div class="modal-actions">
        ${note ? '<button type="button" class="btn btn-danger" data-act="delete-note">Eliminar</button>' : ""}
        <button type="button" class="btn btn-accent" data-act="agree-to-tasks">Crear tareas de los acuerdos</button>
        <span class="right"><button type="button" class="btn btn-ghost" data-act="close-modal">Cancelar</button><button class="btn btn-primary">Guardar</button></span>
      </div>
    </form>`);
  }

  function entityModal(kind, item) {
    const isM = kind === "member";
    openModal(`<form data-form="edit-${kind}" data-id="${item.id}">
      <h2>Editar ${isM ? "persona" : "proyecto"}<button type="button" class="close" data-act="close-modal">×</button></h2>
      <div class="form-grid">
        <div class="field full"><label>Nombre</label><input class="input" name="name" required value="${esc(item.name)}" /></div>
        ${isM ? `<div class="field full"><label>Correo</label><input class="input" type="email" name="email" value="${esc(item.email || "")}" /></div>` : ""}
        <div class="field"><label>Color</label><input type="color" name="color" value="${esc(item.color || "#5e35b1")}" /></div>
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-danger" data-act="delete-${kind}">Eliminar</button>
        <span class="right"><button type="button" class="btn btn-ghost" data-act="close-modal">Cancelar</button><button class="btn btn-primary">Guardar</button></span></div>
    </form>`);
  }

  // ---------------- acciones ----------------
  async function saveTask(form) {
    const fd = new FormData(form), id = form.dataset.id;
    const reminderLocal = fd.get("reminder_at");
    const data = {
      title: fd.get("title").trim(), description: fd.get("description").trim(),
      assignee_id: fd.get("assignee_id") || null, project_id: fd.get("project_id") || null,
      status: fd.get("status"), priority: fd.get("priority"),
      due_date: fd.get("due_date") || null,
      reminder_at: reminderLocal ? new Date(reminderLocal).toISOString() : null,
      remind_days_before: +fd.get("remind_days_before"),
      attachments: cleanFiles()
    };
    if (modalFiles.some(f => f.uploading)) return toast("Espera a que terminen de subir los archivos");
    const old = id ? byId(S.tasks, id) : null;
    if (!old || old.reminder_at !== data.reminder_at) data.reminder_sent = false;
    if (!old || old.due_date !== data.due_date || +(old.remind_days_before ?? 1) !== data.remind_days_before) { data.due_warned_before = false; data.due_warned_today = false; }
    try {
      if (old) {
        await store.update("tasks", id, data);
        if (data.assignee_id && data.assignee_id !== old.assignee_id) notify(data.assignee_id, `${member(S.me).name} te asignó «${data.title}»`, id);
        toast("Tarea actualizada");
      } else {
        const col = S.tasks.filter(t => t.status === data.status);
        data.position = col.length ? Math.max(...col.map(t => t.position || 0)) + 1 : 1;
        data.created_by = S.me;
        const r = await store.insert("tasks", data);
        notify(data.assignee_id, `${member(S.me).name} te asignó «${data.title}»${data.due_date ? " para " + fmtDay(data.due_date).toLowerCase() : ""}`, r && r.id);
        toast("Tarea creada");
      }
      await purgeRemoved();
      closeModal();
      if (data.reminder_at && "Notification" in window && Notification.permission === "default") toast("Activa las notificaciones para recibir el recordatorio 🔔");
      await reload("tasks");
    } catch (e) { err(e); }
  }

  async function saveNote(form) {
    const fd = new FormData(form), id = form.dataset.id;
    const attendees = [...form.querySelectorAll(".pick-chip.on")].map(b => b.dataset.id);
    if (modalFiles.some(f => f.uploading)) { toast("Espera a que terminen de subir los archivos"); return false; }
    const data = { title: fd.get("title").trim(), meeting_date: fd.get("meeting_date"), project_id: fd.get("project_id") || null, attendees, content: fd.get("content"), agreements: fd.get("agreements"), attachments: cleanFiles() };
    try {
      if (id) await store.update("notes", id, data);
      else {
        data.created_by = S.me;
        const r = await store.insert("notes", data);
        form.dataset.id = r.id;
        attendees.forEach(a => notify(a, `${member(S.me).name} compartió la nota «${data.title}»`));
      }
      await purgeRemoved();
      toast("Nota guardada");
      await reload("notes");
      return true;
    } catch (e) { err(e); return false; }
  }

  async function agreementsToTasks(form) {
    const fd = new FormData(form);
    const lines = String(fd.get("agreements") || "").split("\n").map(l => l.replace(/^\s*[-*•\d.)]+\s*/, "").trim()).filter(Boolean);
    if (!lines.length) return toast("Escribe al menos un acuerdo (uno por línea)");
    if (!(await saveNote(form))) return;
    const projectId = fd.get("project_id") || null;
    let n = 0;
    for (const line of lines) {
      if (S.tasks.some(t => t.title.toLowerCase() === line.toLowerCase())) continue;
      const low = line.toLowerCase();
      const who = S.members.find(m => low.includes(m.name.toLowerCase())) || S.members.find(m => low.includes(m.name.split(" ")[0].toLowerCase()));
      let title = line;
      if (who) title = line.replace(new RegExp("\\s*[—–\\-:@,]*\\s*@?" + who.name.split(" ")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s+\\S+)?\\s*$", "i"), "").trim() || line;
      try {
        const r = await store.insert("tasks", { title, description: "De la reunión: " + fd.get("title"), status: "pendiente", priority: "media", assignee_id: who ? who.id : null, project_id: projectId, due_date: null, reminder_at: null, reminder_sent: false, position: Date.now() / 1e12, created_by: S.me });
        if (who) notify(who.id, `${member(S.me).name} te asignó «${title}» (acuerdo de reunión)`, r && r.id);
        n++;
      } catch (e) { err(e); }
    }
    closeModal();
    await reload("tasks");
    toast(n ? `${n} tarea(s) creada(s) en «Por hacer»` : "Esas tareas ya existían");
  }

  function openGoogleCalendar(t) {
    const pad = n => String(n).padStart(2, "0");
    const stamp = d => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + "00Z";
    let dates;
    if (t.reminder_at) { const st = new Date(t.reminder_at); dates = stamp(st) + "/" + stamp(new Date(st.getTime() + 30 * 60000)); }
    else { const [y, m, d] = t.due_date.split("-").map(Number); dates = t.due_date.replace(/-/g, "") + "/" + dayStr(new Date(y, m - 1, d + 1)).replace(/-/g, ""); }
    const p = project(t.project_id);
    const details = [t.description, p ? "Proyecto: " + p.name : "", "Tablero: " + location.href.split("#")[0]].filter(Boolean).join("\n");
    const url = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(t.title) + "&dates=" + dates + "&details=" + encodeURIComponent(details);
    window.open(url, "_blank");
  }

  function downloadICS(t) {
    const pad = n => String(n).padStart(2, "0");
    const stamp = d => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + "00Z";
    const icsEsc = s => String(s || "").replace(/[\\;,]/g, m => "\\" + m).replace(/\n/g, "\\n");
    let start, end, allDay = false;
    if (t.reminder_at) { start = new Date(t.reminder_at); end = new Date(start.getTime() + 30 * 60000); }
    else { allDay = true; }
    const dDay = (t.due_date || "").replace(/-/g, "");
    const nextDay = t.due_date ? (() => { const [y, m, d] = t.due_date.split("-").map(Number); const x = new Date(y, m - 1, d + 1); return dayStr(x).replace(/-/g, ""); })() : "";
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ValClabs//Tablero//ES", "BEGIN:VEVENT",
      "UID:" + t.id + "@tablero-valclabs", "DTSTAMP:" + stamp(new Date()),
      allDay ? "DTSTART;VALUE=DATE:" + dDay : "DTSTART:" + stamp(start),
      allDay ? "DTEND;VALUE=DATE:" + nextDay : "DTEND:" + stamp(end),
      "SUMMARY:" + icsEsc(t.title), "DESCRIPTION:" + icsEsc(t.description + "\n" + location.href.split("#")[0]),
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(t.title), allDay ? "TRIGGER:-PT15H" : "TRIGGER:-PT10M", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
    a.download = t.title.replace(/[^\w\sáéíóúñ-]/gi, "").slice(0, 40) + ".ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------------- notificaciones y recordatorios ----------------
  let swReg = null;
  async function registerSW() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    try { swReg = await navigator.serviceWorker.register("sw.js"); } catch (e) { console.warn("SW", e); }
  }
  async function showSystemNotification(title, body, tag) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const opts = { body, icon: "assets/icon-192.png", badge: "assets/icon-192.png", tag: tag || undefined };
    try {
      const reg = swReg || (navigator.serviceWorker && await navigator.serviceWorker.getRegistration());
      if (reg) return reg.showNotification(title, opts);
      new Notification(title, opts);
    } catch (e) { try { new Notification(title, opts); } catch (e2) {} }
  }
  async function enableNotifications() {
    if (!("Notification" in window)) return toast("En iPhone primero instala la app: Compartir → Agregar a pantalla de inicio");
    const p = await Notification.requestPermission();
    if (p === "granted") {
      toast("¡Notificaciones activadas! 🔔");
      showSystemNotification("Tablero ValClabs", "Así se verán tus avisos y recordatorios.");
      subscribePush();
    } else toast("No se activaron las notificaciones");
    render();
  }
  async function subscribePush() {
    if (store.mode !== "cloud" || !cfg.VAPID_PUBLIC_KEY || !("PushManager" in window)) return;
    try {
      const reg = swReg || await navigator.serviceWorker.ready;
      const key = cfg.VAPID_PUBLIC_KEY.replace(/-/g, "+").replace(/_/g, "/");
      const raw = atob(key + "=".repeat((4 - key.length % 4) % 4));
      const appKey = Uint8Array.from(raw, c => c.charCodeAt(0));
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
      await store.savePush(S.me, sub);
    } catch (e) { console.warn("push", e); }
  }
  function checkNewNotifications() {
    if (!S.me) return;
    if (!seenNotifs) { seenNotifs = new Set(S.notifications.map(n => n.id)); return; }
    S.notifications.filter(n => n.member_id === S.me && !n.read && !seenNotifs.has(n.id)).forEach(n => {
      seenNotifs.add(n.id);
      if (document.visibilityState === "visible") toast("🔔 " + n.text);
      else showSystemNotification("Tablero ValClabs", n.text, n.id);
    });
    S.notifications.forEach(n => seenNotifs.add(n.id));
  }
  async function checkReminders() {
    if (!S.me) return;
    const now = Date.now();
    for (const t of S.tasks) {
      if (t.assignee_id !== S.me || !t.reminder_at || t.reminder_sent || t.status === "hecho") continue;
      if (new Date(t.reminder_at).getTime() > now) continue;
      t.reminder_sent = true;
      const text = `⏰ Recordatorio: «${t.title}»${t.due_date ? " — vence " + fmtDay(t.due_date).toLowerCase() : ""}`;
      showSystemNotification("Recordatorio", text.replace("⏰ Recordatorio: ", ""), "rem-" + t.id);
      toast(text);
      try {
        await store.update("tasks", t.id, { reminder_sent: true });
        const r = await store.insert("notifications", { member_id: S.me, text, task_id: t.id, read: false });
        if (seenNotifs && r) seenNotifs.add(r.id);
      } catch (e) { console.warn(e); }
    }
    // Avisos automáticos de entrega: N días antes y el mismo día (desde las 8 a. m.)
    if (new Date().getHours() >= 8) {
      const t0 = today();
      for (const t of S.tasks) {
        if (t.assignee_id !== S.me || !t.due_date || t.status === "hecho") continue;
        const days = daysUntil(t.due_date), before = t.remind_days_before == null ? 1 : +t.remind_days_before;
        let patch = null, text = null;
        if (t.due_date === t0 && !t.due_warned_today) {
          patch = { due_warned_today: true, due_warned_before: true };
          text = `📌 Hoy es la entrega de «${t.title}»`;
        } else if (before > 0 && days > 0 && days <= before && !t.due_warned_before) {
          patch = { due_warned_before: true };
          text = `⏳ «${t.title}» se entrega ${days === 1 ? "mañana" : "en " + days + " días (" + fmtDay(t.due_date) + ")"}`;
        }
        if (!patch) continue;
        Object.assign(t, patch);
        showSystemNotification(t.due_date === t0 ? "Entrega hoy" : "Entrega próxima", text.replace(/^\S+\s/, ""), "due-" + t.id);
        toast(text);
        try {
          await store.update("tasks", t.id, patch);
          const r = await store.insert("notifications", { member_id: S.me, text, task_id: t.id, read: false });
          if (seenNotifs && r) seenNotifs.add(r.id);
        } catch (e) { console.warn(e); }
      }
    }
    reload("notifications");
  }

  // ---------------- eventos ----------------
  document.addEventListener("click", async (e) => {
    const card = e.target.closest(".card");
    if (card && !e.target.closest("[data-act]")) return taskModal(byId(S.tasks, card.dataset.id));
    const noteEl = e.target.closest("[data-note]");
    if (noteEl) return noteModal(byId(S.notes, noteEl.dataset.note));
    const nEl = e.target.closest("[data-notif]");
    if (nEl) {
      const n = byId(S.notifications, nEl.dataset.notif);
      if (n && !n.read) { n.read = true; store.update("notifications", n.id, { read: true }).catch(err); }
      S.notifOpen = false; render();
      const t = n && n.task_id && byId(S.tasks, n.task_id);
      if (t) taskModal(t);
      return;
    }
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    if ((act === "close-modal" || act === "close-notif") && e.target !== el && !el.matches("button")) return; // clic dentro del modal
    switch (act) {
      case "view": e.preventDefault(); S.view = el.dataset.v; lsSet("view", S.view); S.notifOpen = false; render(); window.scrollTo(0, 0); break;
      case "notif": S.notifOpen = !S.notifOpen; renderNotifPanel(); break;
      case "close-notif": S.notifOpen = false; renderNotifPanel(); break;
      case "read-all": {
        const mine = S.notifications.filter(n => n.member_id === S.me && !n.read);
        mine.forEach(n => n.read = true); render(); S.notifOpen = true; renderNotifPanel();
        for (const n of mine) store.update("notifications", n.id, { read: true }).catch(console.warn);
        break;
      }
      case "toggle-filters": S.filtersOpen = !S.filtersOpen; renderMain(); break;
      case "clear-filters": S.filters = { member: "", project: "", priority: "", day: "", date: "", q: "" }; lsSet("filters", JSON.stringify(S.filters)); renderMain(); break;
      case "new-task": taskModal(null, el.dataset.status ? { status: el.dataset.status } : null); break;
      case "new-note": noteModal(); break;
      case "close-modal": closeModal(); break;
      case "toggle-att": el.classList.toggle("on"); break;
      case "move": moveMenu(byId(S.tasks, el.dataset.id)); break;
      case "move-to": closeModal(); await moveTask(byId(S.tasks, el.dataset.id), el.dataset.status); break;
      case "goto-col": {
        const b = document.querySelector(".board"), c = b && b.querySelectorAll(".column")[+el.dataset.i];
        if (c) { activeCol = +el.dataset.i; b.scrollTo({ left: c.offsetLeft - b.offsetLeft - 16, behavior: "smooth" }); syncPills(b); document.querySelectorAll(".col-pill").forEach((p, i) => p.classList.toggle("active", i === activeCol)); }
        break;
      }
      case "att-open": openAttachment(modalFiles[+el.dataset.i]); break;
      case "att-remove": { const [f] = modalFiles.splice(+el.dataset.i, 1); if (f) removedFiles.push(f); renderAttList(); break; }
      case "delete-task": {
        const id = el.closest("form").dataset.id;
        if (!confirm("¿Eliminar esta tarea?")) return;
        try { const tk = byId(S.tasks, id); await store.remove("tasks", id); removedFiles = (tk && tk.attachments) || []; await purgeRemoved(); closeModal(); toast("Tarea eliminada"); reload("tasks"); } catch (x) { err(x); }
        break;
      }
      case "gcal": openGoogleCalendar(byId(S.tasks, el.closest("form").dataset.id)); break;
      case "ics": downloadICS(byId(S.tasks, el.closest("form").dataset.id)); break;
      case "delete-note": {
        if (!confirm("¿Eliminar esta nota?")) return;
        try { const nt = byId(S.notes, el.closest("form").dataset.id); await store.remove("notes", nt.id); removedFiles = nt.attachments || []; await purgeRemoved(); closeModal(); toast("Nota eliminada"); reload("notes"); } catch (x) { err(x); }
        break;
      }
      case "agree-to-tasks": agreementsToTasks(el.closest("form")); break;
      case "edit-member": entityModal("member", member(el.dataset.id)); break;
      case "edit-project": entityModal("project", project(el.dataset.id)); break;
      case "delete-member": case "delete-project": {
        const kind = act.split("-")[1], id = el.closest("form").dataset.id;
        if (kind === "member" && id === S.me) return toast("No puedes eliminarte a ti misma/o");
        if (!confirm(kind === "member" ? "¿Eliminar a esta persona? Sus tareas quedarán sin asignar." : "¿Eliminar este proyecto? Sus tareas quedarán sin proyecto.")) return;
        try { await store.remove(kind + "s", id); closeModal(); await reload(); } catch (x) { err(x); }
        break;
      }
      case "pick-me": setMe(el.dataset.id); break;
      case "logout": await store.signOut(); S.user = null; S.me = null; lsSet("me", ""); render(); break;
      case "enable-notif": enableNotifications(); break;
      case "install": installApp(); break;
      case "install-dismiss": lsSet("install_dismissed", "1"); render(); break;
      case "test-notif": showSystemNotification("Tablero ValClabs", "¡Las notificaciones funcionan! 🚀"); toast("Notificación enviada"); break;
    }
  });

  document.addEventListener("input", (e) => {
    const f = e.target.dataset.filter;
    if (f === "q") { S.filters.q = e.target.value; lsSet("filters", JSON.stringify(S.filters)); clearTimeout(window.__qT); window.__qT = setTimeout(() => { const pos = e.target.selectionStart; renderMain(); const i = document.querySelector('[data-filter="q"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 200); }
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches("[data-upload]")) return handleUpload(e.target);
    const f = e.target.dataset.filter;
    if (f && f !== "q") setFilter(f, e.target.value);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); if (S.notifOpen) { S.notifOpen = false; renderNotifPanel(); } } });

  document.addEventListener("submit", async (e) => {
    const form = e.target, kind = form.dataset.form;
    if (!kind) return;
    e.preventDefault();
    const fd = new FormData(form);
    try {
      if (kind === "task") return saveTask(form);
      if (kind === "note") { if (await saveNote(form)) closeModal(); return; }
      if (kind === "add-member") { await store.insert("members", { name: fd.get("name").trim(), email: fd.get("email").trim() || null, color: fd.get("color") }); toast("Persona agregada"); return reload("members"); }
      if (kind === "add-project") { await store.insert("projects", { name: fd.get("name").trim(), color: fd.get("color") }); toast("Proyecto agregado"); return reload("projects"); }
      if (kind === "edit-member") { await store.update("members", form.dataset.id, { name: fd.get("name").trim(), email: fd.get("email").trim() || null, color: fd.get("color") }); closeModal(); return reload("members"); }
      if (kind === "edit-project") { await store.update("projects", form.dataset.id, { name: fd.get("name").trim(), color: fd.get("color") }); closeModal(); return reload("projects"); }
      if (kind === "add-me") {
        const r = await store.insert("members", { name: fd.get("name").trim(), email: (S.user && S.user.email) || null, color: PALETTE[S.members.length % PALETTE.length] });
        await reload("members"); return setMe(r.id);
      }
      if (kind === "login") {
        const mode = (e.submitter && e.submitter.value) || "in";
        const email = fd.get("email").trim(), pw = fd.get("password");
        if (!email) return renderLogin("Escribe tu correo", true);
        if (mode === "link") { await store.magicLink(email); return renderLogin("Te enviamos un enlace a " + email + ". Ábrelo desde este dispositivo."); }
        if (!pw || pw.length < 6) return renderLogin("La contraseña debe tener al menos 6 caracteres", true);
        if (mode === "up") { const r = await store.signUp(email, pw); if (!r.session) return renderLogin("Cuenta creada. Revisa tu correo para confirmarla y luego entra."); }
        else await store.signIn(email, pw);
        return afterLogin();
      }
    } catch (x) {
      if (kind === "login") return renderLogin(x.message === "Invalid login credentials" ? "Correo o contraseña incorrectos" : x.message, true);
      err(x);
    }
  });

  // ---------------- inicio ----------------
  async function afterLogin() {
    S.user = await store.getUser();
    if (!S.user) return render();
    await loadAll();
    const saved = lsGet("me");
    const byEmail = S.user.email && S.members.find(m => m.email && m.email.toLowerCase() === S.user.email.toLowerCase());
    if (byEmail) return setMe(byEmail.id);
    if (saved && member(saved)) return setMe(saved);
    render();
  }

  async function start() {
    registerSW();
    try {
      await store.init();
      if (store.mode === "cloud") {
        store.onAuth(ev => { if (ev === "SIGNED_IN" && !S.user) afterLogin(); });
        await afterLogin();
      } else {
        S.user = { email: "" };
        await loadAll();
        const saved = lsGet("me");
        if (saved && member(saved)) setMe(saved); else render();
      }
    } catch (e) {
      $app.innerHTML = `<div class="auth"><div class="auth-card"><img class="logo" src="assets/logo.png" alt="" /><h1>No se pudo conectar</h1><p class="auth-msg err">${esc(e.message || e)}</p><p class="auth-msg">Revisa config.js y que hayas ejecutado supabase/schema.sql.</p></div></div>`;
      return;
    }
    // Cambios en tiempo real (otros dispositivos). Los modales viven fuera de #app, así que no se pierden.
    store.onChange(table => reload(table));
    setInterval(checkReminders, 30000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.me) { reload(); checkReminders(); } });
  }
  start();
})();
