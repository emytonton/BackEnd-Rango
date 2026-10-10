# Rango · Backend

API do app de delivery **Rango**, construída a partir do protótipo mobile navegável.
Ela substitui todos os dados fictícios do protótipo: catálogo, carrinho, pedidos, favoritos, notificações,
perfil e preferências passam a ser persistidos e validados no servidor.


## Stack

| | Escolha | Por quê |
|---|---|---|
| Runtime | Node.js 20 + TypeScript (strict) | Mesmo ecossistema do protótipo (React/JS); tipagem ponta a ponta |
| HTTP | Fastify 5 | Leve, rápido, `inject()` para testes sem abrir porta |
| Validação + docs | Zod 4 + `fastify-type-provider-zod` + Swagger | Um schema só valida a entrada, filtra a saída e gera o OpenAPI |
| Banco | SQLite via `better-sqlite3` | Zero instalação; um arquivo; transações síncronas simples |
| Migrations | SQL versionado (`src/db/migrations/NNN_*.sql`) + runner próprio | Transparente, sem ORM |
| Auth | JWT de acesso (15 min) + refresh token opaco rotativo (hash no banco), bcrypt | Sessão segura para app mobile, com "Manter conectado" |
| Testes | Vitest | Unitários (regras puras) + API (SQLite em memória, relógio controlável) |

Arquitetura: **monólito modular** por domínio. Cada módulo tem `routes` (HTTP + schema), `service` (regras de
negócio), `repository` (SQL) e `schemas` (DTOs Zod). As dependências são montadas à mão em `src/container.ts`.
Análise completa do protótipo, decisões e suposições: [`docs/ANALISE-E-PLANO.md`](docs/ANALISE-E-PLANO.md).

```
src/
├── app.ts                 # monta o Fastify (CORS, JWT, multipart, estáticos, Swagger, rotas)
├── server.ts              # entrypoint HTTP
├── config.ts              # variáveis de ambiente validadas com Zod
├── container.ts           # composição de repositórios e serviços
├── db/
│   ├── migrations/001_initial_schema.sql
│   ├── migrate.ts         # aplica migrations pendentes (tabela schema_migrations)
│   ├── seed.ts            # catálogo (idempotente) + usuária demo
│   └── seed-data.ts       # dados extraídos do protótipo
├── lib/                   # erros, dinheiro, texto, paginação, relógio, schemas HTTP comuns
├── plugins/               # autenticação (onRequest) e tratamento de erros padronizado
└── modules/
    ├── auth/              # cadastro, login, refresh, logout, recuperação de senha
    ├── users/             # perfil, foto, configurações (tema, notificações)
    ├── addresses/         # CRUD + endereço selecionado
    ├── payment-methods/   # PIX, cartões (bandeira + 4 dígitos), dinheiro
    ├── catalog/           # categorias, produtos, busca, sugestões, recentes, favoritos
    ├── home/              # agregado da tela inicial
    ├── cart/              # carrinho + regras de preço (pricing.ts)
    ├── orders/            # checkout, histórico, timeline, cancelar, pedir novamente
    └── notifications/     # central de notificações
tests/
├── unit/                  # pricing, máquina de estados do pedido, texto/imagem
└── api/                   # fluxos HTTP completos por módulo
docs/
├── ANALISE-E-PLANO.md
├── INTEGRACAO-FRONTEND.md # guia do frontend: sessão, telas → endpoints, erros, exemplos
└── openapi.json           # contrato exportado
```

## Como executar

Pré-requisito: **Node.js 20+** (testado com 20.19). Não precisa de banco externo.

```bash
npm install
```

```bash
cp .env.example .env
```

O `.env` é opcional: todos os valores têm padrão de desenvolvimento.

```bash
npm run dev
```

- A API sobe em `http://localhost:3333` e já aplica as migrations, sincroniza o catálogo e cria a usuária demo.
- Swagger UI: **http://localhost:3333/docs**
- Usuária demo (a mesma do protótipo): **marina.alves@email.com / rango123**

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run migrate` | Aplica migrations pendentes no banco de `DATABASE_PATH` |
| `npm run seed` | Migra, sincroniza o catálogo e cria a usuária demo (se não existir) |
| `npm run seed -- --reset` | Apaga o banco e recria tudo do zero |
| `npm run build` / `npm start` | Compila para `dist/` e executa a versão compilada |
| `npm run typecheck` | Checagem de tipos |
| `npm run openapi` | Regenera `docs/openapi.json` |
| `npm test` | Roda todos os testes |

### Docker (opcional)

```bash
docker compose up --build
```

O banco e as fotos ficam em volumes. **Observação:** o Dockerfile e o compose foram escritos mas não puderam ser
validados no ambiente de desenvolvimento, porque o daemon do Docker não estava em execução.

### Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` / `HOST` | `3333` / `0.0.0.0` | Endereço HTTP |
| `DATABASE_PATH` | `./data/rango.db` | Arquivo SQLite (`:memory:` para banco descartável) |
| `UPLOAD_DIR` | `./uploads` | Onde as fotos de perfil são gravadas (servidas em `/uploads/...`) |
| `JWT_SECRET` | valor de dev | **Obrigatório** trocar com `NODE_ENV=production` (a API não sobe sem isso) |
| `ACCESS_TOKEN_TTL` | `15m` | Validade do access token |
| `REFRESH_TTL_DAYS` / `REFRESH_TTL_DAYS_KEEP_SIGNED_IN` | `1` / `30` | Validade do refresh token sem / com "Manter conectado" |
| `CORS_ORIGINS` | `*` | Origens permitidas, separadas por vírgula |
| `DELIVERY_FEE` / `FREE_DELIVERY_THRESHOLD` | `7.9` / `60` | Regras de entrega do protótipo (R$) |
| `ORDER_STEP_SECONDS` | `20` | Intervalo da simulação de avanço do pedido (`0` desliga) |
| `EXPOSE_RESET_TOKEN` | `true` | Devolve o token de redefinição de senha na resposta (ignorado em produção) |
| `SEED_DEMO_DATA` | `true` em development | Cria a usuária demo ao iniciar |
| `BCRYPT_ROUNDS` | `10` | Custo do hash de senha |

