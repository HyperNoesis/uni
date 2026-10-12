-- 0004 server-priced virtual room shop catalogue. Keep historical migration 0002 immutable.
-- These items are non-redeemable cosmetics; prices live in packages/domain/src/shop.ts.
INSERT INTO items (id, name, layer, width, height, source, campus_id) VALUES
  ('rug_cobalt', 'Cobalt Lounge Rug', 'floor', 4, 3, 'shop', NULL),
  ('neon_lamp_cyan', 'Cyan Neon Lamp', 'object', 1, 1, 'shop', NULL),
  ('campus_banner', 'Campus Pride Banner', 'wall', 1, 1, 'shop', NULL),
  ('golden_trophy', 'Golden Trophy', 'object', 1, 1, 'shop', NULL),
  ('beanbag_sunset', 'Sunset Bean Bag', 'object', 1, 1, 'shop', NULL),
  ('speaker_pulse', 'Pulse Speaker', 'object', 1, 1, 'shop', NULL),
  ('poster_campus', 'Campus Life Poster', 'wall', 1, 1, 'shop', NULL),
  ('bookshelf_oak', 'Oak Bookcase', 'object', 2, 1, 'shop', NULL);
