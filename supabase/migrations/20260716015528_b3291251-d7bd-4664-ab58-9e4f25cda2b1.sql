CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.get_ai_audit_summary(
  _org_id uuid,
  _company text DEFAULT NULL,
  _doc_type text DEFAULT NULL,
  _search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_q text := nullif(btrim(coalesce(_search, '')), '');
  v_company text := nullif(_company, '__all__');
  v_doc_type text := nullif(_doc_type, '__all__');
BEGIN
  IF NOT public.is_org_member(auth.uid(), _org_id) THEN
    RAISE EXCEPTION 'not a member of org';
  END IF;

  WITH base AS (
    SELECT *
    FROM public.ai_usage_logs l
    WHERE l.org_id = _org_id
      AND (v_company IS NULL OR coalesce(l.company_name, '') = v_company)
      AND (v_doc_type IS NULL OR coalesce(l.document_type_name, '') = v_doc_type)
      AND (
        v_q IS NULL
        OR l.file_name ILIKE ('%' || v_q || '%')
        OR coalesce(l.company_name, '') ILIKE ('%' || v_q || '%')
        OR coalesce(l.document_type_name, '') ILIKE ('%' || v_q || '%')
      )
  ),
  totals AS (
    SELECT
      count(*)::bigint AS files,
      count(*) FILTER (WHERE success)::bigint AS success,
      count(*) FILTER (WHERE NOT success)::bigint AS failed,
      coalesce(sum(prompt_tokens), 0)::bigint AS prompt,
      coalesce(sum(completion_tokens), 0)::bigint AS completion,
      coalesce(sum(total_tokens), 0)::bigint AS total,
      coalesce(sum(cost_brl), 0)::numeric AS cost,
      count(*) FILTER (WHERE duration_ms IS NOT NULL)::bigint AS duration_count,
      coalesce(sum(duration_ms), 0)::bigint AS duration_total,
      coalesce(sum(extracted_chars), 0)::bigint AS extracted,
      coalesce(sum(corrected_chars), 0)::bigint AS corrected,
      coalesce(sum(
        CASE WHEN extracted_chars > 0
          THEN (greatest(0, extracted_chars - coalesce(corrected_chars, 0))::numeric / extracted_chars) * 100
          ELSE 0 END
      ), 0)::numeric AS accuracy_sum,
      count(*) FILTER (WHERE extracted_chars > 0)::bigint AS accuracy_count
    FROM base
  ),
  by_company AS (
    SELECT
      coalesce(company_name, '—') AS name,
      count(*)::bigint AS files,
      coalesce(sum(total_tokens), 0)::bigint AS tokens,
      coalesce(sum(cost_brl), 0)::numeric AS cost
    FROM base
    GROUP BY 1
    ORDER BY cost DESC
    LIMIT 100
  ),
  company_options AS (
    SELECT DISTINCT company_name AS name
    FROM public.ai_usage_logs
    WHERE org_id = _org_id AND company_name IS NOT NULL
    ORDER BY 1
  ),
  doc_type_options AS (
    SELECT DISTINCT document_type_name AS name
    FROM public.ai_usage_logs
    WHERE org_id = _org_id
      AND document_type_name IS NOT NULL
      AND (v_company IS NULL OR coalesce(company_name, '') = v_company)
    ORDER BY 1
  )
  SELECT jsonb_build_object(
    'totals', to_jsonb(t.*),
    'by_company', coalesce((SELECT jsonb_agg(to_jsonb(bc)) FROM by_company bc), '[]'::jsonb),
    'company_options', coalesce((SELECT jsonb_agg(name) FROM company_options), '[]'::jsonb),
    'doc_type_options', coalesce((SELECT jsonb_agg(name) FROM doc_type_options), '[]'::jsonb)
  ) INTO v_result
  FROM totals t;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_audit_summary(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_ai_audit_logs(
  _org_id uuid,
  _company text DEFAULT NULL,
  _doc_type text DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit int DEFAULT 10,
  _offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
  v_count bigint;
  v_q text := nullif(btrim(coalesce(_search, '')), '');
  v_company text := nullif(_company, '__all__');
  v_doc_type text := nullif(_doc_type, '__all__');
BEGIN
  IF NOT public.is_org_member(auth.uid(), _org_id) THEN
    RAISE EXCEPTION 'not a member of org';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.ai_usage_logs l
  WHERE l.org_id = _org_id
    AND (v_company IS NULL OR coalesce(l.company_name, '') = v_company)
    AND (v_doc_type IS NULL OR coalesce(l.document_type_name, '') = v_doc_type)
    AND (
      v_q IS NULL
      OR l.file_name ILIKE ('%' || v_q || '%')
      OR coalesce(l.company_name, '') ILIKE ('%' || v_q || '%')
      OR coalesce(l.document_type_name, '') ILIKE ('%' || v_q || '%')
    );

  SELECT coalesce(jsonb_agg(to_jsonb(sub)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT id, created_at, company_name, document_type_name, file_name, model,
           prompt_tokens, completion_tokens, total_tokens, cost_brl, duration_ms,
           corrected_chars, extracted_chars, success, error_message
    FROM public.ai_usage_logs l
    WHERE l.org_id = _org_id
      AND (v_company IS NULL OR coalesce(l.company_name, '') = v_company)
      AND (v_doc_type IS NULL OR coalesce(l.document_type_name, '') = v_doc_type)
      AND (
        v_q IS NULL
        OR l.file_name ILIKE ('%' || v_q || '%')
        OR coalesce(l.company_name, '') ILIKE ('%' || v_q || '%')
        OR coalesce(l.document_type_name, '') ILIKE ('%' || v_q || '%')
      )
    ORDER BY created_at DESC
    LIMIT greatest(1, least(_limit, 5000))
    OFFSET greatest(0, _offset)
  ) sub;

  RETURN jsonb_build_object('rows', v_rows, 'count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_audit_logs(uuid, text, text, text, int, int) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_ai_usage_org_company ON public.ai_usage_logs(org_id, company_name);
CREATE INDEX IF NOT EXISTS idx_ai_usage_org_type ON public.ai_usage_logs(org_id, document_type_name);
CREATE INDEX IF NOT EXISTS idx_ai_usage_file_trgm ON public.ai_usage_logs USING gin (file_name gin_trgm_ops);