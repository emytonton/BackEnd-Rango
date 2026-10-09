# Guia de integração do frontend (app Rango)

Contrato completo e interativo: **Swagger UI em `http://localhost:3333/docs`** (JSON em `/docs/json`; cópia
estática em [`docs/openapi.json`](openapi.json), gerada por `npm run openapi`).

## Convenções

| Item | Regra |
|---|---|
| Base URL | `http://localhost:3333`. No emulador Android use `http://10.0.2.2:3333`; em aparelho físico, o IP da máquina na rede. |
| Formato | JSON (`Content-Type: application/json`), exceto o upload de foto (`multipart/form-data`). |
| Autenticação | `Authorization: Bearer <accessToken>` em todas as rotas, exceto `/auth/*` e `/health`. |
| Dinheiro | `number` em reais (`34.9`). Formate no app (`R$ 34,90`). |
| Datas | ISO-8601 UTC (`2026-09-21T19:42:00.000Z`). Textos relativos ("há 4 min") ficam por conta do app. |
| Listas | Paginadas: `{ data: [...], meta: { page, pageSize, total, totalPages } }`, com `?page=1&pageSize=20` (máx. 50). |
| Erros | `{ "error": { "code", "message", "details?" } }`. Exiba `message` e decida o fluxo pelo `code`. `details` traz erros por campo (`field` = nome do campo do body). |

### Códigos HTTP

`200` ok · `201` criado · `202` aceito (esqueci a senha) · `204` sem corpo · `400` validação · `401` sem sessão ·
`404` não encontrado · `409` conflito · `413` arquivo grande · `415` arquivo não é imagem · `422` regra de negócio · `500` erro interno.

### Códigos de erro (`error.code`)

| code | Quando | Sugestão de UI |
|---|---|---|
| `VALIDATION_ERROR` | Body/query inválido | Marcar campos com `details[].field` |
| `INVALID_CREDENTIALS` | Login falhou | Estado "senha incorreta" |
| `EMAIL_IN_USE` | Cadastro/edição com e-mail existente | Erro no campo e-mail |
| `UNAUTHORIZED` / `INVALID_TOKEN` | Sem token / token inválido | Ir para login |
| `TOKEN_EXPIRED` | Access token venceu (15 min) | Chamar `/auth/refresh` e repetir |
| `INVALID_REFRESH_TOKEN` / `SESSION_EXPIRED` | Refresh inválido/vencido | Limpar sessão → login |
| `INVALID_RESET_TOKEN` | Link de redefinição inválido/expirado | Voltar ao passo 1 |
| `PRODUCT_NOT_FOUND`, `PRODUCT_UNAVAILABLE`, `INVALID_ADDON`, `QUANTITY_LIMIT` | Carrinho | Toast de erro |
| `INVALID_COUPON`, `COUPON_MIN_SUBTOTAL` | Cupom | Toast "Cupom inválido." |
| `EMPTY_CART`, `ADDRESS_REQUIRED`, `INVALID_CHANGE` | Checkout | Levar à tela correspondente |
| `ORDER_NOT_FOUND`, `ORDER_NOT_CANCELLABLE` | Pedidos | Toast |
| `FILE_REQUIRED`, `FILE_TOO_LARGE`, `UNSUPPORTED_IMAGE`, `MULTIPART_REQUIRED` | Foto de perfil | Toast |

## Sessão

```
POST /auth/login { email, password, keepSignedIn }
  → { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt, tokenType: "Bearer", user }
```

1. Guarde o `refreshToken` em armazenamento **seguro** (Keychain/Keystore, ex.: `expo-secure-store`). O
   `accessToken` pode ficar em memória.
2. Ao receber `401` com `TOKEN_EXPIRED`, chame `POST /auth/refresh { refreshToken }`, salve o **novo**
   refreshToken (ele é rotacionado) e repita a requisição. Use uma única renovação por vez: reutilizar um
   refresh token antigo encerra todas as sessões.
3. "Manter conectado" marcado: refresh válido por 30 dias. Desmarcado: 1 dia.
4. Na abertura do app (Splash): se houver refreshToken salvo → `/auth/refresh` → Home; senão → Boas-vindas.
5. Sair: `POST /auth/logout { refreshToken }` e limpe o armazenamento.

