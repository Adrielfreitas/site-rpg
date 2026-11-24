import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, PointerEvent, ReactNode } from 'react'
import { authenticate as firebaseAuthenticate, createRemoteCampaign, firebaseReady, joinRemoteCampaign, logout, saveRemoteCampaignStatus, saveRemoteToken, sendRemoteMessage, watchAuth, watchCampaigns, watchSession } from './firebase'
import type { Campaign, Token, UserIdentity } from './models'
import './App.css'

type Tab = 'Visão geral' | 'Campanhas' | 'Sessões' | 'Fichas'

const seed: Campaign[] = [
  { id: 'demo-1', name: 'As cinzas de Valedouro', setting: 'Fantasia sombria', description: 'Uma vila esquecida, um sino que toca sem mãos e uma floresta que parece se lembrar de vocês.', system: 'Sistema autoral', status: 'Em andamento', role: 'Mestre', players: 4, inviteCode: 'VALE24', map: 'ruins', memberUids: [], ownerName: 'Você', updatedAt: Date.now() - 1000 * 60 * 32 },
  { id: 'demo-2', name: 'Órbita de Ícaro', setting: 'Ficção científica', description: 'A tripulação da nave Ícaro recebe um sinal vindo de um planeta dado como morto.', system: 'Fate', status: 'Preparação', role: 'Jogador', players: 3, inviteCode: 'ICARO7', map: 'station', memberUids: [], ownerName: 'Lia', updatedAt: Date.now() - 1000 * 60 * 60 * 8 },
]
const initialTokens: Token[] = [
  { id: 'me', name: 'Aventureiro', initials: 'EU', color: '#c9a56a', x: 37, y: 63 },
  { id: 'friend', name: 'Aliada', initials: 'AL', color: '#7fa29a', x: 51, y: 48 },
  { id: 'enemy1', name: 'Sentinela', initials: 'SE', color: '#a96464', x: 70, y: 38 },
]
const fmt = (when: number) => {
  const delta = Math.max(1, Math.floor((Date.now() - when) / 60000))
  return delta < 60 ? `há ${delta} min` : `há ${Math.floor(delta / 60)} h`
}
const code = () => Math.random().toString(36).slice(2, 8).toUpperCase()

