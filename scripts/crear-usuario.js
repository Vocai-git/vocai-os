/* ============================================================
   VOCAI OS — Crear una cuenta del equipo
   Supabase Auth con email + contraseña, sin confirmación por mail.
   Uso: node scripts/crear-usuario.js <email> <contraseña> <nombre>
   ============================================================ */

require('dotenv').config();
const { supabase } = require('../config/supabase');

(async () => {
  const [email, password, nombre] = process.argv.slice(2);
  if (!email || !password || !nombre) {
    console.error('Uso: node scripts/crear-usuario.js <email> <contraseña> <nombre>');
    process.exit(1);
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nombre },
  });
  if (error) {
    console.error('No se pudo crear:', error.message);
    process.exit(1);
  }
  console.log(`Cuenta creada: ${data.user.email} (${nombre})`);
})();
