import type { DB } from '../../db/connection';
import { escapeLike } from '../../lib/text';

export type Section = 'offers' | 'popular' | 'recommended' | 'fast';
export type ProductSort = 'relevance' | 'price_asc' | 'price_desc' | 'rating';

export interface CategoryRow {
  id: number;
  name: string;
  slug: string;
  position: number;
}

export interface ProductRow {
  id: string;
  name: string;
  restaurant: string;
  category_id: number;
  category_name: string;
  category_slug: string;
  description: string;
  ingredients: string;
  price_cents: number;
  old_price_cents: number | null;
  rating: number;
  delivery_min: number;
  delivery_max: number;
  image_url: string | null;
  image_hue: number;
  is_available: 0 | 1;
  tags: string | null;
  is_favorite: 0 | 1;
}

export interface AddonRow {
  id: string;
  name: string;
  price_cents: number;
}

export interface ProductFilters {
  /** já normalizado (minúsculas, sem acento) */
  q?: string;
  category?: string;
  section?: Section;
  maxPriceCents?: number;
  minRating?: number;
  maxDeliveryTime?: number;
  sort: ProductSort;
}

const SORT_SQL: Record<ProductSort, string> = {
  relevance: 'p.position, p.id',
  price_asc: 'p.price_cents, p.position',
  price_desc: 'p.price_cents DESC, p.position',
  rating: 'p.rating DESC, p.position',
};

const PRODUCT_SELECT = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug,
    (SELECT group_concat(t.tag) FROM product_tags t WHERE t.product_id = p.id) AS tags,
    EXISTS (SELECT 1 FROM favorites f WHERE f.user_id = @userId AND f.product_id = p.id) AS is_favorite
  FROM products p
  JOIN categories c ON c.id = p.category_id`;

export class CatalogRepository {
  constructor(private readonly db: DB) {}

  listCategories(): CategoryRow[] {
    return this.db.prepare('SELECT * FROM categories ORDER BY position, id').all() as CategoryRow[];
  }

  findProduct(userId: number, id: string): ProductRow | undefined {
    return this.db.prepare(`${PRODUCT_SELECT} WHERE p.id = @id`).get({ userId, id }) as ProductRow | undefined;
  }

  findProducts(userId: number, ids: string[]): ProductRow[] {
    if (!ids.length) return [];
    const params: Record<string, unknown> = { userId };
    const placeholders = ids.map((id, i) => {
      params[`id${i}`] = id;
      return `@id${i}`;
    });
    return this.db.prepare(`${PRODUCT_SELECT} WHERE p.id IN (${placeholders.join(', ')})`).all(params) as ProductRow[];
  }

  searchProducts(userId: number, f: ProductFilters, limit: number, offset: number): { rows: ProductRow[]; total: number } {
    const where: string[] = ['p.is_available = 1'];
    const params: Record<string, unknown> = { userId, limit, offset };

    if (f.q) {
      where.push(`p.search_text LIKE @q ESCAPE '\\'`);
      params.q = `%${escapeLike(f.q)}%`;
    }
    if (f.category) {
      where.push('(c.slug = @category OR c.name = @category COLLATE NOCASE)');
      params.category = f.category;
    }
    if (f.section) {
      where.push('EXISTS (SELECT 1 FROM product_tags t WHERE t.product_id = p.id AND t.tag = @section)');
      params.section = f.section;
    }
    if (f.maxPriceCents !== undefined) {
      where.push('p.price_cents <= @maxPrice');
      params.maxPrice = f.maxPriceCents;
    }
    if (f.minRating !== undefined) {
      where.push('p.rating >= @minRating');
      params.minRating = f.minRating;
    }
    if (f.maxDeliveryTime !== undefined) {
      where.push('p.delivery_max <= @maxTime');
      params.maxTime = f.maxDeliveryTime;
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const { total } = this.db
      .prepare(`SELECT COUNT(*) AS total FROM products p JOIN categories c ON c.id = p.category_id ${whereSql}`)
      .get(params) as { total: number };
    const rows = this.db
      .prepare(`${PRODUCT_SELECT} ${whereSql} ORDER BY ${SORT_SQL[f.sort]} LIMIT @limit OFFSET @offset`)
      .all(params) as ProductRow[];
    return { rows, total };
  }

  listAddons(): AddonRow[] {
    return this.db.prepare('SELECT id, name, price_cents FROM addons ORDER BY position, id').all() as AddonRow[];
  }

  findAddons(ids: string[]): AddonRow[] {
    if (!ids.length) return [];
    return this.db
      .prepare(`SELECT id, name, price_cents FROM addons WHERE id IN (${ids.map(() => '?').join(', ')}) ORDER BY position`)
      .all(...ids) as AddonRow[];
  }

  /** Sugestões: nomes de produtos, restaurantes e categorias que contêm o termo. */
  suggestions(q: string, limit: number): string[] {
    const like = `%${escapeLike(q)}%`;
    const rows = this.db
      .prepare(
        `SELECT term FROM (
           SELECT p.name AS term, 0 AS kind, p.position AS pos FROM products p
             WHERE p.is_available = 1 AND p.search_text LIKE @like ESCAPE '\\'
           UNION
           SELECT c.name, 1, c.position FROM categories c WHERE lower(c.slug) LIKE @like ESCAPE '\\'
           UNION
           SELECT DISTINCT p.restaurant, 2, MIN(p.position) FROM products p
             WHERE p.is_available = 1 AND p.search_text LIKE @like ESCAPE '\\' GROUP BY p.restaurant
         ) ORDER BY kind, pos LIMIT @limit`,
      )
      .all({ like, limit }) as { term: string }[];
    return [...new Set(rows.map((r) => r.term))];
  }

  // ---------- favoritos ----------
  listFavorites(userId: number): ProductRow[] {
    return this.db
      .prepare(
        `${PRODUCT_SELECT} JOIN favorites fav ON fav.product_id = p.id AND fav.user_id = @userId
         ORDER BY fav.created_at DESC, p.position`,
      )
      .all({ userId }) as ProductRow[];
  }

  addFavorite(userId: number, productId: string, now: string): void {
    this.db
      .prepare('INSERT OR IGNORE INTO favorites (user_id, product_id, created_at) VALUES (?, ?, ?)')
      .run(userId, productId, now);
  }

  removeFavorite(userId: number, productId: string): void {
    this.db.prepare('DELETE FROM favorites WHERE user_id = ? AND product_id = ?').run(userId, productId);
  }

  // ---------- buscas recentes ----------
  listRecentSearches(userId: number, limit: number): string[] {
    return (
      this.db
        .prepare('SELECT term FROM recent_searches WHERE user_id = ? ORDER BY searched_at DESC LIMIT ?')
        .all(userId, limit) as { term: string }[]
    ).map((r) => r.term);
  }

  /** Insere/atualiza o termo e mantém apenas os `keep` mais recentes. */
  saveRecentSearch(userId: number, term: string, now: string, keep: number): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO recent_searches (user_id, term, searched_at) VALUES (?, ?, ?)
           ON CONFLICT (user_id, term) DO UPDATE SET searched_at = excluded.searched_at`,
        )
        .run(userId, term, now);
      this.db
        .prepare(
          `DELETE FROM recent_searches WHERE user_id = @userId AND term NOT IN (
             SELECT term FROM recent_searches WHERE user_id = @userId ORDER BY searched_at DESC LIMIT @keep)`,
        )
        .run({ userId, keep });
    })();
  }

  clearRecentSearches(userId: number): void {
    this.db.prepare('DELETE FROM recent_searches WHERE user_id = ?').run(userId);
  }
}
