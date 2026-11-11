-- Prepared November 11, 2026. Apply to the overtime Supabase project
-- hvihhsrhoqbbhkobayhx, NOT to OurRoster or any other database.
-- Deploy BEFORE publishing the matching website change.
-- No officer row or history is modified by this migration.
-- Each function checks the actual signed-in user's admin role.
--
-- IMPORTANT: department seniority is a separate shared table and is not
-- automatically renamed by this crew-specific operation.
--
-- ALPHA crew. Requires the existing officer, list_state, role and audit/undo infrastructure.
CREATE OR REPLACE FUNCTION public.alpha_rename_officer_auth(
  p_officer_id uuid,
  p_new_name text,
  p_expected_revision bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $rename$
DECLARE
  v_new_name text;
  v_old_name text;
  v_revision bigint;
  v_ot_before uuid[];
  v_ieas_before uuid[];
BEGIN
  IF auth.uid() IS NULL OR coalesce(public.current_user_role(),'viewer') <> 'admin' THEN
    RAISE EXCEPTION 'Only an Admin can edit officer names' USING ERRCODE='42501';
  END IF;
  IF p_officer_id IS NULL THEN
    RAISE EXCEPTION 'Select an officer' USING ERRCODE='22023';
  END IF;
  v_new_name := pg_catalog.btrim(
    pg_catalog.regexp_replace(coalesce(p_new_name,''),'[[:space:]]+',' ','g')
  );
  IF v_new_name = '' OR pg_catalog.char_length(v_new_name) > 80
       OR v_new_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Officer name must be 1 to 80 printable characters' USING ERRCODE='22023';
  END IF;

  SELECT revision INTO v_revision FROM alpha_private.list_state
  WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crew list state unavailable';
  END IF;
  IF p_expected_revision IS NOT NULL AND p_expected_revision <> v_revision THEN
    RAISE EXCEPTION 'The OT list changed. Refresh and retry the name edit'
      USING ERRCODE='40001';
  END IF;
  SELECT name INTO v_old_name FROM public.officers
  WHERE id=p_officer_id AND NOT archived FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Officer not found on this active crew' USING ERRCODE='22023';
  END IF;
  IF v_new_name = v_old_name THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'unchanged',true,'name',v_old_name);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.officers
    WHERE id <> p_officer_id
      AND pg_catalog.lower(pg_catalog.btrim(name)) = pg_catalog.lower(v_new_name)
  ) THEN
    RAISE EXCEPTION 'Another officer on this crew already has that name'
      USING ERRCODE='23505';
  END IF;
  v_ot_before := alpha_private.rotation_order();
  v_ieas_before := alpha_private.ieas_rotation_order();

  PERFORM pg_catalog.set_config('alpha.audit_action','Edit Officer Name',true);
  UPDATE public.officers
    SET name = v_new_name, updated_at = pg_catalog.now()
  WHERE id=p_officer_id AND NOT archived;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Officer was not updated';
  END IF;

  -- This operation must only change the displayed name, never position.
  -- Any unexpected order change automatically rolls the whole transaction back.
  IF v_ot_before IS DISTINCT FROM alpha_private.rotation_order()
    OR v_ieas_before IS DISTINCT FROM alpha_private.ieas_rotation_order() THEN
    RAISE EXCEPTION 'Name edit would change rotation order. No changes were saved'
      USING ERRCODE='22023';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
     'ok',true,'unchanged',false,'old_name',v_old_name,'name',v_new_name
  );
END
$rename$;

