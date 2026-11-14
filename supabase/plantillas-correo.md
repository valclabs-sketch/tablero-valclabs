# Correos en español (se aplican después de configurar SMTP propio)

Supabase solo permite cambiar las plantillas cuando el proyecto usa un servicio de correo propio.
En Supabase → Authentication → Emails → Templates → «Reset password»:

**Asunto:** Recupera tu contraseña del Tablero ValClabs

**Contenido:**
```html
<div style="font-family:Montserrat,Arial,sans-serif;max-width:480px;margin:0 auto;color:#2d1b69">
  <h2 style="color:#5e35b1">Recupera tu contraseña</h2>
  <p>Recibimos una solicitud para cambiar la contraseña de tu cuenta en el <b>Tablero ValClabs</b>.</p>
  <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#5e35b1;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Crear contraseña nueva</a></p>
  <p style="color:#6b5f8f;font-size:13px">Abre el enlace en el mismo dispositivo donde usas el tablero. Si no pediste este cambio, ignora este correo.</p>
</div>
```
