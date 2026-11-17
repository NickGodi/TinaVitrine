import assert from 'node:assert/strict';
import test from 'node:test';
import {
  identifyProductFromImage,
  mapProductResearchError,
  researchProductFromImage,
  researchProductWithTavily,
} from './ai';

const searchResults = {
  answer: 'Dois preços atuais foram encontrados em lojas brasileiras.',
  results: [
    {
      title: 'Fone Bluetooth ANC — R$ 119,90',
      url: 'https://loja-a.example/fone',
      content: 'Fone sem fio com cancelamento de ruído por R$ 119,90.',
    },
    {
      title: 'Fone Bluetooth ANC',
      url: 'https://loja-b.example/fone',
      content: 'Compre o fone por R$ 149,90 em até 3 parcelas.',
    },
  ],
};

test('pesquisa por nome usa Tavily no Brasil e estima preços somente com preços encontrados', async () => {
  let requestPayload: Record<string, unknown> | undefined;
  let requestEndpoint = '';
  const result = await researchProductWithTavily(
    { query: 'Fone Bluetooth ANC' },
    {
      apiKey: 'tvly-test-key',
      request: async (endpoint, payload) => {
        requestEndpoint = endpoint;
        requestPayload = payload;
        return searchResults;
      },
    }
  );

  assert.equal(requestEndpoint, 'search');
  assert.equal(requestPayload?.country, 'brazil');
  assert.equal(requestPayload?.search_depth, 'basic');
  assert.equal(result.name, 'Fone Bluetooth ANC');
  assert.equal(result.minPrice, 119.9);
  assert.equal(result.maxPrice, 149.9);
  assert.equal(result.avgPrice, 134.9);
  assert.equal(result.suggestedPrice, 126.81);
  assert.equal(result.priceCount, 2);
  assert.equal(result.sources.length, 2);
  assert.equal(result.category, 'Áudio');
  assert.deepEqual(result.tags, ['fone', 'bluetooth', 'anc', 'audio']);
});

test('a descrição do produto mantém características e remove preços dos trechos pesquisados', async () => {
  const result = await researchProductWithTavily(
    { query: 'Fone Bluetooth ANC' },
    {
      apiKey: 'tvly-test-key',
      request: async () => ({
        answer: JSON.stringify({
          description: 'Fone sem fio com cancelamento ativo de ruído por R$ 119,90. Preço promocional válido hoje.',
        }),
        results: [{
          title: 'Fone Bluetooth ANC — R$ 119,90',
          url: 'https://loja.example/fone',
          content: 'Fone sem fio com cancelamento ativo de ruído e conexão Bluetooth multiponto. Por apenas R$ 119,90.',
        }],
      }),
    }
  );

  assert.match(result.description, /cancelamento ativo de ruído/);
  assert.match(result.description, /Bluetooth multiponto/);
  assert.doesNotMatch(result.description, /R\$|preço|promoção|119,90/i);
});

test('formata a descrição em apresentação e destaques, sem política de devolução', async () => {
  const result = await researchProductWithTavily(
    { query: 'Fone Bluetooth ANC' },
    {
      apiKey: 'tvly-test-key',
      request: async () => ({
        answer: JSON.stringify({
          description: 'O fone sem fio oferece cancelamento ativo de ruído para uma audição mais imersiva. Os drivers de 40 mm entregam áudio claro em diferentes frequências. O produto pode ser devolvido em até 30 dias por R$ 99,90.',
        }),
        results: [{
          title: 'Fone Bluetooth ANC',
          url: 'https://loja.example/fone',
          content: 'Fone sem fio com cancelamento ativo de ruído para uma audição mais imersiva. Os drivers de 40 mm entregam áudio claro em diferentes frequências.',
        }],
      }),
    }
  );

  assert.match(result.description, /\n\nDestaques\n•/);
  assert.match(result.description, /cancelamento ativo de ruído/);
  assert.match(result.description, /drivers de 40 mm/);
  assert.doesNotMatch(result.description, /devolv|devolu|R\$/i);
});

