-- Seed data for kxsaku.com self-hosted Supabase
-- Imported from Supabase Cloud export (2026-03-26)
-- Chat messages/attachments/audit logs SKIPPED (test data)

-- Auth users (must be inserted into auth.users with exact UUIDs)
-- NOTE: Passwords will need to be reset since we can't export hashed passwords.
-- Use Supabase Admin API or Studio to set passwords after deployment.

-- Admin user: brandon.sns@pm.me
INSERT INTO auth.users (
  id, aud, role, email, email_confirmed_at, phone,
  confirmed_at, last_sign_in_at, app_metadata, user_metadata,
  created_at, updated_at, is_anonymous, instance_id,
  encrypted_password, raw_app_meta_data, raw_user_meta_data
) VALUES (
  '4f33551e-14d0-46a1-94c7-53d611eafd4a',
  'authenticated', 'authenticated', 'brandon.sns@pm.me',
  '2025-12-12T17:19:06.335241Z', '',
  '2025-12-12T17:19:06.335241Z', '2026-01-19T11:10:20.564749Z',
  '{"provider":"email","providers":["email"]}',
  '{"email_verified":true}',
  '2025-12-12T17:19:06.30486Z', '2026-01-19T11:10:20.590914Z',
  false, '00000000-0000-0000-0000-000000000000',
  -- Temporary password hash - Brandon must reset password via Studio or API
  crypt('TEMP_CHANGE_ME_123!', gen_salt('bf')),
  '{"provider":"email","providers":["email"]}',
  '{"email_verified":true}'
) ON CONFLICT (id) DO NOTHING;

-- Test client user: therealboltgamez@gmail.com
INSERT INTO auth.users (
  id, aud, role, email, email_confirmed_at, invited_at, phone,
  confirmed_at, last_sign_in_at, app_metadata, user_metadata,
  created_at, updated_at, is_anonymous, instance_id,
  encrypted_password, raw_app_meta_data, raw_user_meta_data
) VALUES (
  '0b0631fa-d2c2-4622-8ac4-54bd9b788639',
  'authenticated', 'authenticated', 'therealboltgamez@gmail.com',
  '2025-12-29T09:19:01.971203Z', '2025-12-29T09:18:25.484905Z', '',
  '2025-12-29T09:19:01.971203Z', '2026-01-19T11:04:24.75646Z',
  '{"provider":"email","providers":["email"]}',
  '{"email_verified":true,"role":"client"}',
  '2025-12-29T09:18:25.475874Z', '2026-01-19T11:04:25.084843Z',
  false, '00000000-0000-0000-0000-000000000000',
  crypt('TEMP_CHANGE_ME_123!', gen_salt('bf')),
  '{"provider":"email","providers":["email"]}',
  '{"email_verified":true,"role":"client"}'
) ON CONFLICT (id) DO NOTHING;

-- Create identities for email provider
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '4f33551e-14d0-46a1-94c7-53d611eafd4a',
  '{"sub":"4f33551e-14d0-46a1-94c7-53d611eafd4a","email":"brandon.sns@pm.me","email_verified":true}',
  'email', '4f33551e-14d0-46a1-94c7-53d611eafd4a',
  '2026-01-19T11:10:20.564749Z',
  '2025-12-12T17:19:06.30486Z', '2026-01-19T11:10:20.590914Z'
) ON CONFLICT DO NOTHING;

INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '0b0631fa-d2c2-4622-8ac4-54bd9b788639',
  '{"sub":"0b0631fa-d2c2-4622-8ac4-54bd9b788639","email":"therealboltgamez@gmail.com","email_verified":true}',
  'email', '0b0631fa-d2c2-4622-8ac4-54bd9b788639',
  '2026-01-19T11:04:24.75646Z',
  '2025-12-29T09:18:25.475874Z', '2026-01-19T11:04:25.084843Z'
) ON CONFLICT DO NOTHING;

-- user_profiles (1 row - admin)
INSERT INTO public.user_profiles (id, user_id, email, full_name, business_name, phone, is_admin, created_at, updated_at)
VALUES (
  '7a13c801-80e9-4fbd-ba4f-f6936c246281',
  NULL,
  'brandon.sns@pm.me',
  NULL, NULL, NULL,
  true,
  '2026-01-19T00:35:42.454943+00:00',
  '2026-01-19T00:35:42.454943+00:00'
) ON CONFLICT (id) DO NOTHING;