function App() {
  const [tab, setTab] = useState<Tab>('Visão geral')
  const [campaigns, setCampaigns] = useState<Campaign[]>(seed)
  const [active, setActive] = useState<Campaign>(seed[0])
  const [tokens, setTokens] = useState<Token[]>(initialTokens)
  const [modal, setModal] = useState<'create' | 'join' | 'account' | null>(null)
  const [showBoard, setShowBoard] = useState(false)
  const [notice, setNotice] = useState('')
  const [user, setUser] = useState<UserIdentity | null>(null)
  const [authChecked, setAuthChecked] = useState(!firebaseReady)
  const [busy, setBusy] = useState(false)
  const [map, setMap] = useState('ruins')
  const [demoMode, setDemoMode] = useState(true)
  const [authError, setAuthError] = useState('')
  const [loginMode, setLoginMode] = useState<'login' | 'register'>('login')

  useEffect(() => {
    const raw = localStorage.getItem('cronicas-campaigns')
    if (raw) {
      try {
        const local = JSON.parse(raw) as Campaign[]
        if (local.length) { setCampaigns(local); setActive(local[0]) }
      } catch { localStorage.removeItem('cronicas-campaigns') }
    }
  }, [])
  useEffect(() => {
    if (!firebaseReady) return
    return watchAuth((next) => { setUser(next); setAuthChecked(true) })
  }, [])
  useEffect(() => {
    if (!firebaseReady || !user) return
    return watchCampaigns(user.uid, (docs) => {
      if (docs.length) { setCampaigns(docs); setActive(docs[0]); setDemoMode(false) }
      else { setCampaigns([]); setDemoMode(false) }
    }, () => setNotice('Não foi possível sincronizar. Confira as regras do Realtime Database.'))
  }, [user])
  useEffect(() => { localStorage.setItem('cronicas-campaigns', JSON.stringify(campaigns)) }, [campaigns])
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4200); return () => clearTimeout(timer) }, [notice])

  const recent = useMemo(() => [...campaigns].sort((a, b) => b.updatedAt - a.updatedAt), [campaigns])
  const totalPlayers = campaigns.reduce((sum, item) => sum + item.players, 0)
  const setCampaignList = (next: Campaign[]) => { setCampaigns(next); if (next.length) setActive(next[0]) }

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true)
    const form = new FormData(event.currentTarget)
    const campaign: Campaign = {
      id: `local-${Date.now()}`, name: String(form.get('name')).trim(), setting: String(form.get('setting')), description: String(form.get('description') || 'Uma nova aventura começa aqui.'), system: String(form.get('system') || 'Sistema autoral'), status: 'Preparação', role: 'Mestre', players: 1, inviteCode: code(), map: String(form.get('map') || 'ruins'), memberUids: user ? [user.uid] : [], ownerUid: user?.uid, ownerName: user?.email.split('@')[0] ?? 'Você', updatedAt: Date.now(),
    }
    try {
      if (firebaseReady && user) {
        campaign.id = await createRemoteCampaign(campaign, initialTokens, user)
      } else if (!demoMode) throw new Error('Entre na sua conta para salvar campanhas.')
      const next = [campaign, ...campaigns]; setCampaignList(next); setTab('Campanhas'); setModal(null); setNotice('Campanha criada. Código de convite: ' + campaign.inviteCode)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível criar a campanha.') }
    finally { setBusy(false) }
  }
  async function joinCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true)
    const form = new FormData(event.currentTarget); const invite = String(form.get('code')).trim().toUpperCase()
    try {
      if (firebaseReady && user) {
        const name = await joinRemoteCampaign(invite, user)
        setModal(null); setNotice(`Convite aceito para “${name}”. A mesa será sincronizada.`)
      } else {
        const found = campaigns.find((item) => item.inviteCode === invite)
        if (!found) throw new Error('Código não encontrado neste dispositivo. No modo demonstração, convites só funcionam aqui.')
        setActive({ ...found, role: 'Jogador' }); setModal(null); setTab('Campanhas'); setNotice(`Você entrou em “${found.name}”.`)
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível entrar na campanha.') }
    finally { setBusy(false) }
  }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setAuthError('')
    const form = new FormData(event.currentTarget); const email = String(form.get('email')); const password = String(form.get('password'))
    try {
      await firebaseAuthenticate(email, password, loginMode === 'register')
      setModal(null); setNotice('Conta conectada ao Firebase.')
    } catch (error) { setAuthError(error instanceof Error ? error.message.replace('Firebase: ', '') : 'Falha ao entrar.') }
    finally { setBusy(false) }
  }
  async function moveToken(id: string, x: number, y: number) {
    setTokens((old) => old.map((token) => token.id === id ? { ...token, x: Math.max(8, Math.min(92, x)), y: Math.max(12, Math.min(88, y)) } : token))
  }
  async function persistToken(id: string) {
    const token = tokens.find((item) => item.id === id)
    if (!token || !user || active.id.startsWith('demo-') || active.id.startsWith('local-')) return
    try { await saveRemoteToken(active.id, token) }
    catch { setNotice('Movimento não sincronizado. Confira as regras do Realtime Database.') }
  }
  async function startCampaign() {
    const nextCampaign = { ...active, status: 'Em andamento' as const, updatedAt: Date.now() }
    if (user && !active.id.startsWith('demo-') && !active.id.startsWith('local-')) {
      try { await saveRemoteCampaignStatus(active.id, 'Em andamento') }
      catch { setNotice('Não foi possível iniciar. Apenas o mestre pode alterar o estado da campanha.'); return }
    }
    setActive(nextCampaign); setCampaigns((items) => items.map((item) => item.id === active.id ? nextCampaign : item))
  }
  function enterSession(campaign: Campaign) { setActive(campaign); setShowBoard(true); setMap(campaign.map || 'ruins') }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">✦</div><div><strong>Crônicas</strong><span>mesa narrativa</span></div></div>
      <div className="workspace-label">ESPAÇO DE JOGO</div>
      <nav className="main-nav" aria-label="Navegação principal">
        {(['Visão geral', 'Campanhas', 'Sessões', 'Fichas'] as Tab[]).map((name, index) => <button key={name} className={tab === name ? 'nav-item selected' : 'nav-item'} onClick={() => { setTab(name); setShowBoard(false) }}><span className="nav-icon">{['⌂', '▧', '◷', '♙'][index]}</span>{name}{name === 'Sessões' && <span className="nav-count">{campaigns.filter((c) => c.status === 'Em andamento').length}</span>}</button>)}
      </nav>
      <div className="sidebar-divider" />
      <div className="workspace-label campaign-label">SUAS CAMPANHAS <button className="tiny-add" onClick={() => setModal('create')} aria-label="Criar campanha">＋</button></div>
      <div className="sidebar-campaigns">{campaigns.slice(0, 4).map((campaign) => <button key={campaign.id} className="side-campaign" onClick={() => enterSession(campaign)}><span className={`campaign-dot ${campaign.map}`} />{campaign.name}</button>)}</div>
      <div className="sidebar-bottom"><div className="free-card"><div className="sparkle">✧</div><strong>Feito para imaginar</strong><p>Crie histórias no seu ritmo, com as regras do seu grupo.</p><button onClick={() => setNotice('A V1.0 já roda no modo gratuito e colaborativo.')}>Conheça o projeto <span>↗</span></button></div>
      <button className="profile" onClick={() => user ? void logout() : setModal('account')}><div className="avatar avatar-you">{user ? user.email.slice(0, 1).toUpperCase() : 'D'}</div><div className="profile-copy"><strong>{user ? user.email.split('@')[0] : 'Aventureiro'}</strong><span>{firebaseReady ? (user ? 'Conta Firebase' : 'Conectar conta') : 'Modo demonstração'}</span></div><span className="more">···</span></button>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Crônicas</span><i>/</i><strong>{showBoard ? active.name : tab}</strong></div><div className="top-actions"><span className={demoMode ? 'mode-tag' : 'sync-tag'}><i />{demoMode ? 'Demonstração local' : 'Sincronizado'}</span><button className="icon-button" title="Ajuda" onClick={() => setNotice('Dica: crie uma campanha e convide o grupo usando o código.')}>?</button><div className="avatar top-avatar">{user ? user.email.slice(0, 1).toUpperCase() : 'D'}</div></div></header>
        {showBoard ? <SessionView campaign={active} user={user} tokens={tokens} onTokensChange={setTokens} map={map} onMap={setMap} onMove={moveToken} onPersistToken={persistToken} onStart={startCampaign} onBack={() => setShowBoard(false)} onNotice={setNotice} /> : <>
        {tab === 'Visão geral' && <Dashboard campaigns={recent} totalPlayers={totalPlayers} onCreate={() => setModal('create')} onJoin={() => setModal('join')} onOpen={enterSession} />}
        {tab === 'Campanhas' && <Campaigns campaigns={recent} onCreate={() => setModal('create')} onJoin={() => setModal('join')} onOpen={enterSession} />}
        {tab === 'Sessões' && <Sessions campaigns={recent} onOpen={enterSession} onCreate={() => setModal('create')} />}
        {tab === 'Fichas' && <Sheets campaigns={recent} onOpen={(campaign) => enterSession(campaign)} onNotice={setNotice} />}
      </>}
      <footer className="footer"><span>✦ &nbsp;Sua mesa, suas regras.</span><span>Versão 1.0 · {firebaseReady ? 'Firebase conectado' : 'Prévia local'}</span></footer>
    </main>
    {modal && <Modal onClose={() => setModal(null)}>
      {modal === 'create' && <form className="form-modal" onSubmit={createCampaign}><div className="modal-icon">✧</div><h2>Nova campanha</h2><p>Vamos preparar o palco da sua próxima história.</p><label>Nome da campanha<input name="name" placeholder="Ex.: As cinzas de Valedouro" required maxLength={60} /></label><div className="form-row"><label>Ambientação<select name="setting"><option>Fantasia sombria</option><option>Fantasia medieval</option><option>Terror</option><option>Ficção científica</option><option>Contemporâneo</option><option>Outro universo</option></select></label><label>Sistema<select name="system"><option>Sistema autoral</option><option>D&D 5e</option><option>Ordem Paranormal</option><option>Fate</option><option>Outro</option></select></label></div><label>Sobre a aventura<textarea name="description" placeholder="Uma breve descrição para o grupo…" rows={3} maxLength={250} /></label><label>Mapa inicial<select name="map"><option value="ruins">Ruínas da floresta</option><option value="station">Estação orbital</option></select></label><div className="modal-actions"><button type="button" className="button quiet" onClick={() => setModal(null)}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'Criando…' : 'Criar campanha'} <span>→</span></button></div></form>}
      {modal === 'join' && <form className="form-modal" onSubmit={joinCampaign}><div className="modal-icon">⌘</div><h2>Entrar em uma campanha</h2><p>Digite o código que o mestre compartilhou com você.</p><label>Código de convite<input name="code" placeholder="Ex.: VALE24" required minLength={4} maxLength={10} className="invite-input" /></label><div className="invite-hint">O código diferencia sua mesa e abre o acesso à campanha.</div><div className="modal-actions"><button type="button" className="button quiet" onClick={() => setModal(null)}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar na mesa'} <span>→</span></button></div></form>}
      {modal === 'account' && <form className="form-modal" onSubmit={authenticate}><div className="modal-icon">♙</div><h2>{loginMode === 'login' ? 'Conectar ao Firebase' : 'Criar conta'}</h2><p>Entre para sincronizar campanhas e convidar jogadores em outros dispositivos.</p>{!firebaseReady ? <div className="config-warning">O projeto Firebase ainda não foi configurado. A demonstração local continua disponível.</div> : <><label>E-mail<input type="email" name="email" placeholder="voce@email.com" required /></label><label>Senha<input type="password" name="password" minLength={6} required placeholder="Mínimo de 6 caracteres" /></label>{authError && <div className="auth-error">{authError}</div>}<button className="text-button switch-auth" type="button" onClick={() => setLoginMode(loginMode === 'login' ? 'register' : 'login')}>{loginMode === 'login' ? 'Ainda não tem conta? Criar uma' : 'Já tem conta? Entrar'}</button></>}<div className="modal-actions"><button type="button" className="button quiet" onClick={() => setModal(null)}>Fechar</button>{firebaseReady && <button className="button primary" disabled={busy}>{busy ? 'Conectando…' : loginMode === 'login' ? 'Entrar' : 'Criar conta'} <span>→</span></button>}</div></form>}
    </Modal>}
    {notice && <div className="toast" role="status"><span>✦</span>{notice}<button onClick={() => setNotice('')} aria-label="Fechar aviso">×</button></div>}
    {!authChecked && <div className="loading-cover">Abrindo sua mesa…</div>}
  </div>
}

