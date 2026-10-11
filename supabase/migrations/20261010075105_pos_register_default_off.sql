-- Existing branches retain their saved register requirement.
alter table public.branch_pos_settings alter column require_open_register set default false;
