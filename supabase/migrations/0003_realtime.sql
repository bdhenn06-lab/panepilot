-- Enable realtime change events on the shared pipeline state so teammates'
-- status/note/sequence updates appear live instead of behind a Refresh button.
-- RLS still applies to the change stream (Supabase Realtime enforces it for
-- postgres_changes on RLS-enabled tables).

alter publication supabase_realtime add table public.prospect_state;
