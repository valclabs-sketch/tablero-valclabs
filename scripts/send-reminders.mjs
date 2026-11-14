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

// 2) Notificaciones nuevas de la app (asignaciones, cambios) de los últimos 15 min que no se han leído
const since = new Date(Date.now() - 15 * 60000).toISOString();
const { data: notifs } = await sb.from("notifications").select("*").gte("created_at", since).eq("read", false).not("text", "like", "⏰%");
for (const n of notifs || []) await pushTo(n.member_id, { title: "Tablero ValClabs", body: n.text, tag: n.id });

console.log(`Listo: ${due?.length || 0} recordatorios, ${notifs?.length || 0} avisos.`);
