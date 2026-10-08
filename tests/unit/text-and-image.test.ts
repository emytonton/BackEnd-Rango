import { describe, expect, it } from 'vitest';
import { escapeLike, normalize } from '../../src/lib/text';
import { detectImageType } from '../../src/modules/users/profile.service';
import { PNG_1PX } from '../helpers';

describe('normalize', () => {
  it('remove acentos e caixa (busca "acai" encontra "Açaí")', () => {
    expect(normalize('  Açaí 500ml ')).toBe('acai 500ml');
    expect(normalize('PETIT GÂTEAU')).toBe('petit gateau');
  });

  it('escapa curingas do LIKE', () => {
    expect(escapeLike('50%_off')).toBe('50\\%\\_off');
  });
});

describe('detectImageType', () => {
  it('reconhece PNG, JPEG e WEBP pelos magic bytes', () => {
    expect(detectImageType(PNG_1PX)).toBe('png');
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('jpg');
    expect(detectImageType(Buffer.from('RIFF0000WEBPVP8 ', 'ascii'))).toBe('webp');
  });

  it('rejeita conteúdo que não é imagem, mesmo com extensão de imagem', () => {
    expect(detectImageType(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});