test('pesquisa uma página de produto antes de consultar preços e aproveita sua imagem', async () => {
  const endpoints: string[] = [];
  const searchPayloads: Record<string, unknown>[] = [];
  const result = await researchProductWithTavily(
    { productUrl: 'https://loja.example/cafeteira-inox' },
    {
      apiKey: 'tvly-test-key',
      request: async (endpoint, payload) => {
        endpoints.push(endpoint);
        if (endpoint === 'extract') {
          return {
            results: [{
              url: 'https://loja.example/cafeteira-inox',
              raw_content: '# Cafeteira Espresso Inox\nMáquina semiautomática para café espresso.',
              images: [{ url: 'https://cdn.example/cafeteira.jpg' }],
            }],
          };
        }
        searchPayloads.push(payload);
        return searchResults;
      },
    }
  );

  assert.deepEqual(endpoints, ['extract', 'search']);
  assert.match(String(searchPayloads[0]?.query), /Cafeteira Espresso Inox/);
  assert.equal(result.name, 'Cafeteira Espresso Inox');
  assert.equal(result.imageUrl, 'https://cdn.example/cafeteira.jpg');
});

test('imagem por URL é identificada antes da pesquisa Tavily e preservada no produto', async () => {
  let visionImage = '';
  let tavilyQuery = '';
  const result = await researchProductFromImage(
    { imageUrl: 'https://cdn.example/fone.jpg' },
    {
      vision: {
        apiKey: 'groq-test-key',
        request: async (image) => {
          visionImage = image;
          return { choices: [{ message: { content: '{"name":"JBL Tune 720BT"}' } }] };
        },
      },
      tavily: {
        apiKey: 'tvly-test-key',
        request: async (_endpoint, payload) => {
          tavilyQuery = String(payload.query || '');
          return searchResults;
        },
      },
    }
  );

  assert.equal(visionImage, 'https://cdn.example/fone.jpg');
  assert.match(tavilyQuery, /JBL Tune 720BT/);
  assert.equal(result.name, 'JBL Tune 720BT');
  assert.equal(result.imageUrl, 'https://cdn.example/fone.jpg');
});

test('imagem colada em data URL pode ser identificada e pesquisada automaticamente', async () => {
  const endpoints: string[] = [];
  const result = await researchProductFromImage(
    { imageDataUrl: 'data:image/png;base64,aW1hZ2U=' },
    {
      vision: {
        apiKey: 'groq-test-key',
        request: async (image) => {
          assert.equal(image, 'data:image/png;base64,aW1hZ2U=');
          return { choices: [{ message: { content: '{"name":"Cafeteira Espresso Inox"}' } }] };
        },
      },
      tavily: {
        apiKey: 'tvly-test-key',
        request: async (endpoint) => {
          endpoints.push(endpoint);
          return searchResults;
        },
      },
    }
  );

  assert.deepEqual(endpoints, ['search']);
  assert.equal(result.name, 'Cafeteira Espresso Inox');
});

test('recusa URL de imagem privada e exibe erro quando a chave Groq não foi configurada', async () => {
  await assert.rejects(
    identifyProductFromImage({ imageUrl: 'http://127.0.0.1/logo.png' }, { apiKey: 'groq-test-key' }),
    /VISION_INVALID_IMAGE_URL/
  );
  const missing = mapProductResearchError(new Error('GROQ_API_KEY_MISSING'));
  assert.equal(missing.status, 503);
  assert.match(missing.message, /GROQ_API_KEY/);
});

test('recusa URL inválida ou privada antes de chamar Tavily', async () => {
  let requestCount = 0;
  await assert.rejects(
    researchProductWithTavily(
      { productUrl: 'http://localhost:3000/admin' },
      {
        apiKey: 'tvly-test-key',
        request: async () => {
          requestCount += 1;
          return {};
        },
      }
    ),
    /TAVILY_INVALID_PRODUCT_URL/
  );
  assert.equal(requestCount, 0);
});

test('não inventa média quando a pesquisa encontra menos de dois preços', async () => {
  const result = await researchProductWithTavily(
    { query: 'Produto raro' },
    {
      apiKey: 'tvly-test-key',
      request: async () => ({
        results: [{
          title: 'Produto raro R$ 199,90',
          url: 'https://loja.example/produto',
          content: 'Produto raro por R$ 199,90.',
        }],
      }),
    }
  );

  assert.equal(result.priceCount, 1);
  assert.equal(result.minPrice, null);
  assert.equal(result.avgPrice, null);
  assert.equal(result.maxPrice, null);
  assert.equal(result.suggestedPrice, null);
});

test('mapeia chave ausente e limite de créditos da Tavily', () => {
  const missing = mapProductResearchError(new Error('TAVILY_API_KEY_MISSING'));
  const limited = mapProductResearchError(new Error('TAVILY_HTTP_429'));

  assert.equal(missing.status, 503);
  assert.match(missing.message, /TAVILY_API_KEY/);
  assert.equal(limited.status, 429);
  assert.match(limited.message, /cota mensal da Tavily/);
});
