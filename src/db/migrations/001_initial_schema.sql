-- Rango · schema inicial
-- Valores monetários em centavos (INTEGER). Datas em ISO-8601 UTC (TEXT).

CREATE TABLE users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT    NOT NULL,
  email             TEXT    NOT NULL COLLATE NOCASE UNIQUE,
  phone             TEXT    NOT NULL,
  password_hash     TEXT    NOT NULL,
  avatar_path       TEXT,
  theme             TEXT    NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
  notify_orders     INTEGER NOT NULL DEFAULT 1 CHECK (notify_orders IN (0, 1)),
  notify_promos     INTEGER NOT NULL DEFAULT 1 CHECK (notify_promos IN (0, 1)),
  notify_news       INTEGER NOT NULL DEFAULT 0 CHECK (notify_news IN (0, 1)),
  terms_accepted_at TEXT    NOT NULL,
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL
);

-- Refresh tokens (opacos, armazenados como hash SHA-256)
CREATE TABLE sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash     TEXT    NOT NULL UNIQUE,
  keep_signed_in INTEGER NOT NULL DEFAULT 0,
  expires_at     TEXT    NOT NULL,
  created_at     TEXT    NOT NULL,
  revoked_at     TEXT
);
CREATE INDEX idx_sessions_user ON sessions (user_id);

CREATE TABLE password_resets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  expires_at TEXT    NOT NULL,
  used_at    TEXT,
  created_at TEXT    NOT NULL
);

CREATE TABLE categories (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT    NOT NULL UNIQUE,
  slug     TEXT    NOT NULL UNIQUE,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id               TEXT    PRIMARY KEY,
  name             TEXT    NOT NULL,
  restaurant       TEXT    NOT NULL,
  category_id      INTEGER NOT NULL REFERENCES categories (id),
  description      TEXT    NOT NULL,
  ingredients      TEXT    NOT NULL DEFAULT '',
  price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),
  old_price_cents  INTEGER CHECK (old_price_cents IS NULL OR old_price_cents > price_cents),
  rating           REAL    NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  delivery_min     INTEGER NOT NULL CHECK (delivery_min > 0),
  delivery_max     INTEGER NOT NULL CHECK (delivery_max >= delivery_min),
  image_url        TEXT,
  image_hue        INTEGER NOT NULL DEFAULT 30,
  position         INTEGER NOT NULL DEFAULT 0,
  is_available     INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
  -- nome + restaurante + categoria normalizados (minúsculas, sem acento) para a busca
  search_text      TEXT    NOT NULL
);
CREATE INDEX idx_products_category ON products (category_id);

CREATE TABLE product_tags (
  product_id TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  tag        TEXT NOT NULL CHECK (tag IN ('offers', 'popular', 'recommended', 'fast')),
  PRIMARY KEY (product_id, tag)
);
CREATE INDEX idx_product_tags_tag ON product_tags (tag);

-- Adicionais opcionais (no protótipo valem para qualquer produto)
CREATE TABLE addons (
  id          TEXT    PRIMARY KEY,
  name        TEXT    NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE favorites (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  product_id TEXT    NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE recent_searches (
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  term        TEXT    NOT NULL,
  searched_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, term)
);

CREATE TABLE addresses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  label        TEXT    NOT NULL,
  cep          TEXT    NOT NULL,
  street       TEXT    NOT NULL,
  complement   TEXT,
  neighborhood TEXT    NOT NULL,
  city         TEXT    NOT NULL,
  is_selected  INTEGER NOT NULL DEFAULT 0 CHECK (is_selected IN (0, 1)),
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);
CREATE INDEX idx_addresses_user ON addresses (user_id);
-- no máximo um endereço selecionado por usuário
CREATE UNIQUE INDEX idx_addresses_selected ON addresses (user_id) WHERE is_selected = 1;

-- Formas de pagamento salvas. Nunca armazenamos número completo de cartão: só bandeira e 4 últimos dígitos.
CREATE TABLE payment_methods (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       TEXT    NOT NULL CHECK (type IN ('pix', 'credit', 'debit', 'cash')),
  brand      TEXT,
  last4      TEXT CHECK (last4 IS NULL OR (length(last4) = 4 AND last4 NOT GLOB '*[^0-9]*')),
  created_at TEXT    NOT NULL,
  CHECK ((type IN ('credit', 'debit')) = (brand IS NOT NULL AND last4 IS NOT NULL))
);
CREATE INDEX idx_payment_methods_user ON payment_methods (user_id);

CREATE TABLE coupons (
  code               TEXT    PRIMARY KEY,
  description        TEXT    NOT NULL,
  percent_off        INTEGER NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
  min_subtotal_cents INTEGER NOT NULL DEFAULT 0,
  active             INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  expires_at         TEXT
);

-- Carrinho persistido no servidor (um por usuário)
CREATE TABLE carts (
  user_id     INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  coupon_code TEXT REFERENCES coupons (code),
  updated_at  TEXT NOT NULL
);

CREATE TABLE cart_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  product_id TEXT    NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  -- ids dos adicionais ordenados e separados por vírgula ('' quando não há).
  -- Mesmo produto + mesmos adicionais = mesma linha (regra do protótipo).
  addon_key  TEXT    NOT NULL DEFAULT '',
  quantity   INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  notes      TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  UNIQUE (user_id, product_id, addon_key)
);

-- Pedidos: id numérico exibido como "RG-<id>". Endereço e pagamento são copiados
-- (snapshot) para que o histórico não mude se o usuário editar/remover cadastros.
CREATE TABLE orders (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status             TEXT    NOT NULL CHECK (status IN ('live', 'done', 'cancel')),
  step               INTEGER NOT NULL CHECK (step BETWEEN 0 AND 4),
  subtotal_cents     INTEGER NOT NULL,
  delivery_fee_cents INTEGER NOT NULL,
  discount_cents     INTEGER NOT NULL DEFAULT 0,
  total_cents        INTEGER NOT NULL,
  coupon_code        TEXT,
  address_id         INTEGER REFERENCES addresses (id) ON DELETE SET NULL,
  address_label      TEXT    NOT NULL,
  address_line       TEXT    NOT NULL,
  address_city       TEXT    NOT NULL,
  payment_type       TEXT    NOT NULL CHECK (payment_type IN ('pix', 'credit', 'debit', 'cash')),
  payment_label      TEXT    NOT NULL,
  payment_detail     TEXT    NOT NULL,
  change_for_cents   INTEGER,
  eta_min            INTEGER NOT NULL,
  eta_max            INTEGER NOT NULL,
  courier_name       TEXT    NOT NULL,
  courier_vehicle    TEXT    NOT NULL,
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL
);
CREATE INDEX idx_orders_user ON orders (user_id, created_at DESC);

CREATE TABLE order_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id       TEXT    REFERENCES products (id) ON DELETE SET NULL,
  product_name     TEXT    NOT NULL,
  image_hue        INTEGER NOT NULL DEFAULT 30,
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL,
  addons_json      TEXT    NOT NULL DEFAULT '[]',
  notes            TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX idx_order_items_order ON order_items (order_id);

-- Momento em que o pedido atingiu cada etapa da timeline
CREATE TABLE order_events (
  order_id   INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  step       INTEGER NOT NULL CHECK (step BETWEEN 0 AND 4),
  created_at TEXT    NOT NULL,
  PRIMARY KEY (order_id, step)
);

CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('order', 'promo', 'news')),
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  order_id   INTEGER REFERENCES orders (id) ON DELETE SET NULL,
  read_at    TEXT,
  created_at TEXT    NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);
