/** Dados de demonstração extraídos do protótipo (Rango Delivery.dc.html). Preços em reais. */

export const CATEGORIES = ['Hambúrguer', 'Pizza', 'Massas', 'Brasileira', 'Sobremesas', 'Bebidas'];

export const ADDONS = [
  { id: 'a1', name: 'Bacon extra', price: 4 },
  { id: 'a2', name: 'Cheddar extra', price: 3.5 },
  { id: 'a3', name: 'Molho da casa', price: 2 },
  { id: 'a4', name: 'Refrigerante 350ml', price: 7 },
];

type Tag = 'offers' | 'popular' | 'recommended' | 'fast';

export interface SeedProduct {
  id: string;
  name: string;
  restaurant: string;
  category: string;
  price: number;
  oldPrice: number | null;
  rating: number;
  time: [number, number];
  hue: number;
  tags: Tag[];
  description: string;
  ingredients: string;
}

export const PRODUCTS: SeedProduct[] = [
  { id: 'p1', name: 'Burger duplo cheddar', restaurant: 'Casa do Burger', category: 'Hambúrguer', price: 34.9, oldPrice: 42.9, rating: 4.8, time: [25, 35], hue: 48, tags: ['offers', 'popular'], description: 'Dois blends de 120g com cheddar inglês', ingredients: 'Pão brioche, 2 blends de 120g, cheddar inglês, cebola caramelizada, molho da casa.' },
  { id: 'p2', name: 'Pizza margherita', restaurant: 'Forno di Napoli', category: 'Pizza', price: 45, oldPrice: null, rating: 4.7, time: [30, 40], hue: 28, tags: ['popular', 'recommended'], description: 'Massa de fermentação natural, 8 fatias', ingredients: 'Molho de tomate San Marzano, muçarela de búfala, manjericão fresco, azeite.' },
  { id: 'p3', name: 'Fettuccine alfredo', restaurant: 'Cantina Bella', category: 'Massas', price: 39.9, oldPrice: null, rating: 4.6, time: [35, 45], hue: 82, tags: ['recommended'], description: 'Massa fresca ao molho cremoso', ingredients: 'Fettuccine fresco, creme de leite fresco, parmesão 24 meses, noz-moscada.' },
  { id: 'p4', name: 'Feijoada completa', restaurant: 'Tempero Mineiro', category: 'Brasileira', price: 52, oldPrice: 59.9, rating: 4.9, time: [40, 50], hue: 62, tags: ['offers', 'recommended'], description: 'Serve 2 · acompanhamentos inclusos', ingredients: 'Feijão preto, carnes selecionadas, arroz, couve, farofa, laranja e vinagrete.' },
  { id: 'p5', name: 'Brownie com sorvete', restaurant: 'Doce Ponto', category: 'Sobremesas', price: 18.5, oldPrice: null, rating: 4.9, time: [15, 25], hue: 35, tags: ['popular', 'fast'], description: 'Brownie quente e sorvete de creme', ingredients: 'Chocolate 70%, castanhas, sorvete de creme, calda quente de chocolate.' },
  { id: 'p6', name: 'Suco verde detox', restaurant: 'Verde Vivo', category: 'Bebidas', price: 12, oldPrice: null, rating: 4.4, time: [10, 20], hue: 140, tags: ['fast'], description: '500ml · sem açúcar', ingredients: 'Couve, maçã verde, limão, gengibre e hortelã.' },
  { id: 'p7', name: 'Smash burger bacon', restaurant: 'Casa do Burger', category: 'Hambúrguer', price: 29.9, oldPrice: 35.9, rating: 4.7, time: [20, 30], hue: 42, tags: ['offers', 'popular', 'fast'], description: 'Smash de 100g com bacon crocante', ingredients: 'Pão de batata, smash 100g, bacon, queijo prato, maionese defumada.' },
  { id: 'p8', name: 'Pizza pepperoni', restaurant: 'Forno di Napoli', category: 'Pizza', price: 49.9, oldPrice: null, rating: 4.8, time: [30, 40], hue: 20, tags: ['recommended'], description: 'Pepperoni italiano fatiado na hora', ingredients: 'Molho de tomate, muçarela, pepperoni italiano, orégano.' },
  { id: 'p9', name: 'Lasanha à bolonhesa', restaurant: 'Cantina Bella', category: 'Massas', price: 42, oldPrice: null, rating: 4.5, time: [35, 45], hue: 72, tags: [], description: 'Camadas de massa fresca e ragu', ingredients: 'Massa fresca, ragu de carne, molho branco, parmesão gratinado.' },
  { id: 'p10', name: 'Moqueca de camarão', restaurant: 'Tempero Mineiro', category: 'Brasileira', price: 68, oldPrice: null, rating: 4.9, time: [45, 60], hue: 32, tags: ['recommended'], description: 'Serve 2 · arroz e pirão inclusos', ingredients: 'Camarão rosa, leite de coco, dendê, pimentões, coentro, arroz e pirão.' },
  { id: 'p11', name: 'Petit gâteau', restaurant: 'Doce Ponto', category: 'Sobremesas', price: 22, oldPrice: null, rating: 4.8, time: [20, 30], hue: 16, tags: ['recommended'], description: 'Recheio cremoso de chocolate', ingredients: 'Chocolate meio amargo, manteiga, ovos, sorvete de baunilha.' },
  { id: 'p12', name: 'Limonada suíça', restaurant: 'Verde Vivo', category: 'Bebidas', price: 9.9, oldPrice: null, rating: 4.6, time: [10, 15], hue: 112, tags: ['fast'], description: '400ml · feita na hora', ingredients: 'Limão taiti, leite condensado, gelo.' },
  { id: 'p13', name: 'Açaí 500ml', restaurant: 'Doce Ponto', category: 'Sobremesas', price: 24.9, oldPrice: 29.9, rating: 4.7, time: [15, 25], hue: 305, tags: ['offers', 'fast'], description: 'Com banana, granola e mel', ingredients: 'Açaí batido, banana, granola artesanal, mel e leite em pó.' },
  { id: 'p14', name: 'Combo burger + fritas', restaurant: 'Casa do Burger', category: 'Hambúrguer', price: 44.9, oldPrice: null, rating: 4.6, time: [25, 35], hue: 52, tags: ['popular'], description: 'Burger, fritas grandes e bebida', ingredients: 'Burger 180g, fritas rústicas 300g, refrigerante 350ml.' },
];

