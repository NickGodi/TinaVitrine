# TinaVitrine

## Executar localmente

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env` e configure `TAVILY_API_KEY` e `GROQ_API_KEY`.
3. Inicie o site com `npm run dev`.

## Segurança e publicação

- Não envie `.env`, `data/db.json` nem credenciais para o GitHub. O `.gitignore` já exclui esses arquivos.
- Use variáveis privadas do servidor para Tavily, Groq, Stripe, Facebook e PIX. Nunca use o prefixo `VITE_` nessas chaves.
- Em uma instalação nova, configure `INITIAL_CREATOR_USERNAME` e uma `INITIAL_CREATOR_PASSWORD` exclusiva com pelo menos 16 caracteres. Essa conta só é criada quando o banco local é inicializado pela primeira vez.
- A API usa cookies `HttpOnly`, armazena hashes dos tokens de sessão, verifica a origem de mutações, aplica limites básicos de tentativas e envia cabeçalhos de segurança.
- O armazenamento local fica em `data/db.json`. Na Vercel, o estado fica em um projeto Supabase separado, por meio da Edge Function `tinavitrine-state`. Configure `TINAVITRINE_STATE_API_URL`, `TINAVITRINE_STATE_KEY` e `SUPABASE_ANON_KEY` como variáveis privadas no servidor Vercel.
- A Edge Function valida o token privado antes de acessar o banco. O token é armazenado no Supabase apenas como hash; as tabelas usam RLS e não dão acesso direto aos papéis `anon` ou `authenticated`. A chave administrativa do Supabase permanece dentro da Edge Function e nunca deve ser enviada ao navegador ou ao GitHub.
- Depois de criar o primeiro banco, configure `INITIAL_CREATOR_USERNAME` e uma `INITIAL_CREATOR_PASSWORD` exclusiva com pelo menos 16 caracteres antes da primeira chamada à API. A conta de criador só é inicializada uma vez.

## Pesquisa de produtos

A pesquisa de produtos usa a Tavily. Fotos enviadas, coladas ou informadas por URL direta são identificadas pela visão da Groq, e o nome reconhecido é pesquisado na Tavily. Configure `TAVILY_API_KEY` e `GROQ_API_KEY` no `.env` para desenvolvimento local e nas variáveis de ambiente do projeto Vercel para produção. Não use o prefixo `VITE_`: as chaves precisam ficar somente no servidor.

Para criar uma chave Groq, use o console da Groq e guarde-a como `GROQ_API_KEY`. A Groq disponibiliza um nível gratuito com limites de uso; confira os limites atuais da conta. Se a pesquisa não encontrar preços suficientes, o site mantém os campos de preço de mercado vazios para preenchimento manual.
