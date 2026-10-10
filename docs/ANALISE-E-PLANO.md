# Análise do protótipo e plano de implementação



Fonte analisada: protótipo navegável **Rango Delivery** (`Rango Delivery.dc.html` + `support.js`), capturas
`screens/home-check*.png` e o briefing original (`uploads/message.txt`). O protótipo é um app React de uma tela
só, com todos os dados **fictícios em memória** (`PRODUCTS`, `ADDONS`, `ADDRESSES`, `PAYS`, `seedOrders()`,
`seedNotifs()`). O estado é persistido em `localStorage` (chave `rango.prototype.v1`). Este backend substitui
essas fontes fictícias.

## 1. Funcionalidades identificadas → suporte no backend

| Tela / fluxo do protótipo | O que o protótipo faz hoje | Backend |
|---|---|---|
| Boas-vindas, Login | Valida e-mail/senha no cliente; senha fixa `rango123`; "Manter conectado" | `POST /auth/login` (JWT + refresh token; TTL maior com `keepSignedIn`) |
| Cadastro | Valida nome ≥3, e-mail, telefone ≥10 dígitos, senha ≥6, confirmação, termos | `POST /auth/register` com as **mesmas regras e mensagens** |
| Recuperar senha (4 passos) | Só navegação: e-mail → link enviado → nova senha → sucesso | `POST /auth/forgot-password` + `POST /auth/reset-password` (token de uso único, 30 min) |
| Sair | Limpa sessão local | `POST /auth/logout` (revoga refresh token) |
| Home | Saudação, endereço, foto, badges, categorias, 4 seções por *tag* | `GET /home` (agregado) e `GET /products?section=` |
| Busca + Filtros | Busca sem acento em nome/restaurante/categoria; filtros categoria, preço máx., nota mín., tempo; ordenações rel/asc/desc/rating; recentes (máx. 6); sugestões | `GET /products` (filtros + ordenação + paginação), `GET /search/suggestions`, `GET/POST/DELETE /search/recent` |
| Detalhes do produto | Ingredientes, adicionais, quantidade, observação, preço derivado | `GET /products/:id` (com adicionais); o preço final é calculado no servidor ao adicionar ao carrinho |
| Carrinho | Linhas por produto + adicionais; +/−; remover; cupom RANGO10 (10%); entrega R$ 7,90, grátis ≥ R$ 60 | `/cart` (persistido no servidor, totais calculados no servidor) |
| Checkout / Endereço / Pagamento | Endereço selecionado; novo endereço (CEP, rua e nº, complemento, bairro e cidade); PIX/crédito/débito/dinheiro | `/addresses` (CRUD + seleção), `/payment-methods`, `POST /orders` |
| Pedido confirmado / Acompanhamento | Número, previsão, timeline de 5 etapas, avanço a cada 5 s, entregador | `GET /orders/:id` com `timeline`, `estimatedDelivery`, `courier`; avanço simulado no servidor |
| Meus pedidos / Detalhe / Pedir novamente | Abas "Em andamento"/"Anteriores"; detalhes; refaz o carrinho | `GET /orders?group=live|past`, `GET /orders/:id`, `POST /orders/:id/reorder` |
| Favoritos | Toggle consistente entre telas | `GET /favorites`, `PUT/DELETE /favorites/:productId` + `isFavorite` em todo produto |
| Notificações | Lidas/não lidas, deep link para o pedido, push simulado | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` |
| Perfil / Editar perfil / Foto | Nome, e-mail, telefone; câmera/galeria/remover; recorte | `GET/PATCH /me`, `PUT/DELETE /me/avatar` (multipart) |
| Configurações / Tema / Notificações | Tema claro/escuro/sistema; flags pedidos/promoções/novidades | `GET/PATCH /me/settings` (as flags realmente controlam a geração de notificações) |
| Offline / cache | Faixa "Você está offline", dados salvos | **Responsabilidade do app** (cache local). A API é stateless e `GET /home` concentra o necessário para o cache |

## 2. Requisitos implícitos encontrados

- **Estado compartilhado do carrinho e favoritos** entre telas → persistir no servidor, por usuário.
- **Preço derivado** (produto + adicionais) e **regras de total** → calcular no servidor, para não confiar no cliente.
- **Mesma linha no carrinho** quando produto e adicionais coincidem (`lineKey` do protótipo).
- **Histórico imutável**: o pedido guarda cópia do endereço, do pagamento, dos preços e dos adicionais.
- **Pedido em andamento evolui sozinho** (timeline + notificações "saiu para entrega" / "chegou").
- **Recentes**: termo em minúsculas, sem duplicar, máx. 6, mais recente primeiro.
- **Deep link de notificação → pedido** → `orderId`/`orderCode` na notificação.

## 3. Decisões, ambiguidades e suposições

| Tema | Decisão |
|---|---|
| Stack | Node 20 + TypeScript + Fastify 5 + Zod 4 + SQLite (better-sqlite3). O protótipo é JS/React e a máquina tem Node; SQLite dispensa serviço externo; Fastify + Zod geram validação **e** OpenAPI a partir do mesmo schema. |
| Arquitetura | Monólito modular por domínio (`auth`, `users`, `addresses`, `payment-methods`, `catalog`, `cart`, `orders`, `notifications`, `home`), cada um com *routes → service → repository* e *schemas*. Composição manual de dependências em `container.ts`. Sem microserviços nem ORM. |
| "Todos" | Não é uma categoria: o app omite o filtro `category`. |
| Banner "20% OFF acima de R$ 40" × código do cupom | O código do protótipo aplica **10%** no RANGO10 sem mínimo; a regra do código foi adotada. O cupom tem `min_subtotal`, então dá para criar a promoção do banner sem mudar código. |
| Adicionais | O protótipo usa a mesma lista para qualquer produto; mantido global (tabela `addons`). |
| Bairro e cidade | O formulário tem um campo só; a API separa em `neighborhood` e `city` e devolve `line`/`cityLine` prontos para exibir. |
| Pagamento | Não há gateway: o pedido nasce **confirmado** (step 1). Cartões guardam só bandeira + 4 dígitos. PIX e dinheiro são criados no cadastro. "Troco para" é dado do pedido (`changeFor`). |
| Avanço do pedido | Sem restaurante/entregador reais: avança uma etapa a cada `ORDER_STEP_SECONDS` (padrão 20 s; 0 desliga), calculado sob demanda na leitura. |
| Cancelamento | O status `cancel` existe nos dados do protótipo. Permitido até a etapa "Pedido confirmado". |
| Pedir novamente | Igual ao protótipo: **substitui** o carrinho; usa preços atuais e ignora produtos indisponíveis (informados em `skippedProductIds`). |
| Recuperação de senha | Sem serviço de e-mail; o token vai para o log e, fora de produção, volta em `resetToken`. A resposta é sempre igual (não revela contas). |
| Push nativo | Exige FCM/APNs (fora do escopo). O app faz polling em `/notifications` e dispara notificação local. |
| Imagens de produto | O protótipo usa placeholders coloridos: a API devolve `imageHue` e `imageUrl: null`. |
| Catálogo exige login | O app só mostra o catálogo após o login, e `isFavorite` depende do usuário. |

## 4. Modelo de dados

```
users ─┬─< sessions               (refresh tokens, hash SHA-256)
       ├─< password_resets        (token hash, expira em 30 min, uso único)
       ├─< addresses              (1 selecionado por usuário — índice único parcial)
       ├─< payment_methods        (pix | credit | debit | cash; cartão = bandeira + last4)
       ├─< favorites >─ products
       ├─< recent_searches
       ├── carts ─ coupons        (cupom aplicado)
       ├─< cart_items >─ products (UNIQUE user+produto+adicionais)
       ├─< orders ─┬─< order_items   (snapshot nome/preço/adicionais)
       │           └─< order_events  (horário de cada etapa da timeline)
       └─< notifications ─ orders (deep link)
categories ─< products ─< product_tags (offers | popular | recommended | fast)
addons
```
Dinheiro em **centavos (INTEGER)** no banco e em **reais (number)** na API. Datas em ISO-8601 UTC.

## 5. Plano de entregas (executado)

1. Estrutura do projeto (TypeScript, scripts, variáveis de ambiente).
2. Schema SQL, runner de migrations e seed do catálogo/demo.
3. Núcleo: app Fastify, autenticação JWT, tratamento de erros, OpenAPI.
4. Autenticação e sessão (cadastro, login, refresh, logout, recuperação de senha).
5. Perfil, configurações, foto, endereços e formas de pagamento.
6. Catálogo, busca, recentes, sugestões, favoritos e Home.
7. Carrinho com regras de preço e cupom.
8. Pedidos (checkout, histórico, timeline simulada, cancelamento, pedir novamente) e notificações.
9. Testes unitários e de API para cada etapa.
10. Documentação (README, guia de integração, OpenAPI exportado) e Docker.