export const COUPONS = [
  { code: 'RANGO10', description: '10% de desconto no subtotal', percentOff: 10, minSubtotal: 0 },
];

export const DEMO_USER = {
  name: 'Marina Alves',
  email: 'marina.alves@email.com',
  phone: '(11) 98876-4410',
  password: 'rango123',
};

export const DEMO_ADDRESSES = [
  { label: 'Casa', cep: '05422-030', street: 'Rua das Palmeiras, 128', complement: 'apto 42', neighborhood: 'Pinheiros', city: 'São Paulo', selected: true },
  { label: 'Trabalho', cep: '04538-133', street: 'Av. Faria Lima, 3400', complement: '9º andar', neighborhood: 'Itaim Bibi', city: 'São Paulo', selected: false },
];

export const DEMO_PAYMENT_METHODS: { type: 'pix' | 'credit' | 'debit' | 'cash'; brand: string | null; last4: string | null }[] = [
  { type: 'pix', brand: null, last4: null },
  { type: 'credit', brand: 'Visa', last4: '4410' },
  { type: 'debit', brand: 'Nubank', last4: '8802' },
  { type: 'cash', brand: null, last4: null },
];

/** Histórico do protótipo. `minutesAgo` posiciona o pedido no tempo; `paymentType` indica a forma usada. */
export const DEMO_ORDERS = [
  { id: 10298, minutesAgo: 60 * 24 * 73, status: 'cancel' as const, step: 1, address: 0, paymentType: 'debit' as const, items: [{ productId: 'p7', quantity: 1, addons: [] as string[] }] },
  { id: 10344, minutesAgo: 60 * 24 * 65, status: 'done' as const, step: 4, address: 1, paymentType: 'cash' as const, items: [{ productId: 'p4', quantity: 1, addons: [] }, { productId: 'p5', quantity: 1, addons: [] }, { productId: 'p6', quantity: 1, addons: [] }] },
  { id: 10391, minutesAgo: 60 * 24 * 58, status: 'done' as const, step: 4, address: 0, paymentType: 'credit' as const, items: [{ productId: 'p2', quantity: 1, addons: [] }] },
  { id: 10482, minutesAgo: 30, status: 'live' as const, step: 2, address: 0, paymentType: 'pix' as const, items: [{ productId: 'p1', quantity: 1, addons: ['a1'] }, { productId: 'p12', quantity: 2, addons: [] }] },
];

export const DEMO_FAVORITES = ['p5'];
export const DEMO_RECENT_SEARCHES = ['pizza', 'açaí', 'burger'];
