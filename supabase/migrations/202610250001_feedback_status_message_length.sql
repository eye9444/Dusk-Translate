-- Replies remain capped at 5,000 characters by the RPC. System status messages
-- also include a short label before the full 5,000-character rejection reason.
alter table public.feedback_messages drop constraint feedback_messages_body_check;
alter table public.feedback_messages add constraint feedback_messages_body_check
  check(char_length(btrim(body)) between 1 and 5050);
