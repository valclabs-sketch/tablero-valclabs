// Capa de datos: "local" (localStorage) o "cloud" (Supabase, compartido por el equipo)
(function () {
  const TABLES = ["members", "projects", "tasks", "notes", "notifications"];
  const cfg = window.TABLERO_CONFIG || {};
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const nowIso = () => new Date().toISOString();

  // ---------------- LOCAL ----------------
  function LocalStore() {
    const KEY = "tablero_valclabs_v1";
    const listeners = [];
    let db;

    function isoDay(offset) {
      const d = new Date(); d.setDate(d.getDate() + offset);
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
    function seed() {
      const m1 = uid(), m2 = uid(), m3 = uid(), p1 = uid(), p2 = uid();
      return {
        members: [
          { id: m1, name: "Valentina", email: "", color: "#5e35b1", created_at: nowIso() },
          { id: m2, name: "Camilo", email: "", color: "#dc0c89", created_at: nowIso() },
          { id: m3, name: "Laura", email: "", color: "#9575cd", created_at: nowIso() }
        ],
        projects: [
          { id: p1, name: "Contenido", color: "#dc0c89", created_at: nowIso() },
          { id: p2, name: "Web", color: "#5e35b1", created_at: nowIso() }
        ],
        tasks: [
          { id: uid(), title: "Grabar reel de tarifas", description: "Guion listo en Drive", status: "pendiente", priority: "alta", assignee_id: m1, project_id: p1, due_date: isoDay(0), reminder_at: null, reminder_sent: false, position: 1, created_at: nowIso(), updated_at: nowIso() },
          { id: uid(), title: "Editar carrusel de Google", description: "", status: "en_progreso", priority: "media", assignee_id: m2, project_id: p1, due_date: isoDay(1), reminder_at: null, reminder_sent: false, position: 1, created_at: nowIso(), updated_at: nowIso() },
          { id: uid(), title: "Actualizar landing del curso", description: "Cambiar precios y testimonios", status: "revision", priority: "media", assignee_id: m3, project_id: p2, due_date: isoDay(3), reminder_at: null, reminder_sent: false, position: 1, created_at: nowIso(), updated_at: nowIso() },
          { id: uid(), title: "Publicar historia de reseña", description: "", status: "hecho", priority: "baja", assignee_id: m1, project_id: p1, due_date: isoDay(-1), reminder_at: null, reminder_sent: false, position: 1, created_at: nowIso(), updated_at: nowIso() }
        ],
        notes: [
          { id: uid(), title: "Reunión semanal de contenido", meeting_date: isoDay(-2), project_id: p1, attendees: [m1, m2, m3], content: "Revisamos métricas de la semana. Los reels de humor tienen mejor alcance.", agreements: "Grabar reel de tarifas — Valentina\nEditar carrusel de Google — Camilo", created_at: nowIso(), updated_at: nowIso() }
        ],
        notifications: []
      };
    }
    function load() {
      try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
      if (!db) { db = seed(); save(); }
      TABLES.forEach(t => { if (!Array.isArray(db[t])) db[t] = []; });
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
    function emit() { listeners.forEach(cb => cb()); }

    window.addEventListener("storage", e => { if (e.key === KEY) { load(); emit(); } });

    return {
      mode: "local",
      async init() { load(); },
      async getUser() { return { email: "" }; },
      async signIn() {}, async signUp() {}, async magicLink() {}, async signOut() {},
      async all(t) { return db[t].map(r => ({ ...r })); },
      async insert(t, row) {
        const r = { id: uid(), created_at: nowIso(), ...row };
        db[t].push(r); save(); emit(); return r;
      },
      async update(t, id, patch) {
        const r = db[t].find(x => x.id === id);
        if (r) Object.assign(r, patch, t === "tasks" || t === "notes" ? { updated_at: nowIso() } : {});
        save(); emit(); return r;
      },
      async remove(t, id) {
        db[t] = db[t].filter(x => x.id !== id);
        if (t === "members") db.tasks.forEach(x => { if (x.assignee_id === id) x.assignee_id = null; });
        if (t === "projects") db.tasks.forEach(x => { if (x.project_id === id) x.project_id = null; });
        save(); emit();
      },
      async savePush() {},
      async uploadFile(file) {
        if (file.size > 1.5 * 1024 * 1024) throw new Error("En modo local el máximo es 1,5 MB por archivo (con Supabase: 50 MB)");
        const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
        return { name: file.name, size: file.size, type: file.type, path: uid(), data };
      },
      async fileUrl(att) { return att.data; },
      async deleteFile() {},
      onChange(cb) { listeners.push(cb); },
      resetDemo() { localStorage.removeItem(KEY); load(); emit(); }
    };
  }

  // ---------------- CLOUD (Supabase) ----------------
  function CloudStore() {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    const listeners = [];
    let channel = null;
    const emit = (table) => listeners.forEach(cb => cb(table));
    const check = ({ data, error }) => { if (error) throw error; return data; };

    function subscribe() {
      if (channel) return;
      channel = sb.channel("tablero");
      TABLES.forEach(t => channel.on("postgres_changes", { event: "*", schema: "public", table: t }, () => emit(t)));
      channel.subscribe();
    }

    return {
      mode: "cloud",
      client: sb,
      async init() {},
      async getUser() {
        const { data } = await sb.auth.getSession();
        const u = data.session && data.session.user;
        if (u) subscribe();
        return u || null;
      },
      async signIn(email, password) { check(await sb.auth.signInWithPassword({ email, password })); },
      async signUp(email, password) { return check(await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split("#")[0] } })); },
      async magicLink(email) { check(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split("#")[0] } })); },
      async signOut() { await sb.auth.signOut(); },
      onAuth(cb) { sb.auth.onAuthStateChange((ev) => cb(ev)); },
      async all(t) {
        let q = sb.from(t).select("*");
        if (t === "notifications") q = q.order("created_at", { ascending: false }).limit(200);
        return check(await q);
      },
      async insert(t, row) { return check(await sb.from(t).insert(row).select().single()); },
      async update(t, id, patch) {
        if (t === "tasks" || t === "notes") patch = { ...patch, updated_at: nowIso() };
        return check(await sb.from(t).update(patch).eq("id", id).select().single());
      },
      async remove(t, id) { check(await sb.from(t).delete().eq("id", id)); },
      async savePush(memberId, sub) {
        const json = sub.toJSON();
        check(await sb.from("push_subscriptions").upsert({ member_id: memberId, endpoint: json.endpoint, subscription: json }, { onConflict: "endpoint" }));
      },
      async uploadFile(file) {
        if (file.size > 50 * 1024 * 1024) throw new Error("El archivo supera 50 MB");
        const safe = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "_");
        const path = new Date().toISOString().slice(0, 7) + "/" + uid() + "-" + safe;
        check(await sb.storage.from("adjuntos").upload(path, file, { contentType: file.type || "application/octet-stream" }));
        return { name: file.name, size: file.size, type: file.type, path };
      },
      async fileUrl(att) {
        const data = check(await sb.storage.from("adjuntos").createSignedUrl(att.path, 3600));
        return data.signedUrl;
      },
      async deleteFile(att) { await sb.storage.from("adjuntos").remove([att.path]); },
      onChange(cb) { listeners.push(cb); }
    };
  }

  const useCloud = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase;
  window.TableroStore = useCloud ? CloudStore() : LocalStore();
})();
