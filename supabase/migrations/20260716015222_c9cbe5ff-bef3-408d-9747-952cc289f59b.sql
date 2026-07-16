CREATE OR REPLACE FUNCTION public.get_dashboard_stats(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_since30 timestamptz := now() - interval '30 days';
  v_since7  timestamptz := now() - interval '7 days';
  v_month_start timestamptz := date_trunc('month', now());
BEGIN
  IF NOT public.is_org_member(auth.uid(), _org_id) THEN
    RAISE EXCEPTION 'not a member of org';
  END IF;

  WITH doc_stats AS (
    SELECT
      count(*)::bigint AS total,
      count(*) FILTER (WHERE status='pending')::bigint    AS pending,
      count(*) FILTER (WHERE status='processing')::bigint AS processing,
      count(*) FILTER (WHERE status='processed')::bigint  AS processed,
      count(*) FILTER (WHERE status='failed')::bigint     AS failed,
      count(*) FILTER (WHERE created_at >= v_since30)::bigint AS last30,
      count(*) FILTER (WHERE created_at >= v_since7)::bigint  AS last7
    FROM public.documents
    WHERE org_id = _org_id AND deleted_at IS NULL
  ),
  by_type AS (
    SELECT coalesce(dt.name, 'Sem tipo') AS name, count(*)::bigint AS count
    FROM public.documents d
    LEFT JOIN public.document_types dt ON dt.id = d.document_type_id
    WHERE d.org_id = _org_id AND d.deleted_at IS NULL
    GROUP BY 1 ORDER BY 2 DESC LIMIT 6
  ),
  by_company AS (
    SELECT coalesce(c.name, 'Sem empresa') AS name, count(*)::bigint AS count
    FROM public.documents d
    LEFT JOIN public.companies c ON c.id = d.company_id
    WHERE d.org_id = _org_id AND d.deleted_at IS NULL
    GROUP BY 1 ORDER BY 2 DESC LIMIT 6
  ),
  ai_stats AS (
    SELECT
      coalesce(sum(cost_brl), 0)::numeric AS cost_month,
      count(*)::bigint AS calls_month
    FROM public.ai_usage_logs
    WHERE org_id = _org_id AND created_at >= v_month_start
  ),
  companies_count AS (SELECT count(*)::bigint AS n FROM public.companies WHERE org_id=_org_id),
  types_count AS (SELECT count(*)::bigint AS n FROM public.document_types WHERE org_id=_org_id)
  SELECT jsonb_build_object(
    'total', d.total, 'pending', d.pending, 'processing', d.processing,
    'processed', d.processed, 'failed', d.failed,
    'last30', d.last30, 'last7', d.last7,
    'ai_cost_month', a.cost_month, 'ai_calls_month', a.calls_month,
    'companies_count', (SELECT n FROM companies_count),
    'types_count', (SELECT n FROM types_count),
    'by_type', coalesce((SELECT jsonb_agg(jsonb_build_object('name',name,'count',count)) FROM by_type), '[]'::jsonb),
    'by_company', coalesce((SELECT jsonb_agg(jsonb_build_object('name',name,'count',count)) FROM by_company), '[]'::jsonb)
  ) INTO v_result
  FROM doc_stats d, ai_stats a;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_documents_org_created ON public.documents(org_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_org_status ON public.documents(org_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_org_type ON public.documents(org_id, document_type_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_org_company ON public.documents(org_id, company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ai_usage_org_created ON public.ai_usage_logs(org_id, created_at DESC);