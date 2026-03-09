-- Add lat/lng to circles for meetup pin location
alter table circles
  add column if not exists meetup_lat  double precision,
  add column if not exists meetup_lng  double precision;
