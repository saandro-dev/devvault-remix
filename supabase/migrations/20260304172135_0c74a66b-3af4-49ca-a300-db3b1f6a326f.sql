-- RPC: Get tool usage ranking (aggregated counts per tool_name)
CREATE OR REPLACE FUNCTION public.get_tool_usage_ranking()
RETURNS TABLE(tool_name TEXT, count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT vue.tool_name, COUNT(*)::BIGINT AS count
  FROM vault_usage_events vue
  GROUP BY vue.tool_name
  ORDER BY count DESC;
END;
$$;

-- RPC: Get top searches (last 30 days, grouped by query_text)
CREATE OR REPLACE FUNCTION public.get_top_searches(p_limit INT DEFAULT 20)
RETURNS TABLE(query_text TEXT, count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT vue.query_text, COUNT(*)::BIGINT AS count
  FROM vault_usage_events vue
  WHERE vue.query_text IS NOT NULL
    AND vue.query_text != ''
    AND vue.created_at >= now() - INTERVAL '30 days'
  GROUP BY vue.query_text
  ORDER BY count DESC
  LIMIT p_limit;
END;
$$;