function Dashboard({ campaigns, totalPlayers, onCreate, onJoin, onOpen }: { campaigns: Campaign[]; totalPlayers: number; onCreate: () => void; onJoin: () => void; onOpen: (c: Campaign) => void }) {
  const active = campaigns.filter((item) => item.status === 'Em andamento')
  return <div className="page-content dashboard-page"><section className="welcome"><div className="welcome-text"><div className="eyebrow"><span /> SEGUNDA-FEIRA, 23 DE NOVEMBRO</div><h1>Boa noite, <em>aventureiro.</em></h1><p>O próximo capítulo começa quando vocês se reunirem.</p><div className="welcome-actions"><button className="button primary" onClick={onCreate}>＋ &nbsp;Criar campanha</button><button className="button outline" onClick={onJoin}>Entrar com código</button></div></div><div className="welcome-art" aria-hidden="true"><div className="art-moon"/><div className="art-tower tower-one"/><div className="art-tower tower-two"/><div className="art-hill hill-one"/><div className="art-hill hill-two"/><div className="art-sigil">✦</div><span className="art-star star-a">✧</span><span className="art-star star-b">✦</span><span className="art-star star-c">·</span><div className="art-caption">O mundo espera.</div></div></section>
    <section className="stats-row"><Stat icon="▧" label="Campanhas" value={String(campaigns.length).padStart(2, '0')} detail="no seu espaço" /><Stat icon="◷" label="Em andamento" value={String(active.length).padStart(2, '0')} detail="prontas para jogar" /><Stat icon="♙" label="Jogadores" value={String(totalPlayers).padStart(2, '0')} detail="nas suas mesas" /></section>
    <section className="section-block"><div className="section-heading"><div><span className="eyebrow">SUAS HISTÓRIAS</span><h2>Continue de onde parou</h2></div><button className="text-button" onClick={() => onOpen(campaigns[0])}>Ver campanhas <span>→</span></button></div>
      <div className="campaign-grid">{campaigns.slice(0, 2).map((campaign, index) => <CampaignCard key={campaign.id} campaign={campaign} index={index} onOpen={() => onOpen(campaign)} />)}<button className="new-campaign-card" onClick={onCreate}><span className="new-plus">＋</span><strong>Uma história nova?</strong><span>Crie um mundo do seu jeito.</span><b>Começar campanha <i>→</i></b></button></div>
    </section>
    <section className="section-block recent-block"><div className="section-heading"><div><span className="eyebrow">ATIVIDADE RECENTE</span><h2>Suas mesas</h2></div><button className="text-button" onClick={onJoin}>Tenho um convite <span>↗</span></button></div><div className="activity-list">{campaigns.slice(0, 2).map((campaign) => <button key={campaign.id} className="activity-item" onClick={() => onOpen(campaign)}><span className={`activity-thumb ${campaign.map}`}><i>✦</i></span><span className="activity-copy"><strong>{campaign.name}</strong><span>{campaign.role} · {campaign.players} participantes · {campaign.setting}</span></span><span className="activity-time">{fmt(campaign.updatedAt)}</span><span className="activity-arrow">→</span></button>)}</div></section>
  </div>
}
function Stat({ icon, label, value, detail }: { icon: string; label: string; value: string; detail: string }) { return <div className="stat-card"><div className="stat-top"><span>{icon}</span><span>{label}</span></div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div> }
function CampaignCard({ campaign, index, onOpen }: { campaign: Campaign; index: number; onOpen: () => void }) { return <button className="campaign-card" onClick={onOpen}><div className={`campaign-art ${campaign.map}`}><span className="art-grain"/><span className="art-rune">{index ? '☼' : '✦'}</span><span className="art-tag">{campaign.status === 'Em andamento' ? '●  AO VIVO' : '✧  PREPARAÇÃO'}</span><span className="art-number">0{index + 1}</span></div><div className="campaign-card-copy"><div className="card-meta"><span>{campaign.setting}</span><span>·</span><span>{campaign.system}</span></div><h3>{campaign.name}</h3><p>{campaign.description}</p><div className="campaign-card-foot"><div className="avatar-stack"><span className="avatar avatar-one">{campaign.ownerName.slice(0, 1).toUpperCase()}</span><span className="avatar avatar-two">{campaign.role === 'Mestre' ? '✦' : 'A'}</span><span className="avatar avatar-three">+{Math.max(0, campaign.players - 2)}</span></div><span className="players-label">{campaign.players} participantes</span><span className="card-enter">Abrir mesa <i>→</i></span></div></div></button> }
function Campaigns({ campaigns, onCreate, onJoin, onOpen }: { campaigns: Campaign[]; onCreate: () => void; onJoin: () => void; onOpen: (c: Campaign) => void }) { return <div className="page-content list-page"><div className="page-title-row"><div><span className="eyebrow">SEU UNIVERSO DE JOGO</span><h1>Campanhas</h1><p>Histórias que vocês estão criando juntos.</p></div><div className="welcome-actions"><button className="button outline" onClick={onJoin}>Entrar com código</button><button className="button primary" onClick={onCreate}>＋ Criar campanha</button></div></div>{campaigns.length ? <div className="campaign-grid full-grid">{campaigns.map((campaign, index) => <CampaignCard key={campaign.id} campaign={campaign} index={index} onOpen={() => onOpen(campaign)} />)}<button className="new-campaign-card" onClick={onCreate}><span className="new-plus">＋</span><strong>Uma história nova?</strong><span>Crie um mundo do seu jeito.</span><b>Começar campanha <i>→</i></b></button></div> : <EmptyState title="Nenhuma campanha por enquanto" detail="Crie seu primeiro mundo ou entre com um código de convite." action="Criar campanha" onAction={onCreate} />}</div> }
function Sessions({ campaigns, onOpen, onCreate }: { campaigns: Campaign[]; onOpen: (c: Campaign) => void; onCreate: () => void }) { const sessions = campaigns.filter((c) => c.status === 'Em andamento'); return <div className="page-content list-page"><div className="page-title-row"><div><span className="eyebrow">MESA PRONTA</span><h1>Sessões</h1><p>Retome uma aventura ou prepare o próximo encontro.</p></div><button className="button primary" onClick={onCreate}>＋ Criar campanha</button></div>{sessions.length ? <div className="session-list">{sessions.map((campaign) => <button className="session-row" key={campaign.id} onClick={() => onOpen(campaign)}><span className={`session-sigil ${campaign.map}`}>✦</span><span className="session-copy"><strong>{campaign.name}</strong><small>{campaign.setting} · {campaign.players} participantes</small></span><span className="live-pill"><i/> Em andamento</span><span className="session-resume">Retomar sessão <b>→</b></span></button>)}</div> : <EmptyState title="Nenhuma sessão ativa" detail="Quando uma campanha estiver pronta para jogar, ela aparece aqui." action="Preparar campanha" onAction={onCreate} />}</div> }
function Sheets({ campaigns, onOpen, onNotice }: { campaigns: Campaign[]; onOpen: (c: Campaign) => void; onNotice: (s: string) => void }) { return <div className="page-content list-page"><div className="page-title-row"><div><span className="eyebrow">SEUS PERSONAGENS</span><h1>Fichas</h1><p>Ficha inicial flexível para cada uma das suas mesas.</p></div></div><div className="sheet-grid">{campaigns.filter((c) => c.role === 'Jogador' || c.status === 'Em andamento').map((campaign, i) => <button className="sheet-card" key={campaign.id} onClick={() => onOpen(campaign)}><div className="sheet-top"><div className={`sheet-portrait portrait-${i % 3}`}>{['♙', '✧', '⚔'][i % 3]}</div><span className="sheet-label">{campaign.name}</span></div><strong>{i === 0 ? 'Aventureiro' : 'Personagem sem nome'}</strong><span className="sheet-system">{campaign.system} · nível 1</span><div className="sheet-bars"><div><span>Vitalidade</span><b>18 / 24</b></div><i><em style={{ width: '75%' }} /></i></div><div className="sheet-stats"><span>FOR <b>+2</b></span><span>DES <b>+1</b></span><span>INT <b>+3</b></span></div></button>)}<button className="new-sheet" onClick={() => onNotice('Escolha uma campanha e abra a mesa para criar uma ficha vinculada.') }><span>＋</span><strong>Nova ficha</strong><small>Escolha uma campanha para começar.</small></button></div><div className="info-banner"><span>✧</span><div><strong>Fichas autorais estão chegando por etapas.</strong><p>Esta versão usa uma ficha inicial demonstrativa. A edição de campos e regras será adicionada em seguida.</p></div></div></div> }
function EmptyState({ title, detail, action, onAction }: { title: string; detail: string; action: string; onAction: () => void }) { return <div className="empty-state"><div>✧</div><h2>{title}</h2><p>{detail}</p><button className="button primary" onClick={onAction}>{action}</button></div> }

