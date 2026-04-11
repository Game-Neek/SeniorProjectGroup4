

# Plan: Generate Standalone Supabase + AWS Migration Kit

## Summary
Generate two production-ready files in `/mnt/documents/` that contain everything needed to recreate this project's backend on a standalone Supabase instance and deploy the frontend to AWS.

## What will be produced

### File 1: `agentb-migration-guide.md`
A structured, step-by-step migration guide covering:

1. **Prerequisites** — Supabase CLI, AWS CLI, Node.js, domain setup
2. **Supabase project creation** — new project on supabase.com
3. **Database setup** — all 37 migration files listed in execution order with full SQL (concatenated from `supabase/migrations/`)
4. **Storage buckets** — recreate `syllabi` and `assignments` buckets with RLS policies
5. **Database functions & triggers** — `handle_new_user`, `update_updated_at_column`, `anonymize_old_learning_events`, `backfill_daily_metrics`
6. **Secrets configuration** — `LOVABLE_API_KEY` replacement strategy (swap to direct OpenAI/Google AI keys), `WMATA_API_KEY`
7. **Edge functions deployment** — all 13 functions with notes on which use the Lovable AI Gateway (needs URL swap to direct provider endpoints)
8. **Frontend environment variables** — update `.env` with new Supabase URL and anon key
9. **AWS deployment** — S3 bucket creation, CloudFront distribution, `npm run build`, sync to S3
10. **DNS & SSL** — Route 53 or custom domain setup with ACM certificate
11. **Post-migration checklist** — auth callback URLs, CORS origins, cron jobs (pg_cron for transit-feed)

### File 2: `agentb-full-backend-dump.txt`
Raw dump of all backend code for copy-paste migration:
- All 37 SQL migration files (full contents)
- All 13 edge function `index.ts` files (full contents)
- `supabase/config.toml`
- TypeScript types from `src/integrations/supabase/types.ts`
- `package.json` (for frontend dependency reference)

## Critical migration notes to document

**AI Gateway swap**: 6 edge functions call `https://ai.gateway.lovable.dev/v1/chat/completions` using `LOVABLE_API_KEY`. The guide will map each to the equivalent direct API call (OpenAI or Google) and document the required secret name changes.

**Affected functions**: `agent-b-chat`, `generate-course`, `generate-rubric`, `audit-bias`, `analyze-difficulty`, `predictive-coaching`, `refine-content`

**Auth trigger**: The `handle_new_user` trigger on `auth.users` needs manual creation in the Supabase dashboard since migrations can't attach triggers to `auth` schema.

## Technical approach
- Read all 37 migration files and 13 edge functions via shell
- Concatenate into the two output files with proper formatting
- Write to `/mnt/documents/`

## Output
Two downloadable files:
- `/mnt/documents/agentb-migration-guide.md`
- `/mnt/documents/agentb-full-backend-dump.txt`