-- client_profiles (1 row - test client)
INSERT INTO public.client_profiles (user_id, email, contact_name, business_name, phone, business_location, mailing_address, billing_address, billing_same_as_mailing, created_at, updated_at)
VALUES (
  '0b0631fa-d2c2-4622-8ac4-54bd9b788639',
  'therealboltgamez@gmail.com',
  'Test', 'Test', '7473896352',
  'Test, Test',
  '123 Test, Test, 12345',
  '123 Test, Test, 12345',
  true,
  '2025-12-29T09:18:26.821273+00:00',
  '2025-12-29T09:20:08.074219+00:00'
) ON CONFLICT (user_id) DO NOTHING;

-- billing_subscriptions (1 row)
INSERT INTO public.billing_subscriptions (user_id, email, stripe_customer_id, stripe_subscription_id, status, cancel_at_period_end, current_period_end, last_payment_status, last_payment_amount, last_payment_currency, last_payment_at, created_at, updated_at)
VALUES (
  '0b0631fa-d2c2-4622-8ac4-54bd9b788639',
  'therealboltgamez@gmail.com',
  'cus_TidKzdh7Ld5ePA',
  NULL,
  'inactive',
  false,
  NULL, NULL, NULL, NULL, NULL,
  '2025-12-31T08:07:33.781604+00:00',
  '2026-01-02T17:23:14.347624+00:00'
) ON CONFLICT (user_id) DO NOTHING;

-- sns_system_status (1 row - singleton)
INSERT INTO public.sns_system_status (id, mode, message, updated_at)
VALUES (1, 'normal', '', '2026-01-09T04:38:16.90617+00:00')
ON CONFLICT (id) DO NOTHING;

-- inquiries (1 row)
INSERT INTO public.inquiries (id, created_at, updated_at, contact_name, business_name, email, phone, location, company_size, services, current_setup, goals, budget, timeline, extra_notes, status, priority, owner_email, priority_flag, notes, work_order, phone_verified, phone_display, wo_number)
VALUES (
  'c97eff0b-a5cd-433b-a28a-6d0eacc8fdb8',
  '2025-12-27T02:18:03.537224+00:00',
  '2026-01-19T03:30:11.56141+00:00',
  'Justine Yoon', 'Cafe Mak ',
  'ktowncafemak@gmail.com', '+13233607297',
  'Los Angeles Ca ', '51-100',
  '["Upgrade existing network","Wi-Fi and access points"]',
  'We currently have Wi-Fi with T-Mobile and AT&T, but it is still very inconsistent in our Internet drops constantly when we are busy, so I''m trying to figure out a way to have reliable Internet for our customers in our cafe. ',
  'Our Wi-Fi isn''t a problem except when we are really busy when we have a high volume of ppl . We are curious about fireballs to help us monitor how much Internet and data customers use so that they aren''t sucking up too much of the Internet when they are spending hours and hours here',
  'under-2000', '30-days', NULL,
  'walkaway', 'green',
  'brandon.sns@pm.me', 'none',
  'ask for estimated sq ft of area',
  1, true, NULL, 1
) ON CONFLICT (id) DO NOTHING;

-- sns_internal_notes (3 rows)
INSERT INTO public.sns_internal_notes (id, title, body, client_user_id, client_label, created_at, updated_at) VALUES
  ('09234287-7e92-4b0b-a368-793f06d906af', 'Testing', 'Testing to see if it saves.', '0b0631fa-d2c2-4622-8ac4-54bd9b788639', 'Test (Test) · therealboltgamez@gmail.com · 7473896352', '2026-01-19T00:36:04.137564+00:00', '2026-01-19T00:36:14.464+00:00'),
  ('f8c66338-c8d2-45d7-99e5-fed8b4de93a1', 'Making sure', 'Gotta make sure this internal notes feature is working', NULL, NULL, '2026-01-19T03:22:16.043454+00:00', '2026-01-19T03:22:37.101+00:00'),
  ('96b8eec4-134e-4003-a7b3-ad51aa623c3d', 'tetsing ios', 'on my iphone', NULL, NULL, '2026-01-19T09:42:40.805433+00:00', '2026-01-19T09:42:40.773+00:00')
ON CONFLICT (id) DO NOTHING;
