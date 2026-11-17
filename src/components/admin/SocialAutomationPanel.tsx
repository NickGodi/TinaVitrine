import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Calendar, CheckCircle2, Globe, Plus, Send, Trash2, Users } from 'lucide-react';
import { api } from '../../api';
import type { FacebookTargetType, Product, SocialAccount, SocialPost } from '../../types';
import { buildTrackedBuyLink, formatBRL } from '../../utils/commerce';

interface SocialAutomationPanelProps {
  products: Product[];
  preselectedProductId?: string;
  preselectedCaption?: string;
}

export function SocialAutomationPanel({
  products,
  preselectedProductId,
  preselectedCaption,
}: SocialAutomationPanelProps) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Facebook Connection & Destination Prompt state
  const [showConnectPrompt, setShowConnectPrompt] = useState(false);
  const [fbAccountName, setFbAccountName] = useState('TinaVitrine Oficial (Facebook)');
  const [targetType, setTargetType] = useState<FacebookTargetType>('multiple_groups');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [customGroupName, setCustomGroupName] = useState('');
  const [autoPostEnabled, setAutoPostEnabled] = useState(true);

  // Composer state
  const [productId, setProductId] = useState(preselectedProductId || products[0]?.id || '');
  const [postTargetType, setPostTargetType] = useState<FacebookTargetType>('multiple_groups');
  const [postGroupIds, setPostGroupIds] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadSocial() {
    setLoading(true);
    try {
      const res = await api.getSocialState();
      setAccounts(res.accounts);
      setPosts(res.posts);
      const fb = res.accounts.find((a) => a.platform === 'facebook');
      if (fb) {
        setFbAccountName(fb.accountName);
        setTargetType(fb.defaultTargetType);
        setSelectedGroups(fb.selectedGroupIds);
        setAutoPostEnabled(fb.autoPostEnabled);
        setPostTargetType(fb.defaultTargetType);
        setPostGroupIds(fb.selectedGroupIds);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar automação social.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSocial();
  }, []);

  useEffect(() => {
    if (preselectedProductId) {
      setProductId(preselectedProductId);
    }
    if (preselectedCaption) {
      setCaption(preselectedCaption);
    }
  }, [preselectedProductId, preselectedCaption]);

  useEffect(() => {
    const selectedProd = products.find((p) => p.id === productId);
    if (selectedProd && !caption) {
      setCaption(
        `${selectedProd.name} por ${formatBRL(selectedProd.price)}${selectedProd.avgMarketPrice > 0 ? ` (média pesquisada na web: ${formatBRL(selectedProd.avgMarketPrice)})` : ''}. Garanta o seu diretamente no nosso site com checkout automático:`
      );
    }
  }, [productId, products, caption]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.type === 'OAUTH_FB_SUCCESS') {
        setShowConnectPrompt(true);
        setFeedback('Facebook conectado! Escolha abaixo se deseja postar no perfil ou em grupos.');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  async function handleStartFacebookConnect() {
    setError('');
    try {
      const res = await api.getFacebookAuthUrl();
      if (res.configured && res.url) {
        window.open(res.url, 'fb_oauth_popup', 'width=600,height=700');
      } else {
        setShowConnectPrompt(true);
      }
    } catch {
      setShowConnectPrompt(true);
    }
  }

  async function handleSaveFacebookConfig(e: FormEvent) {
    e.preventDefault();
    setError('');
    setFeedback('');
    try {
      await api.connectFacebook({
        accountName: fbAccountName,
        defaultTargetType: targetType,
        selectedGroupIds: selectedGroups,
        autoPostEnabled,
        customGroupName: customGroupName.trim() || undefined,
      });
      setCustomGroupName('');
      setShowConnectPrompt(false);
      setFeedback('Destino de postagem automática no Facebook salvo com sucesso.');
      await loadSocial();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar configuração do Facebook.');
    }
  }

  async function handleCreatePost(e: FormEvent) {
    e.preventDefault();
    setError('');
    setFeedback('');
    setSubmitting(true);
    try {
      await api.createSocialPost({
        productId,
        targetType: postTargetType,
        selectedGroupIds: postGroupIds,
        caption,
        publishNow: publishMode === 'now',
        scheduledFor: publishMode === 'schedule' ? scheduledFor : undefined,
        baseOrigin: window.location.origin,
      });
      setFeedback(
        publishMode === 'now'
          ? 'Postagem publicada com link direto para compra no site!'
          : 'Postagem agendada na fila de automação!'
      );
      await loadSocial();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar postagem.');
    } finally {
      setSubmitting(false);
    }
  }

  const fbAccount = accounts.find((a) => a.platform === 'facebook');
  const activeProduct = products.find((p) => p.id === productId) || products[0];
  const previewLink = activeProduct
    ? buildTrackedBuyLink(window.location.origin, activeProduct.id, 'fb_auto')
    : '';

  if (loading) {
    return (
      <div className="h-48 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900" />
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
        >
          {error}
        </div>
      )}
      {feedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          {feedback}
        </div>
      )}

      {/* Facebook Connection & Destination Wizard */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Conexão com Facebook &amp; Destino da Postagem Automática
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {fbAccount
                ? `Conectado como ${fbAccount.accountName} · Destino padrão: ${
                    fbAccount.defaultTargetType === 'profile'
                      ? 'Perfil do Facebook'
                      : fbAccount.defaultTargetType === 'single_group'
                        ? '1 Grupo específico'
                        : `${fbAccount.selectedGroupIds.length} Grupos selecionados`
                  }`
                : 'Conecte seu Facebook e defina onde publicar automaticamente.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!showConnectPrompt) handleStartFacebookConnect();
              else setShowConnectPrompt(false);
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {showConnectPrompt ? 'Fechar Configuração' : 'Conectar / Configurar Facebook'}
          </button>
        </div>

        {/* Explicit Destination Question when connecting */}
        {showConnectPrompt && (
          <form
            onSubmit={handleSaveFacebookConfig}
            className="mt-6 space-y-5 border-t border-zinc-200 pt-5 dark:border-zinc-800"
          >
            <div>
              <label htmlFor="fb-acc-name" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Nome da Conta / Perfil Conectado
              </label>
              <input
                id="fb-acc-name"
                type="text"
                value={fbAccountName}
                onChange={(e) => setFbAccountName(e.target.value)}
                className="mt-1 w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                Onde deseja fazer a postagem automática ao conectar no Facebook?
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${
                    targetType === 'profile'
                      ? 'border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/30'
                      : 'border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="fb-default-target"
                    checked={targetType === 'profile'}
                    onChange={() => setTargetType('profile')}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                      No Perfil do Facebook
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      Publica diretamente no feed do seu perfil conectado.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${
                    targetType === 'single_group'
                      ? 'border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/30'
                      : 'border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="fb-default-target"
                    checked={targetType === 'single_group'}
                    onChange={() => setTargetType('single_group')}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                      Em 1 Grupo Específico
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      Direciona todas as ofertas para um único grupo escolhido.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${
                    targetType === 'multiple_groups'
                      ? 'border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/30'
                      : 'border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="fb-default-target"
                    checked={targetType === 'multiple_groups'}
                    onChange={() => setTargetType('multiple_groups')}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                      Em Múltiplos Grupos
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      Distribui automaticamente entre vários grupos de compras.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {targetType !== 'profile' && fbAccount && (
              <div>
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Selecione os Grupos do Facebook:
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {fbAccount.availableGroups.map((grp) => {
                    const checked = selectedGroups.includes(grp.id);
                    return (
                      <label
                        key={grp.id}
                        className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800"
                      >
                        <span className="flex items-center gap-2 font-medium text-zinc-900 dark:text-white">
                          <input
                            type={targetType === 'single_group' ? 'radio' : 'checkbox'}
                            checked={checked}
                            onChange={() => {
                              if (targetType === 'single_group') {
                                setSelectedGroups([grp.id]);
                              } else {
                                setSelectedGroups((prev) =>
                                  prev.includes(grp.id)
                                    ? prev.filter((id) => id !== grp.id)
                                    : [...prev, grp.id]
                                );
                              }
                            }}
                          />
                          {grp.name}
                        </span>
                        <span className="font-mono text-zinc-500 tabular-nums">
                          {grp.membersCount.toLocaleString('pt-BR')} membros
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-3 flex max-w-md items-center gap-2">
                  <input
                    type="text"
                    value={customGroupName}
                    onChange={(e) => setCustomGroupName(e.target.value)}
                    placeholder="Adicionar nome de novo grupo..."
                    className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                  />
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={autoPostEnabled}
                onChange={(e) => setAutoPostEnabled(e.target.checked)}
              />
              Ativar postagem automática ao publicar novos produtos
            </label>

            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 cursor-pointer"
            >
              Salvar Preferência do Facebook
            </button>
          </form>
        )}
      </div>

      {/* Composer + Facebook Live Preview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleCreatePost}
          className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 lg:col-span-7 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
            Nova Postagem Automática para Facebook
          </h3>

          <div>
            <label htmlFor="post-product" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Produto da Vitrine
            </label>
            <select
              id="post-product"
              value={productId}
              onChange={(e) => {
                const nextId = e.target.value;
                setProductId(nextId);
                const p = products.find((item) => item.id === nextId);
                if (p) {
                  setCaption(
                    `${p.name} por ${formatBRL(p.price)}${p.avgMarketPrice > 0 ? ` (média pesquisada na web: ${formatBRL(p.avgMarketPrice)})` : ''}. Garanta o seu diretamente no nosso site com checkout automático:`
                  );
                }
              }}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatBRL(p.price)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="post-target-type" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Publicar em
            </label>
            <select
              id="post-target-type"
              value={postTargetType}
              onChange={(e) => setPostTargetType(e.target.value as FacebookTargetType)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            >
              <option value="profile">Perfil do Facebook</option>
              <option value="single_group">1 Grupo Específico</option>
              <option value="multiple_groups">Múltiplos Grupos</option>
            </select>
          </div>

          {postTargetType !== 'profile' && fbAccount && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Grupos de destino:
              </p>
              <div className="flex flex-wrap gap-2">
                {fbAccount.availableGroups.map((g) => {
                  const selected = postGroupIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        if (postTargetType === 'single_group') {
                          setPostGroupIds([g.id]);
                        } else {
                          setPostGroupIds((prev) =>
                            prev.includes(g.id)
                              ? prev.filter((id) => id !== g.id)
                              : [...prev, g.id]
                          );
                        }
                      }}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
                        selected
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="post-caption" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Legenda da Postagem (inclui link direto para o site)
            </label>
            <textarea
              id="post-caption"
              rows={4}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              <input
                type="radio"
                name="pub-mode"
                checked={publishMode === 'now'}
                onChange={() => setPublishMode('now')}
              />
              Publicar imediatamente
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              <input
                type="radio"
                name="pub-mode"
                checked={publishMode === 'schedule'}
                onChange={() => setPublishMode('schedule')}
              />
              Agendar horário
            </label>
          </div>

          {publishMode === 'schedule' && (
            <div>
              <label htmlFor="post-schedule" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Data e hora do agendamento
              </label>
              <input
                id="post-schedule"
                type="datetime-local"
                required
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !activeProduct}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          >
            {publishMode === 'now' ? <Send className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
            {publishMode === 'now' ? 'Publicar no Facebook' : 'Agendar Postagem'}
          </button>
        </form>

        {/* Facebook Preview */}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 lg:col-span-5 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Pré-visualização no Facebook
          </p>
          {activeProduct && (
            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  VP
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-900 dark:text-white">
                    {fbAccount?.accountName || 'TinaVitrine'}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {postTargetType === 'profile' ? 'Perfil Pessoal' : 'Grupos Selecionados'} · Agora
                  </p>
                </div>
              </div>
              <p className="px-4 pb-3 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
                {caption}
              </p>
              <img
                src={activeProduct.imageUrl}
                alt={activeProduct.name}
                className="aspect-[4/3] w-full object-cover bg-zinc-100 dark:bg-zinc-800"
              />
              <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="min-w-0 pr-3">
                  <p className="truncate font-mono text-[11px] text-zinc-500">{previewLink}</p>
                  <p className="truncate text-xs font-semibold text-zinc-900 dark:text-white">
                    {activeProduct.name} — {formatBRL(activeProduct.price)}
                  </p>
                </div>
                <span className="rounded-md bg-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                  Comprar no Site
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Posts History & Queue */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
          Postagens Automáticas e Agendadas ({posts.length})
        </h3>
        <div className="mt-4 space-y-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className="flex flex-col justify-between gap-4 rounded-xl border border-zinc-200 p-4 sm:flex-row sm:items-center dark:border-zinc-800"
            >
              <div className="flex items-start gap-3">
                <img
                  src={post.productImage}
                  alt={post.productName}
                  className="h-14 w-16 shrink-0 rounded-lg object-cover bg-zinc-100 dark:bg-zinc-800"
                />
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="font-semibold text-zinc-900 dark:text-white">
                      {post.productName}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      {post.targetType === 'profile' ? (
                        <Globe className="h-3 w-3" />
                      ) : (
                        <Users className="h-3 w-3" />
                      )}
                      {post.targetNames.join(', ')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        post.status === 'published'
                          ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                          : 'font-semibold text-amber-700 dark:text-amber-400'
                      }
                    >
                      {post.status === 'published' ? 'Publicado' : 'Agendado'}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300">
                    {post.caption}
                  </p>
                  <p className="mt-1 font-mono text-[11px] tabular-nums text-zinc-400">
                    {post.clicks} cliques · {post.conversions} vendas atribuídas
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {post.status === 'scheduled' && (
                  <button
                    type="button"
                    onClick={async () => {
                      await api.publishSocialPostNow(post.id);
                      await loadSocial();
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Publicar Agora
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    await api.deleteSocialPost(post.id);
                    await loadSocial();
                  }}
                  aria-label={`Remover postagem ${post.productName}`}
                  className="rounded-lg border border-zinc-200 p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:border-zinc-700 dark:hover:bg-red-950/30 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