## Testes

```bash
npm test
```

São 84 testes em 8 arquivos. Eles cobrem:

- **Unitários**: regras de preço (adicionais, frete grátis ≥ R$ 60, cupom, arredondamento), máquina de estados
  do pedido, normalização de busca e detecção de imagem por magic bytes.
- **API**: cadastro e login (com as mensagens do protótipo), rotação e reuso de refresh token, "Manter conectado",
  recuperação de senha completa, catálogo, filtros, ordenação e paginação, busca sem acento, recentes,
  favoritos, carrinho e cupom, checkout e seus erros, avanço da timeline com notificações, preferências de
  notificação, cancelamento, histórico, pedir novamente, perfil, upload de foto, endereços e pagamentos.

Os testes usam SQLite em memória e um relógio injetável. Não dependem de rede nem de esperas reais.

## Endpoints

Todas as rotas, exceto `/health` e `/auth/*`, exigem `Authorization: Bearer <accessToken>`. Contratos,
exemplos e o mapeamento tela → endpoint estão no [guia de integração](docs/INTEGRACAO-FRONTEND.md) e no Swagger.

| Grupo | Endpoints |
|---|---|
| Infra | `GET /health` |
| Autenticação | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `POST /auth/forgot-password` · `POST /auth/reset-password` |
| Perfil | `GET /me` · `PATCH /me` · `PUT /me/avatar` (multipart) · `DELETE /me/avatar` |
| Configurações | `GET /me/settings` · `PATCH /me/settings` |
| Endereços | `GET /addresses` · `POST /addresses` · `PATCH /addresses/:id` · `DELETE /addresses/:id` · `POST /addresses/:id/select` |
| Pagamento | `GET /payment-methods` · `POST /payment-methods` · `DELETE /payment-methods/:id` |
| Catálogo | `GET /home` · `GET /categories` · `GET /products` · `GET /products/:productId` |
| Busca | `GET /search/suggestions` · `GET /search/recent` · `POST /search/recent` · `DELETE /search/recent` |
| Favoritos | `GET /favorites` · `PUT /favorites/:productId` · `DELETE /favorites/:productId` |
| Carrinho | `GET /cart` · `DELETE /cart` · `POST /cart/items` · `PATCH /cart/items/:id` · `DELETE /cart/items/:id` · `PUT /cart/coupon` · `DELETE /cart/coupon` |
| Pedidos | `POST /orders` · `GET /orders` · `GET /orders/:id` · `POST /orders/:id/cancel` · `POST /orders/:id/reorder` |
| Notificações | `GET /notifications` · `POST /notifications/:id/read` · `POST /notifications/read-all` |

## Regras de negócio (do protótipo)

- Preço unitário = produto + adicionais. Mesmo produto com os mesmos adicionais soma na mesma linha (máx. 99).
- Entrega de R$ 7,90, grátis com subtotal ≥ R$ 60. Carrinho vazio não paga entrega.
- Cupom `RANGO10`: 10% sobre o subtotal.
- Pedido: `Pedido recebido → confirmado → em preparação → saiu para entrega → entregue`. Nasce confirmado
  (sem gateway de pagamento) e avança sozinho a cada `ORDER_STEP_SECONDS`. Gera notificações em
  "confirmado", "saiu para entrega" e "chegou", respeitando as preferências do usuário. Pode ser cancelado
  até a confirmação.
- O pedido guarda cópia do endereço, do pagamento, dos preços e dos adicionais, então o histórico não muda
  se o catálogo ou os cadastros mudarem.
- "Pedir novamente" substitui o carrinho pelos itens do pedido, com preços atuais e sem os produtos indisponíveis.

## Segurança básica

- Senhas com bcrypt. Refresh tokens e tokens de redefinição guardados só como hash SHA-256.
- Refresh token rotativo, com detecção de reuso (revoga todas as sessões).
- Login e "esqueci a senha" não revelam se um e-mail está cadastrado.
- Toda consulta é filtrada pelo usuário autenticado; recurso de outro usuário responde 404.
- SQL sempre parametrizado; curingas de `LIKE` escapados.
- Upload validado pelo conteúdo (magic bytes), com limite de 5 MB e nome de arquivo gerado pelo servidor.
- Cartões: só bandeira e 4 últimos dígitos.
- Respostas filtradas pelo schema (nunca vazam hash de senha); erros 500 sem detalhes internos.
- `JWT_SECRET` obrigatório em produção.

## Limitações conhecidas

- **Sem envio de e-mail.** O token de redefinição de senha aparece no log e, em desenvolvimento, na resposta.
- **Sem push nativo (FCM/APNs).** O app usa polling de `/notifications` e notificação local.
- **Sem gateway de pagamento.** Pedidos são aprovados na hora.
- **Restaurante e entregador são simulados.** A timeline avança por tempo; o entregador vem de uma lista fixa.
- **Imagens de produtos:** o catálogo de demonstração usa `imageHue` (placeholder colorido do protótipo);
  `imageUrl` fica `null`.
- **Offline/cache e recorte de foto ficam no app** (veja o guia de integração).
- Sem rate limiting, sem painel administrativo para o catálogo e sem exclusão de conta, porque nada disso aparece no protótipo.


