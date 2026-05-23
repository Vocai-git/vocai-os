/**
 * Seed del ADN completo de Ana Milici.
 * Uso: node scripts/seed-ana-milici.js
 *
 * - Busca el cliente por nombre (ILIKE 'ana milici').
 * - Hace upsert de ADN global estructurado.
 * - Crea los 3 tipos de diseño (Educativo, Autoridad, Venta) si no existen.
 */

require('dotenv').config();
const { supabase } = require('../config/supabase');

const CLIENTE_NOMBRE = 'Ana Milici';

const ADN_GLOBAL = {
  paleta_hex_estructurada: {
    fondo: '#F8F6F3',
    primario: '#192750',
    secundario: '#82A077',
    acento: '#DFC099'
  },
  tipografias_primaria: 'Lora serif (protagonista)',
  tipografias_secundaria: 'Montserrat sans-serif (secundaria)',
  formato_export: '1080x1350px (4:5 Instagram)',
  reglas_globales: 'Todos los slides mantienen el mismo fondo crema #F8F6F3. Los 3 tipos conviven en el grid porque comparten paleta y tipografías. Formato 4:5.',
  errores_frecuentes: 'Gemini tiende a duplicar palabras en español (ej "todo todo"), omitir puntos finales, reinterpretar el isotipo con forma incorrecta, usar sans-serif cuando pediste serif. Corregir siempre.'
};

const TIPOS = [
  {
    nombre: 'Educativo',
    descripcion_corta: 'Explicaciones hormonales, mecanismos fisiológicos, mitos vs. realidad, signos de alerta. Contenido pedagógico.',
    referencias_esteticas: 'Goop, manuales médicos ilustrados premium, libros de botánica de lujo',
    sensacion: 'Libro ilustrado de medicina integrativa. Pedagógico, cálido, artesanal, con alma.',
    adn_visual: 'Fondo crema limpio #F8F6F3. Ilustración central estilo line art elegante en azul medianoche #192750 con acuarela suave verde salvia #82A077. Dots dorados #DFC099 esparcidos alrededor de la ilustración. Numeral decorativo (ej "01") en verde salvia opaco al 25% de opacidad, posicionado en esquina superior izquierda como watermark oversized. Titular en Lora Bold azul medianoche centrado en la parte inferior. Cita del paciente en Lora Regular debajo del titular. Filete dorado fino horizontal como divisor. Nota científica en italic verde salvia (NO azul) como cierre al pie. TODO en serif Lora, sin sans-serif. Sin isotipo. Composición centrada vertical con la ilustración en mitad superior y texto en mitad inferior.',
    prompt_positivo: 'Editorial medical book style, centered vertical composition, line art illustration with watercolor wash, serif typography throughout, elegant and pedagogical, cream paper feel',
    prompt_negativo: 'No photographs of people, no sans-serif fonts, no bright colors outside palette, no isotype or logo visible, no modern flat illustrations, no icons',
    posicion_logo: 'nunca',
    orden: 0
  },
  {
    nombre: 'Autoridad',
    descripcion_corta: 'Storytelling de la doctora, método, reflexiones, casos clínicos narrados. Contenido que humaniza y posiciona.',
    referencias_esteticas: 'Portada de revista Kinfolk, NYT Magazine, Goop editorial',
    sensacion: 'Revista premium de medicina integrativa. Editorial, sofisticado, silenciosamente autoritativo.',
    adn_visual: 'Fondo crema limpio #F8F6F3. Tipografía Lora serif bold MASIVA como protagonista absoluta, ocupando la mitad superior del slide en aproximadamente 4 líneas. Highlight lavanda #C5BFD9 sobre UNA palabra clave del titular (recurso distintivo). Subtítulo en Lora italic verde salvia #82A077 entre paréntesis debajo del titular. Isotipo de la marca visible en la mitad inferior (completo, no como watermark). Handle "@doc.anamilici" en Lora italic azul medianoche al pie. Flecha de swipe verde salvia abajo a la derecha. Sin ilustraciones. Sin numerales. Composición vertical equilibrada: texto grande arriba, isotipo en medio, handle y flecha abajo.',
    prompt_positivo: 'Magazine cover style, massive serif typography as hero, editorial silence, premium magazine feel, Kinfolk / NYT Magazine aesthetic',
    prompt_negativo: 'No illustrations, no numerals, no sans-serif except for small details, no photographs, no decorative elements beyond the lavender highlight',
    posicion_logo: 'todos',
    orden: 1
  },
  {
    nombre: 'Venta',
    descripcion_corta: 'Presentación del programa, CTAs, descubrimientos, cierres de oferta, resultados. Contenido que empuja a la acción.',
    referencias_esteticas: 'Campañas de La Mer, Estée Lauder, magazine spreads de lujo',
    sensacion: 'Cartel premium editorial. Directo, asertivo, confident, con autoridad silenciosa.',
    adn_visual: 'Fondo crema limpio #F8F6F3. Isotipo de marca como watermark muy sutil al 8% de opacidad cortado a la derecha (elemento distintivo del tipo). Eyebrow "DESCUBRIMIENTO 01" en Montserrat Bold letter-spaced, color azul medianoche #192750 o verde salvia #82A077. Filete dorado #DFC099 fino horizontal como divisor debajo del eyebrow. Titular en Lora Bold MASIVO azul medianoche (dos líneas), alineado a la IZQUIERDA. Cita del paciente en Lora italic (voz del paciente). Dot dorado pequeño como separador visual. Explicación médica en Lora regular azul medianoche (voz de la doctora). Barra dorada gruesa horizontal en el borde inferior como cierre. Sin ilustraciones. Sin numerales oversized. Composición asimétrica izquierda-derecha con el watermark del isotipo balanceando a la derecha.',
    prompt_positivo: 'Luxury campaign poster style, La Mer / Estée Lauder aesthetic, asymmetric left-aligned composition, confident and premium, watermark balance',
    prompt_negativo: 'No centered composition, no illustrations, no oversized numerals, no photographs of people, no sans-serif except for the eyebrow, no additional decorative elements',
    posicion_logo: 'watermark',
    orden: 2
  }
];

