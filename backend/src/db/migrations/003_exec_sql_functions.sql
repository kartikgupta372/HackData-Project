CREATE OR REPLACE FUNCTION exec_sql(query text, params text[] DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE format(
    'SELECT jsonb_agg(row_to_json(t)) FROM (%s) t',
    query
  )
  USING params[1], params[2], params[3], params[4], params[5],
        params[6], params[7], params[8], params[9], params[10]
  INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'exec_sql error: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION exec_sql_write(query text, params text[] DEFAULT '{}')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE query
  USING params[1], params[2], params[3], params[4], params[5],
        params[6], params[7], params[8], params[9], params[10];
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'exec_sql_write error: %', SQLERRM;
END;
$$;

REVOKE EXECUTE ON FUNCTION exec_sql(text, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION exec_sql_write(text, text[]) FROM PUBLIC;