REVOKE ALL ON FUNCTION public.alpha_rename_officer_auth(uuid,text,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alpha_rename_officer_auth(uuid,text,bigint)
  TO authenticated;

-- BRAVO crew. Requires the existing officer, list_state, role and audit/undo infrastructure.
CREATE OR REPLACE FUNCTION public.bravo_rename_officer_auth(
  p_officer_id uuid,
  p_new_name text,
  p_expected_revision bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $rename$
DECLARE
  v_new_name text;
  v_old_name text;
  v_revision bigint;
  v_ot_before uuid[];
  v_ieas_before uuid[];
BEGIN
  IF auth.uid() IS NULL OR coalesce(public.current_user_role(),'viewer') <> 'admin' THEN
    RAISE EXCEPTION 'Only an Admin can edit officer names' USING ERRCODE='42501';
  END IF;
  IF p_officer_id IS NULL THEN
    RAISE EXCEPTION 'Select an officer' USING ERRCODE='22023';
  END IF;
  v_new_name := pg_catalog.btrim(
    pg_catalog.regexp_replace(coalesce(p_new_name,''),'[[:space:]]+',' ','g')
  );
  IF v_new_name = '' OR pg_catalog.char_length(v_new_name) > 80
       OR v_new_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Officer name must be 1 to 80 printable characters' USING ERRCODE='22023';
  END IF;

  SELECT revision INTO v_revision FROM bravo_private.list_state
  WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crew list state unavailable';
  END IF;
  IF p_expected_revision IS NOT NULL AND p_expected_revision <> v_revision THEN
    RAISE EXCEPTION 'The OT list changed. Refresh and retry the name edit'
      USING ERRCODE='40001';
  END IF;
  SELECT name INTO v_old_name FROM bravo.officers
  WHERE id=p_officer_id AND NOT archived FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Officer not found on this active crew' USING ERRCODE='22023';
  END IF;
  IF v_new_name = v_old_name THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'unchanged',true,'name',v_old_name);
  END IF;
  IF EXISTS (
    SELECT 1 FROM bravo.officers
    WHERE id <> p_officer_id
      AND pg_catalog.lower(pg_catalog.btrim(name)) = pg_catalog.lower(v_new_name)
  ) THEN
    RAISE EXCEPTION 'Another officer on this crew already has that name'
      USING ERRCODE='23505';
  END IF;
  v_ot_before := bravo_private.rotation_order();
  v_ieas_before := bravo_private.ieas_rotation_order();

  PERFORM pg_catalog.set_config('bravo.audit_action','Edit Officer Name',true);
  UPDATE bravo.officers
    SET name = v_new_name, updated_at = pg_catalog.now()
  WHERE id=p_officer_id AND NOT archived;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Officer was not updated';
  END IF;

  -- This operation must only change the displayed name, never position.
  -- Any unexpected order change automatically rolls the whole transaction back.
  IF v_ot_before IS DISTINCT FROM bravo_private.rotation_order()
    OR v_ieas_before IS DISTINCT FROM bravo_private.ieas_rotation_order() THEN
    RAISE EXCEPTION 'Name edit would change rotation order. No changes were saved'
      USING ERRCODE='22023';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
     'ok',true,'unchanged',false,'old_name',v_old_name,'name',v_new_name
  );
END
$rename$;

REVOKE ALL ON FUNCTION public.bravo_rename_officer_auth(uuid,text,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bravo_rename_officer_auth(uuid,text,bigint)
  TO authenticated;

-- CHARLIE crew. Requires the existing officer, list_state, role and audit/undo infrastructure.
CREATE OR REPLACE FUNCTION public.charlie_rename_officer_auth(
  p_officer_id uuid,
  p_new_name text,
  p_expected_revision bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $rename$
DECLARE
  v_new_name text;
  v_old_name text;
  v_revision bigint;
  v_ot_before uuid[];
  v_ieas_before uuid[];
BEGIN
  IF auth.uid() IS NULL OR coalesce(public.current_user_role(),'viewer') <> 'admin' THEN
    RAISE EXCEPTION 'Only an Admin can edit officer names' USING ERRCODE='42501';
  END IF;
  IF p_officer_id IS NULL THEN
    RAISE EXCEPTION 'Select an officer' USING ERRCODE='22023';
  END IF;
  v_new_name := pg_catalog.btrim(
    pg_catalog.regexp_replace(coalesce(p_new_name,''),'[[:space:]]+',' ','g')
  );
  IF v_new_name = '' OR pg_catalog.char_length(v_new_name) > 80
       OR v_new_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Officer name must be 1 to 80 printable characters' USING ERRCODE='22023';
  END IF;

  SELECT revision INTO v_revision FROM charlie_private.list_state
  WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crew list state unavailable';
  END IF;
  IF p_expected_revision IS NOT NULL AND p_expected_revision <> v_revision THEN
    RAISE EXCEPTION 'The OT list changed. Refresh and retry the name edit'
      USING ERRCODE='40001';
  END IF;
  SELECT name INTO v_old_name FROM charlie.officers
  WHERE id=p_officer_id AND NOT archived FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Officer not found on this active crew' USING ERRCODE='22023';
  END IF;
  IF v_new_name = v_old_name THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'unchanged',true,'name',v_old_name);
  END IF;
  IF EXISTS (
    SELECT 1 FROM charlie.officers
    WHERE id <> p_officer_id
      AND pg_catalog.lower(pg_catalog.btrim(name)) = pg_catalog.lower(v_new_name)
  ) THEN
    RAISE EXCEPTION 'Another officer on this crew already has that name'
      USING ERRCODE='23505';
  END IF;
  v_ot_before := charlie_private.rotation_order();
  v_ieas_before := charlie_private.ieas_rotation_order();

  PERFORM pg_catalog.set_config('charlie.audit_action','Edit Officer Name',true);
  UPDATE charlie.officers
    SET name = v_new_name, updated_at = pg_catalog.now()
  WHERE id=p_officer_id AND NOT archived;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Officer was not updated';
  END IF;

  -- This operation must only change the displayed name, never position.
  -- Any unexpected order change automatically rolls the whole transaction back.
  IF v_ot_before IS DISTINCT FROM charlie_private.rotation_order()
    OR v_ieas_before IS DISTINCT FROM charlie_private.ieas_rotation_order() THEN
    RAISE EXCEPTION 'Name edit would change rotation order. No changes were saved'
      USING ERRCODE='22023';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
     'ok',true,'unchanged',false,'old_name',v_old_name,'name',v_new_name
  );