## Mapeamento tela → endpoint

| Tela | Chamadas |
|---|---|
| Login | `POST /auth/login` |
| Cadastro | `POST /auth/register` (`acceptTerms: true` obrigatório; devolve a sessão) |
| Recuperar senha 1→2 | `POST /auth/forgot-password { email }` (sempre 202) |
| Nova senha 3→4 | `POST /auth/reset-password { token, password, passwordConfirmation }` (`token` vem do link; em dev, de `resetToken`) |
| Home | `GET /home`; chips de categoria → `GET /products?category=<slug>` |
| Busca | `GET /search/recent`, `GET /search/suggestions?q=`, `GET /products?q=...&<filtros>`; ao abrir um resultado → `POST /search/recent { term }` |
| Filtros | Mesmos parâmetros de `GET /products` (tabela abaixo) |
| Produto | `GET /products/:id`; favoritar → `PUT/DELETE /favorites/:id`; adicionar → `POST /cart/items` |
| Carrinho | `GET /cart`, `PATCH /cart/items/:id { quantity }`, `DELETE /cart/items/:id`, `PUT /cart/coupon`, `DELETE /cart/coupon` |
| Checkout | `GET /cart` (resumo), `GET /addresses`, `GET /payment-methods`, `POST /orders` |
| Endereços | `GET/POST/PATCH/DELETE /addresses`, "Usar este endereço" → `POST /addresses/:id/select` |
| Pedido confirmado / Acompanhar | resposta do `POST /orders`; depois polling de `GET /orders/:id` (5–10 s) enquanto `status = "live"` |
| Meus pedidos | `GET /orders?group=live` e `GET /orders?group=past` |
| Detalhe do pedido | `GET /orders/:id` (aceita `RG-10482` ou `10482`); "Pedir novamente" → `POST /orders/:id/reorder` → tela Carrinho |
| Favoritos | `GET /favorites` |
| Notificações | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`; toque com `orderId` → Acompanhar |
| Perfil / Editar | `GET /me`, `PATCH /me`, `PUT /me/avatar`, `DELETE /me/avatar` |
| Configurações / Tema / Notificações | `GET /me/settings`, `PATCH /me/settings` |

### Filtros de produtos (protótipo → API)

| Protótipo (`state.filters`) | Query |
|---|---|
| `q` | `q` |
| `cat` (`'Todos'` = sem filtro) | `category` (slug `hamburguer`, `pizza`... ou o nome) |
| `maxPrice` | `maxPrice` |
| `rating` (0 = qualquer) | `minRating` |
| `time` (60 = qualquer) | `maxDeliveryTime` |
| `sort`: `rel`/`asc`/`desc`/`rating` | `sort`: `relevance`/`price_asc`/`price_desc`/`rating` |
| seções da Home (`tags`) | `section`: `offers`/`popular`/`recommended`/`fast` |

### Campos (protótipo → API)

`pid`→`productId` · `rest`→`restaurant` · `cat`→`category.name` · `old`→`oldPrice` · `desc`→`description` ·
`ing`→`ingredients` · `t:[min,max]`→`deliveryTime:{min,max}` · `hue`→`imageHue` · `favs`→`isFavorite` / `GET /favorites` ·
linha do carrinho `unit`→`unitPrice` · pedido `id:'RG-…'`→`code` (`id` numérico) · `step`/`status` iguais ao protótipo (`live`/`done`/`cancel`, etapas 0–4) ·
`notifs[].text`→`body`, `read`→`isRead`, `order`→`orderId`/`orderCode` · `notifPrefs`→`settings.notifications`.

## Exemplos

### Adicionar ao carrinho

```http
POST /cart/items
Authorization: Bearer <token>
Content-Type: application/json