function SessionView({ campaign, user, tokens, onTokensChange, map, onMap, onMove, onPersistToken, onStart, onBack, onNotice }: { campaign: Campaign; user: UserIdentity | null; tokens: Token[]; onTokensChange: (tokens: Token[]) => void; map: string; onMap: (s: string) => void; onMove: (id: string, x: number, y: number) => void; onPersistToken: (id: string) => void; onStart: () => void; onBack: () => void; onNotice: (s: string) => void }) {
  const [tab, setTab] = useState<'Cena' | 'Registro'>('Cena')
  const [message, setMessage] = useState('')
  const [log, setLog] = useState(['A sessão foi preparada. A aventura aguarda o grupo.', 'Uma névoa fria cobre o caminho ao norte.'])
  const [dragging, setDragging] = useState<string | null>(null)
  useEffect(() => {
    if (!user || campaign.id.startsWith('demo-') || campaign.id.startsWith('local-')) return
    return watchSession(campaign.id, onTokensChange, setLog)
  }, [campaign.id, user?.uid])
  function drag(event: PointerEvent<HTMLDivElement>) { if (!dragging) return; const rect = event.currentTarget.getBoundingClientRect(); onMove(dragging, ((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100) }
  function dropToken() { if (dragging) { onPersistToken(dragging); setDragging(null) } }
  async function sendMessage(event: FormEvent) { event.preventDefault(); if (!message.trim()) return; const text = message.trim(); setMessage(''); setLog((old) => [`Você: ${text}`, ...old]); if (user && !campaign.id.startsWith('demo-') && !campaign.id.startsWith('local-')) { try { await sendRemoteMessage(campaign.id, text, user) } catch { onNotice('Mensagem não sincronizada. Confira as regras do Realtime Database.') } } }
  async function rollD20() { const result = 1 + Math.floor(Math.random() * 20); const text = `${user?.email.split('@')[0] ?? 'Você'} rolou 1d20: ${result}`; setLog((old) => [text, ...old]); onNotice(`d20 → ${result}`); if (user && !campaign.id.startsWith('demo-') && !campaign.id.startsWith('local-')) { try { await sendRemoteMessage(campaign.id, text, user) } catch { onNotice('Rolagem feita, mas não sincronizada.') } } }
  return <div className="session-screen"><div className="session-toolbar"><button className="back-button" onClick={onBack}>← <span>Campanhas</span></button><div className="session-title"><span className="live-pill"><i/> {campaign.status}</span><strong>{campaign.name}</strong></div><div className="session-tools"><button className="button outline small" onClick={() => { navigator.clipboard?.writeText(campaign.inviteCode); onNotice(`Código ${campaign.inviteCode} copiado.`) }}>⌘ &nbsp; {campaign.inviteCode}</button><button className="button primary small" disabled={campaign.status === 'Em andamento' || campaign.role !== 'Mestre'} onClick={onStart}>{campaign.status === 'Em andamento' ? '✓  Sessão ativa' : campaign.role === 'Mestre' ? '▶  Iniciar sessão' : 'Aguardando mestre'}</button></div></div>
    <div className="session-layout"><div className="scene-column"><div className="scene-tabs"><button className={tab === 'Cena' ? 'scene-tab active' : 'scene-tab'} onClick={() => setTab('Cena')}>Cena</button><button className={tab === 'Registro' ? 'scene-tab active' : 'scene-tab'} onClick={() => setTab('Registro')}>Registro <span>{log.length}</span></button><div className="scene-spacer"/><button className="scene-control" title="Diminuir" onClick={() => onNotice('Zoom da cena ajustado.')}>−</button><button className="scene-control" title="Aumentar" onClick={() => onNotice('Zoom da cena ajustado.')}>＋</button><button className="scene-control" title="Tela cheia" onClick={() => document.documentElement.requestFullscreen?.()}>⛶</button></div>
      {tab === 'Cena' ? <div className="board-wrap"><div className="board-meta"><span>◈ &nbsp; {map === 'ruins' ? 'Ruínas da floresta' : 'Estação orbital'}</span><span>Arraste seu token para se mover</span></div><div className={`board ${map}`} onPointerMove={drag} onPointerUp={dropToken} onPointerLeave={dropToken}><div className="board-overlay"/><div className="board-vignette"/>{tokens.map((token) => <div key={token.id} className="token" style={{ left: `${token.x}%`, top: `${token.y}%`, ['--token-color' as string]: token.color }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragging(token.id) }}><span>{token.initials}</span><small>{token.name}</small></div>)}<div className="map-label">{map === 'ruins' ? 'A FLORESTA DE VÉU-BAIXO' : 'ESTAÇÃO ÍCARO · SETOR 04'}</div><div className="board-compass">N<br/><span>✦</span></div><div className="board-scale">▰ ▱ ▱ &nbsp; 5 m</div></div><div className="board-foot"><span>⠿ &nbsp; Grade ativada</span><button onClick={() => onMap(map === 'ruins' ? 'station' : 'ruins')}>Trocar mapa local <span>↗</span></button></div></div> : <div className="log-panel">{log.map((item, i) => <div className="log-entry" key={`${item}-${i}`}><span className="log-time">{i === 0 ? 'AGORA' : 'CENA'}</span><p>{item}</p></div>)}</div>}
      <div className="narration"><div className="narration-avatar">✦</div><div className="narration-copy"><strong>A jornada começa</strong><p>O vento atravessa as árvores antigas. À frente, algo se move entre as ruínas.</p></div><button className="narration-more" onClick={() => onNotice('A narração está registrada na cena.')}>···</button></div></div>
      <aside className="session-right"><div className="right-head"><div><span className="eyebrow">NA MESA</span><h3>Participantes <span>{campaign.players}</span></h3></div><button onClick={() => onNotice(`Convite: ${campaign.inviteCode}`)}>＋</button></div><div className="participant-list"><Participant name={user?.email.split('@')[0] ?? 'Você'} role={campaign.role} initials={user?.email.slice(0, 1).toUpperCase() ?? 'D'} color="you" online/>{campaign.players > 1 && <Participant name={`${campaign.players - 1} outros participantes`} role="Membros da campanha" initials={`+${campaign.players - 1}`} color="sage" online={false}/>}</div><div className="right-divider"/><div className="right-head tools-head"><div><span className="eyebrow">FERRAMENTAS</span><h3>Da sessão</h3></div></div><button className="tool-row" onClick={() => void rollD20()}>⚄ <span>Rolar d20</span><b>→</b></button><button className="tool-row" onClick={() => setTab('Registro')}>☷ <span>Registro da sessão</span><b>→</b></button><button className="tool-row" onClick={() => onNotice('O convite da mesa é ' + campaign.inviteCode)}>⌘ <span>Convidar jogadores</span><b>→</b></button><div className="right-divider"/><div className="right-head tools-head"><div><span className="eyebrow">CONVERSA</span><h3>Na mesa</h3></div><span className="online-count">{campaign.players} participantes</span></div><div className="chat-messages">{log.slice(0, 3).reverse().map((item, index) => <div className="chat-line" key={`${item}-${index}`}><strong>{item.includes(':') ? item.split(':')[0] : index === 0 ? 'Mestre' : 'Cena'}</strong><span>{item.includes(':') ? item.split(':').slice(1).join(':') : item}</span></div>)}</div><form className="chat-form" onSubmit={sendMessage}><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Escreva para a mesa…" /><button aria-label="Enviar">↑</button></form><div className="session-note">{user ? 'Movimentos e mensagens sincronizam com a mesa.' : 'Modo demonstração: movimentos e mensagens ficam neste navegador.'}</div></aside></div></div>
}
function Participant({ name, role, initials, color, online }: { name: string; role: string; initials: string; color: string; online: boolean }) { return <div className="participant"><span className={`avatar participant-avatar ${color}`}>{initials}</span><span className="participant-name"><strong>{name}</strong><small>{role}</small></span><i className={online ? 'presence online' : 'presence'} /></div> }
function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) { return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><div className="modal-card"> <button className="modal-close" onClick={onClose} aria-label="Fechar">×</button>{children}</div></div> }

export default App
