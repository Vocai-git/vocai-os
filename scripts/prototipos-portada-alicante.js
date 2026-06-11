/* Tres prototipos de portada para el post "VOCAI llega a Alicante",
   para definir la línea de diseño de las portadas del blog.
   Uso: node scripts/prototipos-portada-alicante.js
   Usa la foto real del estudio como imagen de referencia. */

require('dotenv').config();
const path = require('path');
const os = require('os');
const { generarImagen } = require('../config/gemini');
const storage = require('../config/storage');

const REF = path.join(__dirname, '..', '..', 'Estudio-Podcast', 'podcast vocai general.jpeg');

const BASE_RULES = `
ABSOLUTELY NO text, no letters, no words, no logos, no watermarks anywhere
(remove any neon signs with words — replace them with abstract neon shapes).
Clean 16:9 horizontal composition, editorial blog cover quality, high detail.`;

const PROTOTIPOS = [
  {
    nombre: 'prototipo-A-postal-fusion',
    prompt: `Cinematic photorealistic blog cover: the Mediterranean city of Alicante (Spain)
at golden hour seamlessly blending into a modern podcast studio interior.
LEFT SIDE: Santa Barbara castle on top of Benacantil mountain, palm trees,
the Mediterranean sea sparkling, warm golden sunset light.
RIGHT SIDE: the interior of the referenced podcast studio (glass recording booth,
warm pendant bulbs, professional microphones, navy walls with neon accent lighting)
— the city literally flows into the studio through a large open window/wall,
sunset light spilling onto the studio floor.
Warm mediterranean golds blending into deep navy blue (#141d35) with electric blue
(#2979FF) and coral (#FF6B6B) neon accents inside the studio.${BASE_RULES}`,
  },
  {
    nombre: 'prototipo-B-diorama-3d',
    prompt: `Premium 3D editorial diorama blog cover, modern stylized miniature style:
a floating island diorama of Alicante (Spain) — Benacantil mountain with Santa Barbara
castle on top, the famous Explanada de España promenade as a wavy ribbon of red, cream
and blue marble curving across the scene, stylized palm trees, small Mediterranean sea
edge with tiny waves — and at the end of the wavy promenade ribbon, a modern glass
podcast recording booth (like the referenced studio: glass walls, neon edge lighting,
professional microphone inside, warm hanging bulbs).
Deep navy blue background (#141d35), electric blue (#2979FF) and coral (#FF6B6B)
accent lighting, soft cinematic studio light, smooth 3D render, premium tech aesthetic.${BASE_RULES}`,
  },
  {
    nombre: 'prototipo-C-split-soundwave',
    prompt: `Editorial photographic split-screen blog cover, two worlds joined by sound:
LEFT HALF: real-photo style Alicante (Spain) — palm tree promenade by the Mediterranean,
Santa Barbara castle on the hill in the background, warm dusk light, city lights starting
to glow.
RIGHT HALF: the referenced podcast studio interior at night — glass recording booth,
microphones, warm pendant bulbs, navy walls with blue and purple neon.
JOINING THEM: a single glowing audio soundwave line in gradient electric blue (#2979FF)
to coral (#FF6B6B) flowing horizontally across both halves at mid-height, like a voice
travelling from the city into the studio. Subtle navy (#141d35) color grading unifying
both sides, moody premium editorial look.${BASE_RULES}`,
  },
];

(async () => {
  for (const p of PROTOTIPOS) {
    try {
      console.log(`→ Generando ${p.nombre}...`);
      const archivo = `${p.nombre}.png`;
      const tmpPath = path.join(os.tmpdir(), archivo);
      await generarImagen(p.prompt, tmpPath, '16:9', REF);
      await storage.subir(tmpPath, `blog/prototipos/${archivo}`);
      console.log(`  OK: ${storage.urlPublica(`blog/prototipos/${archivo}`)}`);
    } catch (err) {
      console.error(`  ERROR en ${p.nombre}: ${err.message}`);
    }
  }
})();
