// Envía notificaciones push al celular aunque la app esté cerrada.
// Lo ejecuta GitHub Actions cada 15 minutos (.github/workflows/recordatorios.yml).
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, SITE_URL } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.log("Faltan secretos (SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY). Nada que hacer.");
  process.exit(0);
}
webpush.setVapidDetails("mailto:avisos@valclabs.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const url = SITE_URL || "./";

async function pushTo(memberId, payload) {
  const { data: subs } = await sb.from("push_subscriptions").select("*").eq("member_id", memberId);
  for (const s of subs || []) {
    try { await webpush.sendNotification(s.subscription, JSON.stringify({ ...payload, url })); }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await sb.from("push_subscriptions").delete().eq("id", s.id);
      else console.warn("push error", e.statusCode, e.body);
    }
  }
}

// 1) Recordatorios vencidos
const nowIso = new Date().toISOString();
const { data: due, error } = await sb.from("tasks").select("*")
  .lte("reminder_at", nowIso).eq("reminder_sent", false).neq("status", "hecho").not("assignee_id", "is", null);
if (error) throw error;
for (const t of due || []) {
  const text = `⏰ Recordatorio: «${t.title}»${t.due_date ? " — vence " + t.due_date : ""}`;
  await pushTo(t.assignee_id, { title: "Recordatorio", body: t.title, tag: "rem-" + t.id });
  await sb.from("tasks").update({ reminder_sent: true }).eq("id", t.id);
  await sb.from("notifications").insert({ member_id: t.assignee_id, text, task_id: t.id });
  console.log("Recordatorio enviado:", t.title);
}

// 1b) Avisos de entrega: N días antes y el mismo día (desde las 8 a. m. hora local del equipo)
const TZ = process.env.TABLERO_TZ || "America/Bogota";
const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(new Date()).map(p => [p.type, p.value]));
const todayLocal = `${parts.year}-${parts.month}-${parts.day}`;
let dueSent = 0;
if (+parts.hour >= 8) {
  const { data: open } = await sb.from("tasks").select("*").neq("status", "hecho").not("due_date", "is", null).not("assignee_id", "is", null).gte("due_date", todayLocal);
  for (const t of open || []) {
    const days = Math.round((Date.parse(t.due_date) - Date.parse(todayLocal)) / 86400000);
    const before = t.remind_days_before == null ? 1 : t.remind_days_before;
    let patch = null, text = null, title = null;
    if (days === 0 && !t.due_warned_today) { patch = { due_warned_today: true, due_warned_before: true }; text = `📌 Hoy es la entrega de «${t.title}»`; title = "Entrega hoy"; }
    else if (before > 0 && days > 0 && days <= before && !t.due_warned_before) { patch = { due_warned_before: true }; text = `⏳ «${t.title}» se entrega ${days === 1 ? "mañana" : "en " + days + " días"}`; title = "Entrega próxima"; }
    if (!patch) continue;
    await pushTo(t.assignee_id, { title, body: text.replace(/^\S+\s/, ""), tag: "due-" + t.id });
    await sb.from("tasks").update(patch).eq("id", t.id);
    await sb.from("notifications").insert({ member_id: t.assignee_id, text, task_id: t.id });
    dueSent++;
  }
}

// 2) Notificaciones nuevas de la app (asignaciones, cambios) de los últimos 15 min que no se han leído
const since = new Date(Date.now() - 15 * 60000).toISOString();
const { data: notifs } = await sb.from("notifications").select("*").gte("created_at", since).eq("read", false).not("text", "like", "⏰%").not("text", "like", "⏳%").not("text", "like", "📌%");
for (const n of notifs || []) await pushTo(n.member_id, { title: "Tablero ValClabs", body: n.text, tag: n.id });

console.log(`Listo: ${due?.length || 0} recordatorios, ${dueSent} avisos de entrega, ${notifs?.length || 0} avisos.`);
