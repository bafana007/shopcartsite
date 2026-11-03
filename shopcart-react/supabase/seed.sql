-- Seed the existing catalog (run AFTER schema.sql)
insert into public.products (id, name, price, "desc", rating, reviews, image, type, color, material, offer)
overriding system value
values
  (1, 'Wireless Earbuds, IPX8', 89, 'Water-resistant earbuds with a charging case', 5, 121, 'images/wireless-earbuds.jpg', 'Earbuds', 'Black', 'Plastic', false),
  (2, 'AirPods Max', 559, 'A perfect balance of high-fidelity audio', 5, 121, 'images/airpods-max.jpg', 'Over-ear', 'Red', 'Metal', true),
  (3, 'Bose BT Earphones', 289, 'Comfortable over-ear sound with deep bass', 4.5, 121, 'images/foldable-headphones.jpg', 'Over-ear', 'Black', 'Leather', false),
  (4, 'VIVEFOX Headphones', 39, 'Wired stereo headset with a built-in mic', 5, 121, 'images/vivefox-headphones.jpg', 'Over-ear', 'Red', 'Plastic', true),
  (5, 'JBL TUNE 600BTNC', 59, 'Wireless on-ear headphones, noise cancelling', 5, 121, 'images/jbl-tune-600btnc.jpg', 'Over-ear', 'Black', 'Plastic', false),
  (6, 'TAGRY Bluetooth', 109, 'Low-latency gaming earbuds with RGB case', 5, 121, 'images/open-ear-earbuds.jpg', 'Earbuds', 'Black', 'Plastic', true),
  (7, 'Monster MNFLEX', 89.75, 'Open-ear bone conduction for outdoor use', 5, 121, 'images/monster-headphones.jpg', 'Open-ear', 'Black', 'Plastic', false),
  (8, 'Mpow CH6', 69, 'Volume-limited headphones for kids', 5, 121, 'images/mpow-ch6-kids.jpg', 'Kids', 'Blue', 'Plastic', false),
  (9, 'Urban Commuter Laptop Bag', 49, 'Sleek minimalist laptop bag with padded 15" compartment', 4.8, 89, 'images/laptop bags/laptop-bag-1.jpg', 'Bags', 'Black', 'Nylon', true),
  (10, 'Metro Slim Briefcase', 65, 'Ultra-thin laptop briefcase with RFID-blocking pocket', 4.6, 67, 'images/laptop bags/laptop-bag-2.jpg', 'Bags', 'Charcoal', 'Polyester', false),
  (11, 'Modern Minimal Tote', 55, 'Clean design tote with dedicated laptop sleeve', 4.7, 102, 'images/laptop bags/laptop-bag-3.jpg', 'Bags', 'Gray', 'Canvas', true),
  (12, 'Daypack Rucksack Pro', 72, 'Ergonomic daypack with laptop compartment and USB port', 4.9, 156, 'images/laptop bags/laptop-bag-4.jpg', 'Bags', 'Navy', 'Nylon', false),
  (13, 'Campus Classic Backpack', 38, 'Everyday backpack with padded laptop pocket', 4.5, 203, 'images/laptop bags/laptop-bag-5.jpg', 'Bags', 'Black', 'Polyester', true),
  (14, 'Fenruien Anti-Theft Pack', 85, 'Anti-theft laptop backpack with hidden zippers, waterproof', 4.8, 74, 'images/laptop bags/laptop-bag-6.jpg', 'Bags', 'Black', 'Nylon', false),
  (15, 'Traveler Laptop Rucksack', 79, 'Expandable rucksack with 17" laptop sleeve and rain cover', 4.6, 91, 'images/laptop bags/laptop-bag-7.jpg', 'Bags', 'Olive', 'Canvas', false),
  (16, 'Executive Business Backpack', 95, 'Premium waterproof business backpack, large capacity', 4.7, 58, 'images/laptop bags/laptop-bag-8.jpg', 'Bags', 'Black', 'Nylon', true)
on conflict (id) do nothing;

-- keep the identity counter ahead of the seeded ids
select setval(pg_get_serial_sequence('public.products','id'), (select max(id) from public.products));

