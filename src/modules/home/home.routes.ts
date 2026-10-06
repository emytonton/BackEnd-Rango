import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Services } from '../../container';
import { bearer, errorResponses } from '../../lib/http-schemas';
import { addressDto } from '../addresses/address.schemas';
import { categoryDto, productSummaryDto, sectionField } from '../catalog/catalog.schemas';

const homeResponse = z.object({
  user: z.object({ name: z.string(), firstName: z.string(), avatarUrl: z.string().nullable() }),
  selectedAddress: addressDto.nullable().describe('null quando o usuário ainda não cadastrou endereço'),
  cartItemCount: z.number().int().describe('Badge do ícone do carrinho'),
  unreadNotifications: z.number().int().describe('Ponto no ícone do sino'),
  categories: z.array(categoryDto),
  sections: z.array(z.object({ key: sectionField, title: z.string(), products: z.array(productSummaryDto) })),
});

export const homeRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  app.get(
    '/home',
    {
      schema: {
        tags: ['Catálogo'],
        summary: 'Tudo que a Home precisa em uma chamada',
        description:
          'Cabeçalho (saudação, endereço, foto, badges), categorias e as seções "Ofertas para você", ' +
          '"Mais pedidos", "Recomendados" e "Entrega rápida". Boa candidata a cache offline no app.',
        security: bearer,
        response: { 200: homeResponse, ...errorResponses(401) },
      },
    },
    async (req) => {
      const userId = req.user.id;
      services.orders.syncUserOrders(userId);
      const me = services.profile.get(userId);
      return {
        user: { name: me.name, firstName: me.name.split(' ')[0], avatarUrl: me.avatarUrl },
        selectedAddress: services.addresses.selected(userId),
        cartItemCount: services.cart.itemCount(userId),
        unreadNotifications: services.notifications.unreadCount(userId),
        categories: services.catalog.categories(),
        sections: services.catalog.sections(userId),
      };
    },
  );
};
