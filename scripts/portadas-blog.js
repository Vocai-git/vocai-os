/* Genera la portada de los posts del blog que no tienen cover_image.
   Uso: node scripts/portadas-blog.js
   Mismo motor que el endpoint POST /api/marketing-web/posts/:id/portada. */

require('dotenv').config();
const path = require('path');
const os = require('os');
const { supabase } = require('../config/supabase');
const { generarImagen } = require('../config/gemini');
const storage = require('../config/storage');

function promptPortada(post) {
  const tema = [post.titulo, post.excerpt].filter(Boolean).join('. ');
  return `Editorial blog cover illustration for a Spanish tech company article about: "${tema}".
Modern premium 3D editorial style. Scene must match the article topic literally
(if it is about AI/automation/software: digital scenes, screens, interfaces, devices;
if it is about a recording studio: microphones, cameras, studio lights; never change domain).
Deep navy blue background (#141d35), electric blue (#2979FF) and coral (#FF6B6B) accent
lighting, subtle tech atmosphere, cinematic soft light, high detail.
ABSOLUTELY NO text, no letters, no words, no logos, no watermarks anywhere in the image.
Clean 16:9 horizontal composition with clear focal point.`;
}

(async () => {
  const { data: posts, error } = await supabase
    .from('blog_posts').select('*').is('cover_image', null);
  if (error) { console.error(error.message); process.exit(1); }
  console.log(`${posts.length} posts sin portada.`);

  for (const post of posts) {
    try {
      console.log(`→ Generando portada: ${post.slug}`);
      const archivo = `portada-${post.slug}-${Date.now()}.png`;
      const tmpPath = path.join(os.tmpdir(), archivo);
      await generarImagen(promptPortada(post), tmpPath, '16:9');
      await storage.subir(tmpPath, `blog/${archivo}`);
      const url = storage.urlPublica(`blog/${archivo}`);
      await supabase.from('blog_posts')
        .update({ cover_image: url, updated_at: new Date().toISOString() })
        .eq('id', post.id);
      console.log(`  OK: ${url}`);
    } catch (err) {
      console.error(`  ERROR en ${post.slug}: ${err.message}`);
    }
  }
})();
