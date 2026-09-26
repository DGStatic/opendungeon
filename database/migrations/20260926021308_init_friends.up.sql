create table friends(
  friend_id integer primary key,
  initiator_id integer not null references users(user_id) on delete cascade,
  target_id integer not null references users(user_id) on delete cascade,
  confirmed boolean not null default false,
  created_at integer not null default (unixepoch()),
  constraint chk_friends_diff_init_and_tgt check (initiator_id != target_id)
);

create unique index idx_friends_pair on friends(
  min(initiator_id, target_id),
  max(initiator_id, target_id)
);
