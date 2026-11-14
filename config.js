// =========================================================
//  Configuración del Tablero ValClabs
//  Si SUPABASE_URL está vacío, el tablero funciona en "modo local"
//  (los datos se guardan solo en este navegador, útil para probar).
//  Cuando lo llenes, todo el equipo comparte el mismo tablero.
// =========================================================
window.TABLERO_CONFIG = {
  SUPABASE_URL: "https://dzohzksjphfgmwefeqyy.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6b2h6a3NqcGhmZ213ZWZlcXl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2MTI4NDYsImV4cCI6MjExMDE4ODg0Nn0.tbQDJd-34QRg_iuEj71LwBpyK4UrVxqg2vv9Il1Bx7k", // clave pública (anon)
  VAPID_PUBLIC_KEY: "BN7buYYEoiE2lYSwSrBjLhtH69_x-FyS9Zp9mv8QmywS_3LF0Hpq9LI0nDEgFHOsinZahmaXfIftqVmcWhIBnyU"     // para notificaciones push en el celular (ver README)
};
