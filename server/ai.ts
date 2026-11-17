type TavilyEndpoint = 'search' | 'extract';

type VisionImageInput = { imageUrl?: string; imageDataUrl?: string };

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  images?: Array<string | { url?: string }>;
}

interface TavilySearchResponse {
  answer?: string;
  results?: TavilyResult[];
}

interface TavilyExtractResponse {
  results?: Array<{
    url?: string;
    raw_content?: string;
    images?: Array<string | { url?: string }>;
  }>;
  failed_results?: Array<{ url?: string; error?: string }>;
}

export interface TavilyDependencies {
  apiKey?: string;
  request?: (
    endpoint: TavilyEndpoint,
    payload: Record<string, unknown>,
    apiKey: string
  ) => Promise<unknown>;
}

export interface VisionDependencies {
  apiKey?: string;
  request?: (image: string, prompt: string, apiKey: string) => Promise<unknown>;
}

export interface ProductAIResearchInput {
  query?: string;
  productUrl?: string;
}

export interface ProductImageResearchInput extends VisionImageInput {
  query?: string;
}

export interface ProductAIResearchResult {
  name: string;
  minPrice: number | null;
  maxPrice: number | null;
  avgPrice: number | null;
  suggestedPrice: number | null;
  priceCount: number;
  description: string;
  category: string;
  tags: string[];
  facebookCaption: string;
  imageUrl: string;
  sources: Array<{ title: string; uri: string }>;
}

function safeHttpUrl(value: string | undefined) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    const hostname = url.hostname.toLowerCase();
    const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
    const isPrivateIpv4 = ipv4 && (
      ipv4[0] === 0 || ipv4[0] === 10 || ipv4[0] === 127 || ipv4[0] >= 224 ||
      (ipv4[0] === 169 && ipv4[1] === 254) ||
      (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) ||
      (ipv4[0] === 192 && ipv4[1] === 168)
    );
    const ipv6Hostname = hostname.replace(/^\[|\]$/g, '');
    const isPrivateIpv6 = ipv6Hostname.includes(':') && /^(::1|fc|fd|fe80:)/i.test(ipv6Hostname);
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      isPrivateIpv4 ||
      isPrivateIpv6
    ) {
      return '';
    }
    return url.toString();
  } catch {
    return '';
  }
}

async function requestGroqVision(image: string, prompt: string, apiKey: string): Promise<unknown> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen/qwen3.8-27b',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: image } },
        ],
      }],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_completion_tokens: 180,
      stream: false,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) throw new Error(`GROQ_HTTP_${response.status}`);
  return response.json();
}

function getVisionImage(input: VisionImageInput) {
  const imageDataUrl = asText(input.imageDataUrl);
  if (imageDataUrl) {
    const match = imageDataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,([a-z0-9+/=]+)$/i);
    if (!match || imageDataUrl.length > 10_000_000) throw new Error('VISION_INVALID_IMAGE');
    return imageDataUrl;
  }

  const imageUrl = safeHttpUrl(asText(input.imageUrl));
  if (!imageUrl) throw new Error('VISION_INVALID_IMAGE_URL');
  return imageUrl;
}

function parseVisionName(response: unknown) {
  if (!response || typeof response !== 'object') return '';
  const choices = (response as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
  const raw = choices?.[0]?.message?.content;
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return '';
  try {
    const parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    const name = asText(parsed.name || parsed.product_name || parsed.product);
    if (!name || /^(unknown|desconhecido|não identificado|produto)$/i.test(name)) return '';
    return name.slice(0, 180);
  } catch {
    return '';
  }
}

export async function identifyProductFromImage(
  input: ProductImageResearchInput,
  dependencies: VisionDependencies = {}
) {
  const apiKey = dependencies.apiKey ?? process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'SUA_CHAVE_GROQ') throw new Error('GROQ_API_KEY_MISSING');

  const image = getVisionImage(input);
  const hint = asText(input.query).slice(0, 200);
  const prompt = [
    'Identifique o produto mostrado na imagem para uma pesquisa de preços em lojas brasileiras.',
    'Responda somente em JSON válido no formato {"name":"marca e modelo, se estiverem visíveis; caso contrário, nome específico do produto"}.',
    'Não invente marca, modelo ou especificações que não estejam visíveis. Não descreva o cenário.',
    hint ? `Dica fornecida pelo usuário: ${hint}` : '',
  ].filter(Boolean).join('\n');
  const request = dependencies.request ?? requestGroqVision;
  const productName = parseVisionName(await request(image, prompt, apiKey));
  if (!productName) throw new Error('VISION_PRODUCT_NOT_IDENTIFIED');
  return productName;
}