END
$rename$;

REVOKE ALL ON FUNCTION public.charlie_rename_officer_auth(uuid,text,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charlie_rename_officer_auth(uuid,text,bigint)
  TO authenticated;

-- DELTA crew. Requires the existing officer, list_state, role and audit/undo infrastructure.
CREATE OR REPLACE FUNCTION public.delta_rename_officer_auth(
  p_officer_id uuid,
  p_new_name text,
  p_expected_revision bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $rename$
DECLARE
  v_new_name text;
  v_old_name text;
  v_revision bigint;
  v_ot_before uuid[];
  v_ieas_before uuid[];
BEGIN
  IF auth.uid() IS NULL OR coalesce(public.current_user_role(),'viewer') <> 'admin' THEN
    RAISE EXCEPTION 'Only an Admin can edit officer names' USING ERRCODE='42501';
  END IF;
  IF p_officer_id IS NULL THEN
    RAISE EXCEPTION 'Select an officer' USING ERRCODE='22023';
  END IF;
  v_new_name := pg_catalog.btrim(
    pg_catalog.regexp_replace(coalesce(p_new_name,''),'[[:space:]]+',' ','g')
  );
  IF v_new_name = '' OR pg_catalog.char_length(v_new_name) > 80
       OR v_new_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Officer name must be 1 to 80 printable characters' USING ERRCODE='22023';
  END IF;

  SELECT revision INTO v_revision FROM delta_private.list_state
  WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crew list state unavailable';
  END IF;
  IF p_expected_revision IS NOT NULL AND p_expected_revision <> v_revision THEN
    RAISE EXCEPTION 'The OT list changed. Refresh and retry the name edit'
      USING ERRCODE='40001';
  END IF;
  SELECT name INTO v_old_name FROM delta.officers
  WHERE id=p_officer_id AND NOT archived FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Officer not found on this active crew' USING ERRCODE='22023';
  END IF;
  IF v_new_name = v_old_name THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'unchanged',true,'name',v_old_name);
  END IF;
  IF EXISTS (
    SELECT 1 FROM delta.officers
    WHERE id <> p_officer_id
      AND pg_catalog.lower(pg_catalog.btrim(name)) = pg_catalog.lower(v_new_name)
  ) THEN
    RAISE EXCEPTION 'Another officer on this crew already has that name'
      USING ERRCODE='23505';
  END IF;
  v_ot_before := delta_private.rotation_order();
  v_ieas_before := delta_private.ieas_rotation_order();

  PERFORM pg_catalog.set_config('delta.audit_action','Edit Officer Name',true);
  UPDATE delta.officers
    SET name = v_new_name, updated_at = pg_catalog.now()
  WHERE id=p_officer_id AND NOT archived;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Officer was not updated';
  END IF;

  -- This operation must only change the displayed name, never position.
  -- Any unexpected order change automatically rolls the whole transaction back.
  IF v_ot_before IS DISTINCT FROM delta_private.rotation_order()
    OR v_ieas_before IS DISTINCT FROM delta_private.ieas_rotation_order() THEN
    RAISE EXCEPTION 'Name edit would change rotation order. No changes were saved'
      USING ERRCODE='22023';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
     'ok',true,'unchanged',false,'old_name',v_old_name,'name',v_new_name
  );
END
$rename$;

REVOKE ALL ON FUNCTION public.delta_rename_officer_auth(uuid,text,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delta_rename_officer_auth(uuid,text,bigint)
  TO authenticated;
