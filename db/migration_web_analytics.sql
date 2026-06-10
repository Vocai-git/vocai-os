-- ============================================================
-- VOCAI OS — Migración: Analítica web propia (vocai.es)
-- Ejecutar en el SQL Editor de Supabase.
-- Tracker cookieless: la web manda visitas y eventos a
-- /api/track de vocai-os y caen acá. Sin Umami ni terceros.
-- ============================================================

CREATE TABLE IF NOT EXISTS web_hits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts TIMESTAMPTZ DEFAULT NOW(),
  tipo TEXT NOT NULL DEFAULT 'pageview' CHECK (tipo IN ('pageview','evento')),
  evento TEXT,          -- click-whatsapp · reserva-estudio · contacto-enviado · click-instagram
  origen TEXT,          -- hero · navbar · casos · contacto · ...
  path TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  dispositivo TEXT,     -- movil | desktop
  visitante TEXT        -- hash anónimo por día (ip+navegador), sin datos personales
);

CREATE INDEX IF NOT EXISTS web_hits_ts_idx ON web_hits (ts);

ALTER TABLE web_hits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON web_hits FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Resumen agregado de un rango de fechas (lo consume el módulo Analítica).
CREATE OR REPLACE FUNCTION web_resumen(p_desde DATE, p_hasta DATE)
RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'visitas', (SELECT count(*) FROM web_hits
                WHERE tipo = 'pageview' AND ts >= p_desde AND ts < p_hasta),
    'visitantes', (SELECT count(DISTINCT visitante) FROM web_hits
                   WHERE tipo = 'pageview' AND ts >= p_desde AND ts < p_hasta),
    'eventos', (SELECT coalesce(jsonb_object_agg(evento, n), '{}'::jsonb)
                FROM (SELECT evento, count(*) n FROM web_hits
                      WHERE tipo = 'evento' AND ts >= p_desde AND ts < p_hasta
                      GROUP BY evento) e),
    'origenes', (SELECT coalesce(jsonb_object_agg(k, n), '{}'::jsonb)
                 FROM (SELECT evento || '·' || coalesce(nullif(origen, ''), 'sin-origen') k, count(*) n
                       FROM web_hits
                       WHERE tipo = 'evento' AND ts >= p_desde AND ts < p_hasta
                       GROUP BY 1) o),
    'fuentes', (SELECT coalesce(jsonb_object_agg(fuente, n), '{}'::jsonb)
                FROM (SELECT CASE
                        WHEN coalesce(utm_source, '') <> '' THEN utm_source
                        WHEN coalesce(referrer, '') <> '' THEN regexp_replace(referrer, '^https?://([^/]+).*$', '\1')
                        ELSE 'directo' END AS fuente, count(*) n
                      FROM web_hits
                      WHERE tipo = 'pageview' AND ts >= p_desde AND ts < p_hasta
                      GROUP BY 1) f),
    'por_dia', (SELECT coalesce(jsonb_object_agg(d, n), '{}'::jsonb)
                FROM (SELECT to_char(ts AT TIME ZONE 'Europe/Madrid', 'YYYY-MM-DD') d, count(*) n
                      FROM web_hits
                      WHERE tipo = 'pageview' AND ts >= p_desde AND ts < p_hasta
                      GROUP BY 1) g)
  );
$$;
