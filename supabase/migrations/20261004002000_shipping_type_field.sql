-- REVIEW REQUIRED: adds Shipping type; apply after the shipping editor-properties migration.
-- No tables or saved templates are replaced. Do not execute against production without approval.
begin;
create or replace function public.tenh_shipping_templates_valid(p_templates jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare t jsonb;e jsonb;r jsonb;k text;n text;ids text[]:='{}';names text[]:='{}';element_ids text[];joined text;paper_width numeric;paper_height numeric;
begin
 if jsonb_typeof(p_templates) is distinct from 'array' or jsonb_array_length(p_templates)>20 or octet_length(p_templates::text)>65536 then raise exception 'Save up to 20 templates within 64 KiB.';end if;
 for t in select value from jsonb_array_elements(p_templates) loop
  if jsonb_typeof(t) is distinct from 'object' or jsonb_typeof(t->'id') is distinct from 'string' or (t->>'id')!~'^[a-zA-Z0-9_-]{1,80}$' or (t->>'id')=any(ids) then raise exception 'Invalid template identity.';end if;
  ids:=array_append(ids,t->>'id');
  if jsonb_typeof(t->'name') is distinct from 'string' then raise exception 'Enter a template name.';end if;
  n:=t->>'name';k:=lower(normalize(n,NFKC));
  if length(n)<1 or length(n)>60 or n<>regexp_replace(btrim(n),'\s+',' ','g') or n~'[[:cntrl:]]' or k=any(names) then raise exception 'Use a unique template name from 1 to 60 characters.';end if;
  names:=array_append(names,k);
  if jsonb_typeof(t->'revision') is distinct from 'number' or (t->>'revision')!~'^[0-9]+$' or (t->>'revision')::numeric>9007199254740991 then raise exception 'Invalid template revision.';end if;
  if t?'needsReview' and jsonb_typeof(t->'needsReview') is distinct from 'boolean' then raise exception 'Invalid template review state.';end if;
  if jsonb_typeof(t->'layout') is distinct from 'object' or t->'layout'->'version' is distinct from '1'::jsonb or jsonb_typeof(t->'layout'->'size') is distinct from 'string' or t->'layout'->>'size' not in ('80x50','100x100','100x150') or jsonb_typeof(t->'layout'->'enabled') is distinct from 'boolean' or jsonb_typeof(t->'layout'->'elements') is distinct from 'array' then raise exception 'Invalid template layout.';end if;
  paper_width:=split_part(t->'layout'->>'size','x',1)::numeric;paper_height:=split_part(t->'layout'->>'size','x',2)::numeric;
  if jsonb_array_length(t->'layout'->'elements')>40 then raise exception 'A design supports up to 40 elements.';end if;
  element_ids:='{}';
  for e in select value from jsonb_array_elements(t->'layout'->'elements') loop
   if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'id') is distinct from 'string' or length(e->>'id')>80 or (e->>'id')=any(element_ids) or e->>'field' is null or e->>'field' not in ('storeName','storePhone','storeAddress','customerName','customerPhone','customerAddress','orderNumber','barcode','qr','total','payment','itemCount','tracking','shippingType','date','logo','text','line') then raise exception 'Invalid shipping element.';end if;
   element_ids:=array_append(element_ids,e->>'id');
   foreach k in array array['x','y','width','height','fontSize'] loop
    if jsonb_typeof(e->k) is distinct from 'number' then raise exception 'Invalid element geometry.';end if;
   end loop;
   if (e->>'x')::numeric<0 or (e->>'y')::numeric<0 or (e->>'width')::numeric<2 or (e->>'height')::numeric<1 or (e->>'x')::numeric+(e->>'width')::numeric>100.01 or (e->>'y')::numeric+(e->>'height')::numeric>100.01 or (e->>'fontSize')::numeric not between 6 and 36 or jsonb_typeof(e->'bold') is distinct from 'boolean' or e->>'align' is null or e->>'align' not in ('left','center','right') or jsonb_typeof(e->'text') is distinct from 'string' or (select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0) from regexp_split_to_table(e->>'text','') ch)>300 then raise exception 'Keep elements inside the label and text under 300 characters.';end if;
   -- Runtime order-link density is checked by the authorized app and print guard;
   -- SQL also requires a physical square and the smallest possible QR quiet-zone footprint.
   if e->>'field'='qr' and (least((e->>'width')::numeric*paper_width,(e->>'height')::numeric*paper_height)/100<14.6 or abs((e->>'width')::numeric*paper_width-(e->>'height')::numeric*paper_height)/100>0.01) then raise exception 'Order QR must be square with its clear margin.';end if;
   foreach k in array array['italic','underline','justify','hidden','locked'] loop
    if e?k and jsonb_typeof(e->k) is distinct from 'boolean' then raise exception 'Invalid text formatting.';end if;
   end loop;

   if e?'color' and (jsonb_typeof(e->'color') is distinct from 'string' or (e->>'color')!~'^#[0-9a-fA-F]{6}$') then raise exception 'Invalid text color.';end if;
   if e?'fontFamily' and (jsonb_typeof(e->'fontFamily') is distinct from 'string' or e->>'fontFamily' not in ('auto','english','khmer','arial')) then raise exception 'Unsupported font.';end if;
   foreach k in array array['padding','lineHeight','letterSpacing','rotation'] loop
    if e?k then
     if jsonb_typeof(e->k) is distinct from 'number' then raise exception 'Invalid layout style.';end if;
     if (k='padding' and (e->>k)::numeric not between 0 and 20)
       or (k='lineHeight' and (e->>k)::numeric not between 1 and 3)
       or (k='letterSpacing' and (e->>k)::numeric not between -2 and 10)
       or (k='rotation' and (e->>k)::numeric not between -180 and 180) then raise exception 'Invalid layout style.';end if;
    end if;
   end loop;
   if e->>'field'='qr' and least((e->>'width')::numeric*paper_width,(e->>'height')::numeric*paper_height)/100 - coalesce((e->>'padding')::numeric,0)*2*25.4/96 < 14.6 then raise exception 'QR padding must preserve clear margin.';end if;
   if e?'richText' then
    if e->>'field'<>'text' or jsonb_typeof(e->'richText') is distinct from 'array' or jsonb_array_length(e->'richText')>300 then raise exception 'Order fields are protected placeholders.';end if;
    joined:='';
    for r in select value from jsonb_array_elements(e->'richText') loop
     if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'text') is distinct from 'string' or exists(select 1 from jsonb_object_keys(r) key where key not in ('text','bold','italic','underline','fontSize')) then raise exception 'Invalid rich text.';end if;
     foreach k in array array['bold','italic','underline'] loop
      if r?k and jsonb_typeof(r->k) is distinct from 'boolean' then raise exception 'Invalid rich text marks.';end if;
     end loop;
     if r?'fontSize' then
      if jsonb_typeof(r->'fontSize') is distinct from 'number' then raise exception 'Invalid font size.';end if;
      if (r->>'fontSize')::numeric not between 6 and 36 then raise exception 'Use font sizes from 6 to 36 px.';end if;
     end if;
     joined:=joined||(r->>'text');
    end loop;
    if joined<>e->>'text' then raise exception 'Custom text and formatting do not match.';end if;
   end if;
  end loop;
 end loop;
 return true;
end$$;


commit;
