create extension if not exists vector;

create table if not exists public.memory_cards (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'default',
  type text not null default 'interview_review',
  company text,
  role text,
  round text,
  result text,
  title text not null,
  raw_text text not null,
  summary text,
  questions_json jsonb not null default '[]'::jsonb,
  tags_json jsonb not null default '[]'::jsonb,
  reusable_evidence_json jsonb not null default '[]'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists memory_cards_user_created_idx
  on public.memory_cards (user_id, created_at desc);

create index if not exists memory_cards_round_idx
  on public.memory_cards (round);

create index if not exists memory_cards_embedding_idx
  on public.memory_cards
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function public.match_memory_cards(
  query_embedding vector(1536),
  match_count int default 5,
  match_user_id text default 'default',
  match_round text default null
)
returns table (
  id uuid,
  user_id text,
  type text,
  company text,
  role text,
  round text,
  result text,
  title text,
  raw_text text,
  summary text,
  questions_json jsonb,
  tags_json jsonb,
  reusable_evidence_json jsonb,
  created_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    memory_cards.id,
    memory_cards.user_id,
    memory_cards.type,
    memory_cards.company,
    memory_cards.role,
    memory_cards.round,
    memory_cards.result,
    memory_cards.title,
    memory_cards.raw_text,
    memory_cards.summary,
    memory_cards.questions_json,
    memory_cards.tags_json,
    memory_cards.reusable_evidence_json,
    memory_cards.created_at,
    1 - (memory_cards.embedding <=> query_embedding) as similarity
  from public.memory_cards
  where memory_cards.user_id = match_user_id
    and memory_cards.embedding is not null
    and (match_round is null or memory_cards.round = match_round)
  order by memory_cards.embedding <=> query_embedding
  limit match_count;
$$;
