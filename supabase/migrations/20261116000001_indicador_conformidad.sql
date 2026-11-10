-- =============================================================================
-- Checador: indicador "Semana pasada" del tablero contado en la base
--
-- El tablero traía todas las entradas de la semana para contar quién trabajó; la API
-- devuelve como máximo 1000 filas por consulta, así que con más de ~150 personas el
-- indicador se quedaba corto. Ahora la base devuelve solo los tres números.
--
-- SECURITY INVOKER (la opción por omisión): corre con los permisos de quien la llama,
-- así que RLS decide qué ve; para otra empresa devuelve ceros.
-- =============================================================================
create function public.conformidad_semana(p_empresa uuid, p_lunes date)
returns table (trabajaron integer, conformes integer, objetadas integer)
language sql stable set search_path = '' as $$
  with z as (
    select zona_horaria from public.empresas where id = p_empresa
  ),
  trabajaron as (
    select distinct e.trabajador_id
      from public.eventos e, z
     where e.empresa_id = p_empresa
       and e.tipo = 'entrada'
       and e.hora_efectiva >= (p_lunes::timestamp at time zone z.zona_horaria)
       and e.hora_efectiva <  ((p_lunes + 7)::timestamp at time zone z.zona_horaria)
  ),
  ultima as (
    select distinct on (c.trabajador_id) c.trabajador_id, c.respuesta
      from public.conformidades c
      join trabajaron t on t.trabajador_id = c.trabajador_id
     where c.empresa_id = p_empresa and c.periodo_inicio = p_lunes
     order by c.trabajador_id, c.respondido_en desc
  )
  select (select count(*) from trabajaron)::integer,
         (count(*) filter (where respuesta = 'conforme'))::integer,
         (count(*) filter (where respuesta = 'objeta'))::integer
    from ultima
$$;
revoke execute on function public.conformidad_semana(uuid, date) from public, anon;
grant execute on function public.conformidad_semana(uuid, date) to authenticated;
