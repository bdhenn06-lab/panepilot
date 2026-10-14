begin;
-- Clients patch only fields they edited, with a conflict check for notes.
revoke insert, update on public.prospect_state from authenticated, anon;
create function public.patch_prospect(target_org uuid, target_parcel bigint, patch jsonb, expected_notes text default null)
returns public.prospect_state language plpgsql security definer set search_path=public as $$
declare current_row public.prospect_state; result public.prospect_state;
begin
  if not public.is_org_member(target_org) then raise exception 'membership required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_org::text,0));
  if not exists(select 1 from public.parcels where id=target_parcel and org_id=target_org) then
    raise exception 'parcel unavailable'; end if;
  if jsonb_typeof(patch)<>'object' or patch - array['status','touch','last_touch','due','notes'] <> '{}'::jsonb then
    raise exception 'unsupported pipeline field'; end if;
  select * into current_row from public.prospect_state where parcel_id=target_parcel for update;
  if patch ? 'notes' and expected_notes is distinct from coalesce(current_row.notes,'') then
    raise exception 'Notes changed by a teammate. Copy your draft, reload, and merge the changes.';
  end if;
  insert into public.prospect_state(parcel_id,org_id,status,touch,last_touch,due,notes,updated_by,updated_at)
    values(target_parcel,target_org,coalesce(patch->>'status',current_row.status,''),
      coalesce((patch->>'touch')::smallint,current_row.touch,0),
      case when patch?'last_touch' then (patch->>'last_touch')::date else current_row.last_touch end,
      case when patch?'due' then (patch->>'due')::date else current_row.due end,
      coalesce(patch->>'notes',current_row.notes,''),auth.uid(),now())
    on conflict(parcel_id) do update set status=excluded.status,touch=excluded.touch,
      last_touch=excluded.last_touch,due=excluded.due,notes=excluded.notes,
      updated_by=excluded.updated_by,updated_at=excluded.updated_at returning * into result;
  return result;
end $$;
revoke all on function public.patch_prospect(uuid,bigint,jsonb,text) from public,anon;
grant execute on function public.patch_prospect(uuid,bigint,jsonb,text) to authenticated;

create table public.billing_operations (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  lease_token uuid,
  lease_until timestamptz,
  checkout_session_id text,
  last_event_created bigint not null default 0
);
create table public.billing_events (id text primary key, processed_at timestamptz not null default now());
alter table public.billing_operations enable row level security;
alter table public.billing_events enable row level security;
revoke all on public.billing_operations, public.billing_events from anon,authenticated;

create function public.claim_billing_checkout(target_org uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare token uuid := gen_random_uuid();
begin
  insert into public.billing_operations(org_id) values(target_org) on conflict do nothing;
  update public.billing_operations set lease_token=token,lease_until=now()+interval '2 minutes'
    where org_id=target_org and (lease_until is null or lease_until<now());
  if not found then return null; end if;
  return token;
end $$;
create function public.release_billing_checkout(target_org uuid, token uuid, session_id text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.billing_operations set lease_token=null,lease_until=null,
    checkout_session_id=coalesce(session_id,checkout_session_id)
    where org_id=target_org and lease_token=token;
end $$;
create function public.apply_billing_event(event_id text,event_created bigint,target_org uuid,
  customer_id text,subscription_id text,new_plan text)
returns void language plpgsql security definer set search_path=public as $$
declare previous public.orgs;
begin
  select * into previous from public.orgs where id=target_org for update;
  if not found then raise exception 'workspace unavailable'; end if;
  if previous.stripe_customer_id is distinct from customer_id then raise exception 'billing customer mismatch'; end if;
  if exists(select 1 from public.billing_events where id=event_id) then return; end if;
  insert into public.billing_operations(org_id) values(target_org) on conflict do nothing;
  if event_created >= (select last_event_created from public.billing_operations where org_id=target_org) then
    -- A stale cancellation may not erase a newer subscription.
    if new_plan <> 'trial' or previous.stripe_subscription_id is null or previous.stripe_subscription_id=subscription_id then
      update public.orgs set plan=new_plan,stripe_subscription_id=subscription_id where id=target_org;
      update public.billing_operations set last_event_created=event_created where org_id=target_org;
    end if;
  end if;
  insert into public.billing_events(id) values(event_id) on conflict do nothing;
end $$;
revoke all on function public.claim_billing_checkout(uuid), public.release_billing_checkout(uuid,uuid,text),
  public.apply_billing_event(text,bigint,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_billing_checkout(uuid), public.release_billing_checkout(uuid,uuid,text),
  public.apply_billing_event(text,bigint,uuid,text,text,text) to service_role;
commit;
