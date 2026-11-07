create table if not exists oleaje_book (
  stage text primary key,
  document jsonb not null
);
