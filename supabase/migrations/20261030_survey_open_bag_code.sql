-- One open code per email. A redeemed code can be followed by a new bag code.
drop index if exists public.sp_survey_responses_one_coupon_per_email_idx;

create unique index if not exists sp_survey_responses_one_open_coupon_per_email_idx
  on public.sp_survey_responses (email_normalized)
  where coupon_code is not null and coupon_redeemed_at is null;