{ "productId": "p1", "quantity": 1, "addonIds": ["a1"], "notes": "sem cebola" }
```

```json
{
  "items": [{
    "id": 7,
    "product": { "id": "p1", "name": "Burger duplo cheddar", "restaurant": "Casa do Burger", "imageUrl": null, "imageHue": 48, "isAvailable": true },
    "quantity": 1,
    "addons": [{ "id": "a1", "name": "Bacon extra", "price": 4 }],
    "notes": "sem cebola",
    "unitPrice": 38.9,
    "total": 38.9
  }],
  "coupon": null,
  "summary": { "itemCount": 1, "subtotal": 38.9, "deliveryFee": 7.9, "discount": 0, "total": 46.8, "freeDeliveryThreshold": 60 }
}
```

### Confirmar pedido

```http
POST /orders
{ "paymentMethodId": 1 }                    // endereço selecionado
{ "paymentMethodId": 4, "changeFor": 100 }   // dinheiro com troco
```

Resposta `201` (resumida):

```json
{
  "id": 10483, "code": "RG-10483", "status": "live", "step": 1, "statusLabel": "Pedido confirmado",
  "hint": "O restaurante aceitou seu pedido", "canCancel": true,
  "timeline": [
    { "step": 0, "label": "Pedido recebido", "state": "done", "reachedAt": "2026-09-21T19:42:00.000Z" },
    { "step": 1, "label": "Pedido confirmado", "state": "current", "reachedAt": "2026-09-21T19:42:00.000Z" },
    { "step": 2, "label": "Em preparação", "state": "upcoming", "reachedAt": null }
  ],
  "estimatedDelivery": { "minMinutes": 25, "maxMinutes": 35, "latestAt": "2026-09-21T20:17:00.000Z" },
  "items": [{ "productId": "p1", "name": "Burger duplo cheddar", "quantity": 1, "unitPrice": 38.9, "total": 38.9, "addons": [{ "id": "a1", "name": "Bacon extra", "price": 4 }], "notes": "", "imageHue": 48 }],
  "address": { "id": 1, "label": "Casa", "line": "Rua das Palmeiras, 128 · apto 42", "cityLine": "Pinheiros · São Paulo" },
  "payment": { "type": "pix", "label": "PIX", "detail": "Aprovação imediata", "changeFor": null },
  "amounts": { "subtotal": 38.9, "deliveryFee": 7.9, "discount": 0, "total": 46.8, "couponCode": null },
  "courier": { "name": "Juliana Prado", "vehicle": "Yamaha Factor 150" }
}
```

### Erro de validação

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "E-mail inválido.",
    "details": [
      { "field": "email", "message": "E-mail inválido." },
      { "field": "password", "message": "Mínimo de 6 caracteres." }
    ]
  }
}
```

### Upload da foto (React Native)

```ts
const form = new FormData();
form.append('file', { uri: croppedUri, name: 'avatar.jpg', type: 'image/jpeg' } as any);
await fetch(`${API}/me/avatar`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form });
// resposta: usuário com avatarUrl "/uploads/avatars/1-a1b2c3.jpg" → exibir `${API}${avatarUrl}`
```

O recorte e o zoom (bottom sheet "Tirar foto / Escolher da galeria") acontecem no app. Envie a imagem final
(JPG, PNG ou WEBP, até 5 MB).

## Estados de interface

| Estado | Como detectar |
|---|---|
| Loading / skeleton | Requisição em andamento |
| Vazio / sem resultados | `data: []` (`meta.total = 0`), `items: []` no carrinho, `GET /favorites` vazio |
| Erro | Status ≥ 400 → `error.message` em toast |
| Favoritado | `isFavorite` em qualquer produto |
| Lida / não lida | `isRead`; badge → `unreadCount` / `home.unreadNotifications` |
| Carrinho preenchido | `summary.itemCount > 0` (badge) |

## Offline e persistência local

A API não guarda estado de conexão. Recomendações para o app (fluxo 8 do protótipo):

- Cache das respostas de `GET /home`, `GET /favorites`, `GET /orders` e `GET /orders/:id` no armazenamento
  local. Sem rede, mostre o cache com a faixa "Sem conexão. Exibindo dados salvos no dispositivo.".
- Tema e preferências: aplique o valor salvo localmente e sincronize com `PATCH /me/settings` quando houver rede.
- Ações de escrita (carrinho, favoritos) feitas offline podem ficar numa fila e ser reenviadas: `PUT/DELETE /favorites` são idempotentes.

## Push

Não há integração com FCM/APNs. Para representar a push "Seu pedido saiu para entrega", faça polling de
`GET /notifications?unreadOnly=true` (ou de `GET /orders/:id` na tela de acompanhamento) e dispare uma
notificação local (ex.: `expo-notifications`) para cada id não lido que ainda não tenha sido exibido.
