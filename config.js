// =========================================================
//  Configuración del Tablero ValClabs
//  Si SUPABASE_URL está vacío, el tablero funciona en "modo local"
//  (los datos se guardan solo en este navegador, útil para probar).
//  Cuando lo llenes, todo el equipo comparte el mismo tablero.
// =========================================================
window.TABLERO_CONFIG = {
  SUPABASE_URL: "",        // ej: "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: "",   // Supabase > Project Settings > API > anon public
  VAPID_PUBLIC_KEY: "BN7buYYEoiE2lYSwSrBjLhtH69_x-FyS9Zp9mv8QmywS_3LF0Hpq9LI0nDEgFHOsinZahmaXfIftqVmcWhIBnyU"     // para notificaciones push en el celular (ver README)
};