export async function researchProductFromImage(
  input: ProductImageResearchInput,
  dependencies: { vision?: VisionDependencies; tavily?: TavilyDependencies } = {}
) {
  const image = getVisionImage(input);
  const name = await identifyProductFromImage(input, dependencies.vision);
  const result = await researchProductWithTavily({ query: name }, dependencies.tavily);
  if (asText(input.imageUrl)) result.imageUrl = image;
  return result;
}

async function requestTavily(
  endpoint: TavilyEndpoint,
  payload: Record<string, unknown>,
  apiKey: string
): Promise<unknown> {
  const response = await fetch(`https://api.tavily.com/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    throw new Error(`TAVILY_HTTP_${response.status}`);
  }
  return response.json();
}

function parseAnswerObject(answer: string | undefined): Record<string, unknown> {
  if (!answer) return {};
  const trimmed = answer.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return {};
  try {
    const parsed: unknown = JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function extractPageTitle(content: string) {
  const markdownHeading = content.match(/^\s*#{1,3}\s+(.+)$/m)?.[1];
  if (markdownHeading) return markdownHeading.replace(/\s+/g, ' ').trim().slice(0, 180);
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/^[#>*\s-]+/, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim())
    .find((line) => line.length >= 8 && line.length <= 180)
    ?.replace(/\s+/g, ' ');
}

function getExtractedImageUrl(extract: TavilyExtractResponse) {
  const result = extract.results?.[0];
  const candidates = [...(result?.images ?? [])];
  const image = candidates
    .map((candidate) => typeof candidate === 'string' ? candidate : candidate.url || '')
    .map(safeHttpUrl)
    .find(Boolean);
  return image || '';
}

function parseBrazilianPrice(raw: string) {
  let normalized = raw.trim();
  if (normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (/\.\d{3}$/.test(normalized)) {
    normalized = normalized.replace('.', '');
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 1 && amount <= 10_000_000 ? amount : null;
}

function extractPrices(text: string) {
  const prices: number[] = [];
  const pattern = /R\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?)/gi;
  for (const match of text.matchAll(pattern)) {
    const price = parseBrazilianPrice(match[1]);
    if (price !== null) prices.push(price);
  }
  return prices;
}

function getPriceStats(results: TavilyResult[]) {
  // Keep at most one visible listing price per search result, avoiding repeated
  // installment and crossed-out prices in the same snippet from skewing the mean.
  const prices = results
    .map((result) => extractPrices(`${result.title || ''}\n${result.content || ''}`)[0])
    .filter((price): price is number => price !== undefined);
  const sortedPrices = prices.sort((a, b) => a - b);
  if (sortedPrices.length < 2) {
    return { minPrice: null, maxPrice: null, avgPrice: null, suggestedPrice: null, priceCount: sortedPrices.length };
  }
  const avgPrice = sortedPrices.reduce((sum, price) => sum + price, 0) / sortedPrices.length;
  return {
    minPrice: Number(sortedPrices[0].toFixed(2)),
    maxPrice: Number(sortedPrices[sortedPrices.length - 1].toFixed(2)),
    avgPrice: Number(avgPrice.toFixed(2)),
    suggestedPrice: Number((avgPrice * 0.94).toFixed(2)),
    priceCount: sortedPrices.length,
  };
}

function inferCategory(name: string, content: string) {
  const sample = `${name} ${content}`.toLowerCase();
  const categories: Array<[string, string[]]> = [
    ['Áudio', ['fone', 'headphone', 'headset', 'caixa de som', 'speaker', 'microfone', 'earbud']],
    ['Casa & Cozinha', ['cafeteira', 'espresso', 'liquidificador', 'air fryer', 'cozinha', 'panela']],
    ['Periféricos', ['teclado', 'mouse', 'monitor', 'webcam', 'mousepad']],
    ['Wearables', ['smartwatch', 'relógio inteligente', 'smart band', 'pulseira inteligente']],
    ['Acessórios', ['mochila', 'bolsa', 'carteira', 'capa', 'carregador', 'cabo']],
    ['Eletrônicos', ['celular', 'smartphone', 'tablet', 'notebook', 'computador', 'eletrônico']],
    ['Esportes', ['fitness', 'academia', 'corrida', 'bicicleta', 'esportivo']],
    ['Beleza', ['skincare', 'maquiagem', 'secador', 'perfume', 'beleza']],
  ];
  return categories.find(([, words]) => words.some((word) => sample.includes(word)))?.[0] || 'Eletrônicos';
}

function buildTags(name: string, category: string) {
  const stopWords = new Set(['para', 'com', 'sem', 'de', 'da', 'do', 'e', 'the', 'por', 'novo', 'original']);
  const tokens = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !stopWords.has(token));
  const categoryTag = category
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return [...new Set([...tokens, categoryTag])].filter(Boolean).slice(0, 6);
}

function buildProductDescription(
  structuredDescription: unknown,
  results: TavilyResult[],
  name: string
) {
  const samples = [
    asText(structuredDescription),
    ...results.flatMap((result) => [asText(result.content), asText(result.title)]),
  ].filter(Boolean);
  const priceRelated = /\b(preço|precos|preços|valor|custa|custam|parcela|parcelas|oferta|desconto|economia|promoção)\b/i;
  const returnRelated = /\b(devolu[cç][ãa]o|devolver|devolvido|reembolso|estorno|return(?:s|ed)?)\b/i;
  const salesBoilerplate = /\b(compre agora|compre já|aproveite|oferta imperdível|frete grátis|envio grátis|últimas unidades)\b/i;
  const currency = /(?:R\$|US\$|BRL\s*|\$\s*)\s*\d[\d.,]*/gi;
  const priceClause = /\b(?:a partir de|por apenas|por|custando|custa|preço de|valor de)\s*(?:R\$\s*)?\d[\d.,]*/gi;
  const descriptionSentences: string[] = [];

  for (const sample of samples) {
    const withoutPrices = sample
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\s*#{1,6}\s*/gm, '')
      .replace(/^\s*[-*•]\s*/gm, '')
      .replace(priceClause, ' ')
      .replace(currency, ' ')
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:x|parcelas?)\b/gi, ' ')
      .replace(/\b(?:em até|em ate)\s+\d+\s+dias?\b/gi, ' ')
      .replace(/[()\[\]]/g, ' ')
      .replace(/\s+/g, ' ');
    const sentences = withoutPrices
      .split(/(?<=[.!?])\s+|\s*[;\n]\s*/)
      .map((sentence) => sentence.replace(/\s+([,.;!?])/g, '$1').replace(/[,;:\s]+$/g, '').trim())
      .filter((sentence) => sentence.length >= 35 && !priceRelated.test(sentence) &&
        !returnRelated.test(sentence) && !salesBoilerplate.test(sentence));
    for (const sentence of sentences) {
      if (sentence.toLowerCase() !== name.toLowerCase() &&
        !descriptionSentences.some((existing) => existing.toLowerCase() === sentence.toLowerCase())) {
        descriptionSentences.push(sentence);
      }
    }
    if (descriptionSentences.join(' ').length >= 260) break;
  }

  if (descriptionSentences.length) {
    const introduction = descriptionSentences[0];
    const highlights = descriptionSentences.slice(1, 4);
    const formatted = highlights.length
      ? `${introduction}\n\nDestaques\n${highlights.map((sentence) => `• ${sentence}`).join('\n')}`
      : introduction;
    return formatted.slice(0, 460);
  }

  return `${name}\n\nAs fontes consultadas não trouxeram detalhes confiáveis sobre as características do produto.`;
}

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => String(tag).toLowerCase().trim().replace(/^#/, ''))
    .filter(Boolean)
    .slice(0, 6);
}

export function mapProductResearchError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Erro desconhecido';
  if (message === 'GROQ_API_KEY_MISSING') {
    return {
      status: 503,
      message: 'O reconhecimento de imagens ainda não está configurado. Adicione GROQ_API_KEY ao ambiente do servidor.',
    };
  }
  if (message === 'VISION_INVALID_IMAGE' || message === 'VISION_INVALID_IMAGE_URL') {
    return {
      status: 400,
      message: message === 'VISION_INVALID_IMAGE_URL'
        ? 'Informe a URL pública direta de uma imagem JPEG, PNG ou WebP.'
        : 'A imagem precisa ser JPEG, PNG ou WebP e ter até 7 MB.',
    };
  }
  if (message === 'VISION_PRODUCT_NOT_IDENTIFIED') {
    return { status: 422, message: 'Não consegui identificar o produto nessa imagem. Tente uma foto mais nítida ou informe o nome/modelo.' };
  }
  if (/GROQ_HTTP_401|GROQ_HTTP_403/.test(message)) {
    return { status: 503, message: 'A chave Groq foi recusada. Confira GROQ_API_KEY no ambiente do servidor.' };
  }
  if (/GROQ_HTTP_429/.test(message)) {
    return { status: 429, message: 'O limite temporário do reconhecimento de imagens foi atingido. Aguarde um pouco e tente novamente.' };
  }
  if (/GROQ_HTTP_400/.test(message)) {
    return { status: 422, message: 'A API de reconhecimento não aceitou a imagem. Confira se a URL aponta diretamente para um arquivo JPEG, PNG ou WebP acessível.' };
  }
  if (/GROQ_HTTP_5\d\d/.test(message)) {
    return { status: 502, message: 'O serviço de reconhecimento de imagens está indisponível. Tente novamente em instantes.' };
  }
  if (message === 'TAVILY_API_KEY_MISSING') {
    return {
      status: 503,
      message: 'A pesquisa ainda não está configurada. Adicione TAVILY_API_KEY ao ambiente do servidor.',
    };
  }
  if (message === 'TAVILY_INVALID_PRODUCT_URL') {
    return { status: 400, message: 'Informe a URL pública da página do produto, começando com http:// ou https://.' };
  }
  if (message === 'TAVILY_URL_NOT_READABLE') {
    return { status: 422, message: 'A Tavily não conseguiu ler essa página. Use a URL da página do produto e informe também o nome ou modelo.' };
  }
  if (/TAVILY_HTTP_401|TAVILY_HTTP_403/.test(message)) {
    return { status: 503, message: 'A chave Tavily foi recusada. Confira TAVILY_API_KEY no ambiente do servidor.' };
  }
  if (/TAVILY_HTTP_429/.test(message)) {
    return { status: 429, message: 'A cota mensal da Tavily acabou ou o limite temporário foi atingido. Tente novamente quando a cota renovar.' };
  }
  if (message === 'TAVILY_NO_RESULTS') {
    return { status: 404, message: 'A pesquisa não encontrou resultados. Tente informar o nome completo, marca ou modelo do produto.' };
  }
  if (/timeout|aborted/i.test(message)) {
    return { status: 504, message: 'O reconhecimento ou a pesquisa demorou demais para responder. Tente novamente.' };
  }
  return { status: 502, message: 'Não foi possível concluir a pesquisa na web agora. Tente novamente em instantes.' };
}

export async function researchProductWithTavily(
  input: ProductAIResearchInput,
  dependencies: TavilyDependencies = {}
): Promise<ProductAIResearchResult> {
  const apiKey = dependencies.apiKey ?? process.env.TAVILY_API_KEY;
  if (!apiKey || apiKey === 'SUA_CHAVE_TAVILY') throw new Error('TAVILY_API_KEY_MISSING');

  const query = asText(input.query).slice(0, 300);
  const productUrl = asText(input.productUrl);
  if (!query && !productUrl) throw new Error('TAVILY_NO_RESULTS');

  const request = dependencies.request ?? requestTavily;
  let pageContent = '';
  let pageTitle = '';
  let extractedImageUrl = '';

  if (productUrl) {
    const validProductUrl = safeHttpUrl(productUrl);
    if (!validProductUrl) throw new Error('TAVILY_INVALID_PRODUCT_URL');

    const extraction = await request('extract', {
      urls: validProductUrl,
      extract_depth: 'basic',
      format: 'markdown',
      include_images: true,
    }, apiKey) as TavilyExtractResponse;
    const page = extraction.results?.[0];
    pageContent = asText(page?.raw_content);
    if (!pageContent) throw new Error('TAVILY_URL_NOT_READABLE');
    pageTitle = extractPageTitle(pageContent) || '';
    extractedImageUrl = getExtractedImageUrl(extraction);
  }

  const productLabel = query || pageTitle || extractPageTitle(pageContent);
  if (!productLabel) throw new Error('TAVILY_URL_NOT_READABLE');

  const searchResponse = await request('search', {
    query: `${productLabel} preço comprar Brasil lojas`,
    search_depth: 'basic',
    topic: 'general',
    country: 'brazil',
    language: 'pt',
    max_results: 8,
    include_answer: 'basic',
    include_raw_content: false,
    include_usage: true,
  }, apiKey) as TavilySearchResponse;

  const results = Array.isArray(searchResponse.results) ? searchResponse.results : [];
  if (!results.length) throw new Error('TAVILY_NO_RESULTS');

  const structured = parseAnswerObject(searchResponse.answer);
  const firstSnippet = results.map((result) => asText(result.content)).find(Boolean) || '';
  const name = asText(structured.name) || query || pageTitle || asText(results[0]?.title) || 'Produto pesquisado';
  const category = asText(structured.category) || inferCategory(name, `${firstSnippet} ${pageContent.slice(0, 1200)}`);
  const description = buildProductDescription(structured.description, results, name);
  const tags = asTags(structured.tags);
  const priceStats = getPriceStats(results);
  const suggestedCaption = asText(structured.facebookCaption) ||
    (priceStats.avgPrice
      ? `Confira ${name} na TinaVitrine. Pesquisamos preços em lojas brasileiras e encontramos uma média de ${priceStats.avgPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Acesse a loja para ver a oferta.`
      : `Confira ${name} na TinaVitrine. Acesse a loja para ver os detalhes e comprar.`);

  return {
    name,
    ...priceStats,
    description,
    category,
    tags: tags.length ? tags : buildTags(name, category),
    facebookCaption: suggestedCaption,
    imageUrl: extractedImageUrl,
    sources: results
      .map((result) => ({ title: asText(result.title), uri: safeHttpUrl(result.url) }))
      .filter((source) => source.title && source.uri)
      .slice(0, 6),
  };
}
