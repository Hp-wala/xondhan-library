-- Xondhan Library Management System - Supabase schema
-- Run this whole file once in Supabase Dashboard -> SQL Editor.
-- This file includes all required tables, policies, admin checks,
-- and database functions for the library app.

-- ============ TABLES ============
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.books (
  id bigint generated always as identity primary key,
  s_no text,
  title text not null check (char_length(title) between 1 and 300),
  author text not null check (char_length(author) between 1 and 200),
  isbn text check (isbn is null or char_length(isbn) <= 20),
  category text check (category is null or char_length(category) <= 100),
  publisher text check (publisher is null or char_length(publisher) <= 200),
  price numeric(10,2) not null default 0 check (price >= 0),
  page_count int not null default 0 check (page_count >= 0),
  total_copies int not null default 1 check (total_copies >= 0 and total_copies <= 100000),
  available_copies int not null default 1 check (available_copies >= 0),
  created_at timestamptz not null default now(),
  constraint available_lte_total check (available_copies <= total_copies)
);
create index if not exists books_title_idx on public.books (lower(title));

create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  book_id bigint not null references public.books(id) on delete restrict,
  student_name text not null check (char_length(student_name) between 1 and 120),
  student_email text check (student_email is null or char_length(student_email) <= 200),
  student_phone text check (student_phone is null or char_length(student_phone) <= 20),
  issue_date date not null default current_date,
  due_date date not null,
  return_date date,
  status text not null default 'issued' check (status in ('issued','returned'))
);
create index if not exists tx_status_idx on public.transactions (status);
create index if not exists tx_book_idx on public.transactions (book_id);

create table if not exists public.stock_history (
  id bigint generated always as identity primary key,
  book_id bigint references public.books(id) on delete set null,
  book_title text not null,
  action text not null check (action in ('restock','issue','return','add','adjust')),
  quantity int not null,
  old_stock int not null,
  new_stock int not null,
  source text,
  notes text check (notes is null or char_length(notes) <= 300),
  created_at timestamptz not null default now()
);

-- ============ ADMIN CHECK ============
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ============ ROW LEVEL SECURITY ============
alter table public.admins enable row level security;
alter table public.books enable row level security;
alter table public.transactions enable row level security;
alter table public.stock_history enable row level security;

-- admins table: no client access at all (managed from SQL editor only)
drop policy if exists "books admin all" on public.books;
create policy "books admin all" on public.books
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "tx admin read" on public.transactions;
create policy "tx admin read" on public.transactions
  for select to authenticated using (public.is_admin());

drop policy if exists "stock admin read" on public.stock_history;
create policy "stock admin read" on public.stock_history
  for select to authenticated using (public.is_admin());

-- anon role gets nothing
revoke all on public.admins, public.books, public.transactions, public.stock_history from anon;

-- ============ ATOMIC OPERATIONS ============
create or replace function public.issue_book(
  p_book_id bigint,
  p_student_name text,
  p_student_email text,
  p_student_phone text,
  p_days int default 14
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book public.books%rowtype;
  v_tx_id bigint;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_days is null or p_days < 1 or p_days > 90 then raise exception 'Invalid loan period'; end if;
  if p_student_name is null or char_length(trim(p_student_name)) = 0 then
    raise exception 'Student name is required';
  end if;

  select * into v_book from public.books where id = p_book_id for update;
  if not found then raise exception 'Book not found'; end if;
  if v_book.available_copies <= 0 then raise exception 'Book is out of stock'; end if;

  update public.books set available_copies = available_copies - 1 where id = p_book_id;

  insert into public.transactions (book_id, student_name, student_email, student_phone, due_date)
  values (p_book_id, trim(p_student_name), nullif(trim(p_student_email), ''), nullif(trim(p_student_phone), ''),
          current_date + p_days)
  returning id into v_tx_id;

  insert into public.stock_history (book_id, book_title, action, quantity, old_stock, new_stock, source)
  values (v_book.id, v_book.title, 'issue', -1, v_book.available_copies, v_book.available_copies - 1, 'Book Issue');

  return v_tx_id;
end;
$$;

create or replace function public.return_book(p_transaction_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.transactions%rowtype;
  v_book public.books%rowtype;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_tx.status <> 'issued' then raise exception 'Book already returned'; end if;

  select * into v_book from public.books where id = v_tx.book_id for update;

  update public.transactions set status = 'returned', return_date = current_date where id = v_tx.id;
  update public.books set available_copies = least(total_copies, available_copies + 1) where id = v_book.id;

  insert into public.stock_history (book_id, book_title, action, quantity, old_stock, new_stock, source)
  values (v_book.id, v_book.title, 'return', 1, v_book.available_copies, least(v_book.total_copies, v_book.available_copies + 1), 'Book Return');
end;
$$;

create or replace function public.restock_book(
  p_book_id bigint,
  p_quantity int,
  p_source text,
  p_notes text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book public.books%rowtype;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10000 then raise exception 'Invalid quantity'; end if;

  select * into v_book from public.books where id = p_book_id for update;
  if not found then raise exception 'Book not found'; end if;

  update public.books
     set available_copies = available_copies + p_quantity,
         total_copies = total_copies + p_quantity
   where id = p_book_id;

  insert into public.stock_history (book_id, book_title, action, quantity, old_stock, new_stock, source, notes)
  values (v_book.id, v_book.title, 'restock', p_quantity, v_book.available_copies,
          v_book.available_copies + p_quantity, left(coalesce(p_source, 'Other'), 50), left(p_notes, 300));
end;
$$;

create or replace function public.clear_library_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  truncate table public.transactions, public.stock_history, public.books restart identity;
end;
$$;

-- ============ GRANTS ============
revoke all on function public.issue_book(bigint, text, text, text, int) from public, anon;
revoke all on function public.return_book(bigint) from public, anon;
revoke all on function public.restock_book(bigint, int, text, text) from public, anon;
revoke all on function public.clear_library_data() from public, anon;

grant execute on function public.issue_book(bigint, text, text, text, int) to authenticated;
grant execute on function public.return_book(bigint) to authenticated;
grant execute on function public.restock_book(bigint, int, text, text) to authenticated;
grant execute on function public.clear_library_data() to authenticated;

-- ============ ADMIN USER SETUP ============
-- 1) Supabase Dashboard -> Authentication -> Users -> "Add user" (email + strong password, auto-confirm).
-- 2) Then run this in SQL Editor (replace the email):
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'YOUR_ADMIN_EMAIL';
--
-- 3) Authentication -> Providers -> Email -> turn OFF "Allow new users to sign up".
