import type { Clock } from '../../lib/clock';
import { notFound } from '../../lib/errors';
import { toCents } from '../../lib/money';
import { buildMeta } from '../../lib/pagination';
import { normalize } from '../../lib/text';
import type { CatalogRepository, ProductSort, Section } from './catalog.repository';
import { SECTIONS, toAddonDto, toCategoryDto, toProductSummary } from './catalog.schemas';

export const RECENT_SEARCHES_LIMIT = 6;
const SUGGESTIONS_LIMIT = 8;
const HOME_SECTION_SIZE = 10;

export interface ProductQuery {
  q?: string;
  category?: string;
  section?: Section;
  maxPrice?: number;
  minRating?: number;
  maxDeliveryTime?: number;
  sort: ProductSort;
  page: number;
  pageSize: number;
}

export class CatalogService {
  constructor(
    private readonly repo: CatalogRepository,
    private readonly clock: Clock,
  ) {}

  categories() {
    return this.repo.listCategories().map(toCategoryDto);
  }

  listProducts(userId: number, query: ProductQuery) {
    const q = query.q ? normalize(query.q) : undefined;
    const category = query.category && normalize(query.category) !== 'todos' ? query.category : undefined;
    const { rows, total } = this.repo.searchProducts(
      userId,
      {
        q: q || undefined,
        category,
        section: query.section,
        maxPriceCents: query.maxPrice !== undefined ? toCents(query.maxPrice) : undefined,
        minRating: query.minRating,
        maxDeliveryTime: query.maxDeliveryTime,
        sort: query.sort,
      },
      query.pageSize,
      (query.page - 1) * query.pageSize,
    );
    return { data: rows.map(toProductSummary), meta: buildMeta(query.page, query.pageSize, total) };
  }

  getProduct(userId: number, id: string) {
    const row = this.repo.findProduct(userId, id);
    if (!row) throw notFound('Produto não encontrado.', 'PRODUCT_NOT_FOUND');
    return {
      ...toProductSummary(row),
      ingredients: row.ingredients,
      addons: this.repo.listAddons().map(toAddonDto),
    };
  }

  sections(userId: number) {
    return (Object.keys(SECTIONS) as Section[]).map((key) => ({
      key,
      title: SECTIONS[key],
      products: this.repo
        .searchProducts(userId, { section: key, sort: 'relevance' }, HOME_SECTION_SIZE, 0)
        .rows.map(toProductSummary),
    }));
  }

  suggestions(userId: number, q?: string) {
    const term = q ? normalize(q) : '';
    if (!term) {
      // sem termo: produtos mais pedidos
      return this.repo
        .searchProducts(userId, { section: 'popular', sort: 'rating' }, SUGGESTIONS_LIMIT, 0)
        .rows.map((r) => r.name);
    }
    return this.repo.suggestions(term, SUGGESTIONS_LIMIT);
  }

  recentSearches(userId: number) {
    return this.repo.listRecentSearches(userId, RECENT_SEARCHES_LIMIT);
  }

  saveRecentSearch(userId: number, term: string) {
    this.repo.saveRecentSearch(userId, term.trim().toLowerCase(), this.clock.now().toISOString(), RECENT_SEARCHES_LIMIT);
    return this.recentSearches(userId);
  }

  clearRecentSearches(userId: number) {
    this.repo.clearRecentSearches(userId);
  }

  // ---------- favoritos ----------
  favorites(userId: number) {
    return this.repo.listFavorites(userId).map(toProductSummary);
  }

  setFavorite(userId: number, productId: string, favorite: boolean) {
    if (!this.repo.findProduct(userId, productId)) throw notFound('Produto não encontrado.', 'PRODUCT_NOT_FOUND');
    if (favorite) this.repo.addFavorite(userId, productId, this.clock.now().toISOString());
    else this.repo.removeFavorite(userId, productId);
    return { productId, isFavorite: favorite };
  }
}