async function main() {
  console.log('🌱 Seed Ana Milici\n');

  // 1. Buscar cliente
  const { data: cliente, error: clientErr } = await supabase
    .from('clients')
    .select('id, nombre')
    .ilike('nombre', `%${CLIENTE_NOMBRE}%`)
    .single();

  if (clientErr || !cliente) {
    console.error(`❌ Cliente no encontrado con nombre tipo "${CLIENTE_NOMBRE}"`);
    console.error('   Asegurate que el cliente exista en la tabla clients.');
    process.exit(1);
  }
  console.log(`✅ Cliente: ${cliente.nombre} (${cliente.id})`);

  // 2. Upsert ADN global
  const { error: adnErr } = await supabase
    .from('clientes_adn_visual')
    .upsert({
      cliente_id: cliente.id,
      ...ADN_GLOBAL
    }, { onConflict: 'cliente_id' });

  if (adnErr) {
    console.error('❌ Error al actualizar ADN global:', adnErr.message);
    process.exit(1);
  }
  console.log('✅ ADN global actualizado (paleta estructurada, tipografías, reglas)');

  // 3. Tipos de diseño (idempotente por nombre)
  const { data: existentes } = await supabase
    .from('clientes_tipos_diseno')
    .select('id, nombre')
    .eq('cliente_id', cliente.id);

  const existentesMap = new Map((existentes || []).map(t => [t.nombre.toLowerCase(), t.id]));

  for (const t of TIPOS) {
    const existente = existentesMap.get(t.nombre.toLowerCase());
    if (existente) {
      const { error } = await supabase
        .from('clientes_tipos_diseno')
        .update(t)
        .eq('id', existente);
      if (error) console.error(`  ⚠️  Error al actualizar "${t.nombre}":`, error.message);
      else console.log(`  ↻ ${t.nombre} actualizado`);
    } else {
      const { error } = await supabase
        .from('clientes_tipos_diseno')
        .insert({ cliente_id: cliente.id, ...t });
      if (error) console.error(`  ⚠️  Error al crear "${t.nombre}":`, error.message);
      else console.log(`  ✚ ${t.nombre} creado`);
    }
  }

  console.log('\n🎉 Seed completado.');
}

main().catch(err => {
  console.error('❌', err);
  process.exit(1);
});
