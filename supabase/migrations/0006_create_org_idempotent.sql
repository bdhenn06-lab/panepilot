-- Make workspace creation idempotent against double-submits.
--
-- A real user double-clicked "Create workspace" and ended up with two identical
-- workspaces seconds apart. The app only ever shows their oldest membership, so
-- the duplicate was invisible but still consuming a row (and, once billing is
-- on, a plan). The client now guards this synchronously; this is the server-side
-- backstop for retries, flaky connections, and any other caller.
--
-- If the same user already created an identically-named workspace in the last
-- minute, return that one instead of making another. Creating a same-named
-- workspace later on is still allowed.

create or replace function public.create_org(org_name text, company text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org uuid;
  recent_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if org_name is null or length(trim(org_name)) = 0 then
    raise exception 'org name required';
  end if;

  select o.id into recent_org
    from public.orgs o
    join public.org_members m on m.org_id = o.id
   where m.user_id = auth.uid()
     and m.role = 'owner'
     and o.name = trim(org_name)
     and o.created_at > now() - interval '1 minute'
   order by o.created_at
   limit 1;
  if recent_org is not null then
    return recent_org;
  end if;

  insert into public.orgs (name) values (trim(org_name)) returning id into new_org;
  insert into public.org_members (org_id, user_id, role) values (new_org, auth.uid(), 'owner');
  insert into public.org_settings (org_id, company_name, home_base)
    values (new_org, coalesce(nullif(trim(company), ''), trim(org_name)), '');
  return new_org;
end;
$$;
