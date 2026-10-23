import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api, ApiError } from './api';
import { createSocket, type MessengerSocket } from './socket';
import type { ChatMessage, Friend, FriendRequest, User } from './types';

type AuthResult = { accessToken: string; user: User };
type Notice = { kind: 'success' | 'error'; text: string };

function initials(username: string) {
  return username.slice(0, 2).toUpperCase();
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function App() {
  const [session, setSession] = useState<AuthResult | null>(() => {
    const token = localStorage.getItem('orbit_token');
    const user = localStorage.getItem('orbit_user');
    if (!token || !user) return null;
    try {
      return { accessToken: token, user: JSON.parse(user) as User };
    } catch {
      localStorage.removeItem('orbit_token');
      localStorage.removeItem('orbit_user');
      return null;
    }
  });
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [activeFriend, setActiveFriend] = useState<Friend | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [friendUsername, setFriendUsername] = useState('');
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [accountPage, setAccountPage] = useState<
    'profile' | 'settings' | 'notifications' | null
  >(null);
  const [profileIcon, setProfileIcon] = useState<string>(
    () => localStorage.getItem('orbit_profile_icon') || '',
  );
  const profileIconInput = useRef<HTMLInputElement | null>(null);

  const chooseProfileIcon = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('Escolha um arquivo de imagem.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = String(reader.result || '');
      try {
        localStorage.setItem('orbit_profile_icon', image);
        setProfileIcon(image);
        notify('Ícone do perfil atualizado.');
      } catch {
        notify('A imagem é muito grande. Escolha uma imagem menor.', 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  const removeProfileIcon = () => {
    localStorage.removeItem('orbit_profile_icon');
    setProfileIcon('');
    if (profileIconInput.current) profileIconInput.current.value = '';
  };
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const socketRef = useRef<MessengerSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const notify = useCallback(
    (text: string, kind: Notice['kind'] = 'success') => {
      setNotice({ text, kind });
      window.setTimeout(() => setNotice(null), 3800);
    },
    [],
  );

  const logout = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    localStorage.removeItem('orbit_token');
    localStorage.removeItem('orbit_user');
    setSession(null);
    setFriends([]);
    setIncoming([]);
    setOutgoing([]);
    setActiveFriend(null);
    setMessages([]);
    setSocketConnected(false);
  }, []);

  const refreshLists = useCallback(async (token: string) => {
    const [friendList, incomingList, outgoingList] = await Promise.all([
      api.friends(token),
      api.incomingRequests(token),
      api.outgoingRequests(token),
    ]);
    setFriends(friendList);
    setIncoming(incomingList);
    setOutgoing(outgoingList);
  }, []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    const socket = createSocket(session.accessToken);
    socketRef.current = socket;

    socket.on('connect', () => {
      if (!alive) return;
      setSocketConnected(true);
      socket.emit('user:online');
    });
    socket.on('disconnect', () => alive && setSocketConnected(false));
    socket.on('connect_error', (error) => {
      if (alive) {
        setSocketConnected(false);
        notify(`Realtime indisponível: ${error.message}`, 'error');
      }
    });
    socket.on('user:online', ({ userId }) => {
      setOnlineUsers((old) => new Set(old).add(userId));
    });
    socket.on('user:offline', ({ userId }) => {
      setOnlineUsers((old) => {
        const next = new Set(old);
        next.delete(userId);
        return next;
      });
    });
    socket.on('message:new', (message) => {
      if (!alive) return;
      setMessages((old) =>
        old.some((item) => item.id === message.id) ? old : [...old, message],
      );
      if (!activeFriend || message.senderId !== activeFriend.friend.id) {
        notify('Você recebeu uma nova mensagem');
      }
    });
    socket.on('message:sent', (message) => {
      if (!alive) return;
      setMessages((old) =>
        old.some((item) => item.id === message.id) ? old : [...old, message],
      );
    });
    socket.on(
      'message:error',
      (error) => alive && notify(error.message, 'error'),
    );
    socket.connect();

    refreshLists(session.accessToken).catch((error: unknown) => {
      if (!alive) return;
      const message =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar seus dados.';
      notify(message, 'error');
      if (error instanceof ApiError && error.status === 401) logout();
    });

    return () => {
      alive = false;
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [session?.accessToken, refreshLists, notify, logout]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeFriend]);

  const filteredFriends = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return friends;
    return friends.filter((item) =>
      item.friend.username.toLowerCase().includes(term),
    );
  }, [friends, search]);

  async function handleAuth(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    try {
      if (authMode === 'register') {
        await api.register(username.trim(), password);
        notify('Conta criada! Agora entre com seus dados.');
        setAuthMode('login');
      } else {
        const result = await api.login(username.trim(), password);
        localStorage.setItem('orbit_token', result.accessToken);
        localStorage.setItem('orbit_user', JSON.stringify(result.user));
        setSession(result);
        notify('Bem-vindo ao ryuto.');
      }
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível autenticar.',
        'error',
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function openConversation(friend: Friend) {
    if (!session) return;
    setActiveFriend(friend);
    setMobileView('chat');
    setMessages([]);
    setLoadingMessages(true);
    try {
      const history = await api.history(friend.friend.id, session.accessToken);
      setMessages(history);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o histórico.';
      if (error instanceof ApiError && error.status === 404) {
        notify(
          'Falta configurar GET /messages/:otherUserId no backend.',
          'error',
        );
      } else {
        notify(message, 'error');
      }
    } finally {
      setLoadingMessages(false);
    }
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!session || !activeFriend || !draft.trim()) return;
    if (!socketRef.current?.connected) {
      notify('O chat não está conectado ao servidor.', 'error');
      return;
    }
    socketRef.current.emit('message:send', {
      receiverId: activeFriend.friend.id,
      content: draft.trim(),
    });
    setDraft('');
  }

  async function addFriend(event: FormEvent) {
    event.preventDefault();
    if (!session || !friendUsername.trim()) return;
    try {
      await api.sendFriendRequest(friendUsername.trim(), session.accessToken);
      setFriendUsername('');
      setShowAddFriend(false);
      await refreshLists(session.accessToken);
      notify('Solicitação de amizade enviada.');
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar a solicitação.',
        'error',
      );
    }
  }

  async function handleRequest(id: string, action: 'accept' | 'reject') {
    if (!session) return;
    try {
      if (action === 'accept') await api.acceptRequest(id, session.accessToken);
      else await api.rejectRequest(id, session.accessToken);
      await refreshLists(session.accessToken);
      notify(
        action === 'accept' ? 'Solicitação aceita.' : 'Solicitação rejeitada.',
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar a solicitação.',
        'error',
      );
    }
  }

  if (!session) {
    return (
      <main className="auth-screen">
        <div className="auth-art">
          <div className="brand">
            <div className="brand-mark">
              <MessageCircle size={20} />
            </div>
            <span>
              ryuto<span className="brand-dot">.</span>
            </span>
          </div>
          <div className="art-copy">
            <div className="eyebrow">
              <span className="eyebrow-dot" /> Aqui você se conecta!
            </div>
            <h1>
              Conversas
              <br />
              que <span>fluem.</span>
            </h1>
            <p>
              Um lugar simples para manter suas conversas por perto. Sem abas
              perdidas, sem distrações.
            </p>
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-orbit orbit-three" />
            <div className="floating-message fm-one">
              <div className="mini-avatar purple">M</div>
              <div>
                <b>marcus</b>
                <span>tá online agora</span>
              </div>
              <span className="online-dot" />
            </div>
            <div className="floating-message fm-two">
              <div className="mini-avatar blue">J</div>
              <div>
                <b>joao_dev</b>
                <span>mandou uma mensagem</span>
              </div>
              <div className="mini-bubble">oi 👋</div>
            </div>
          </div>
          <div className="auth-footer">
            Foco em privacidade. <span>•</span> Traga seus amigos!{' '}
          </div>
        </div>
        <section className="auth-panel">
          <div className="auth-panel-inner">
            <div className="mobile-brand">
              <div className="brand-mark">
                <MessageCircle size={20} />
              </div>
              <span>
                ryuto<span className="brand-dot">.</span>
              </span>
            </div>
            <div className="auth-heading">
              <div className="auth-kicker">
                {authMode === 'login'
                  ? 'BEM-VINDO DE VOLTA'
                  : 'COMECE POR AQUI'}
              </div>
              <h2>
                {authMode === 'login' ? 'Entre na sua conta' : 'Crie sua conta'}
              </h2>
              <p>
                {authMode === 'login'
                  ? 'Suas conversas estão esperando por você.'
                  : 'Escolha seu nome de usuário e entre na conversa.'}
              </p>
            </div>
            <form className="auth-form" onSubmit={handleAuth}>
              <label>
                Nome de usuário
                <div className="input-wrap">
                  <span>@</span>
                  <input
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="seu_usuario"
                    minLength={3}
                    maxLength={30}
                    required
                  />
                </div>
              </label>
              <label>
                Senha
                <input
                  type="password"
                  autoComplete={
                    authMode === 'login' ? 'current-password' : 'new-password'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    authMode === 'register'
                      ? '8+ caracteres, maiúscula, minúscula e número'
                      : 'Sua senha'
                  }
                  minLength={authMode === 'login' ? 1 : 8}
                  maxLength={72}
                  pattern={
                    authMode === 'register'
                      ? '(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,72}'
                      : undefined
                  }
                  title="Use pelo menos 8 caracteres, incluindo uma letra maiúscula, uma minúscula e um número."
                  required
                />
              </label>
              <button
                className="primary-button auth-submit"
                disabled={authBusy}
              >
                {authBusy ? <span className="spinner" /> : null}
                {authMode === 'login' ? 'Entrar na conta' : 'Criar conta'}{' '}
                <ArrowUpRight size={17} />
              </button>
            </form>
            <div className="auth-switch">
              {authMode === 'login'
                ? 'Ainda não tem uma conta?'
                : 'Já tem uma conta?'}
              <button
                onClick={() =>
                  setAuthMode(authMode === 'login' ? 'register' : 'login')
                }
              >
                {authMode === 'login' ? 'Criar conta' : 'Fazer login'}
              </button>
            </div>
            <div className="security-note">
              <ShieldCheck size={15} />
              <span>Conexão autenticada por token JWT</span>
            </div>
          </div>
        </section>
        {notice && <div className={`toast ${notice.kind}`}>{notice.text}</div>}
      </main>
    );
  }

  const selectedFriend = activeFriend?.friend;
  const currentMessages = selectedFriend
    ? messages.filter(
        (message) =>
          (message.senderId === session.user.id &&
            message.receiverId === selectedFriend.id) ||
          (message.senderId === selectedFriend.id &&
            message.receiverId === session.user.id),
      )
    : [];

  return (
    <main className="app-shell">
      <aside
        className={`sidebar ${mobileView === 'chat' ? 'mobile-hidden' : ''}`}
      >
        <div className="sidebar-top">
          <div className="brand">
            <div className="brand-mark">
              <MessageCircle size={18} />
            </div>
            <span>
              ryuto<span className="brand-dot">.</span>
            </span>
          </div>
          <button
            className="icon-button quiet"
            title="Configurações"
            onClick={() => notify('Configurações ainda não implementadas.')}
          >
            <Settings2 size={18} />
          </button>
        </div>
        <div className="workspace-pill">
          <div className="workspace-icon">O</div>
          <div className="workspace-info">
            <b> Espaço privado </b>
            <span>Área de trabalho</span>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="sidebar-section-head">
          <span>MENSAGENS</span>
          <button
            className="icon-button small"
            title="Adicionar amigo"
            onClick={() => setShowAddFriend(true)}
          >
            <Plus size={17} />
          </button>
        </div>
        <div className="search-box">
          <Search size={16} />
          <input
            placeholder="Buscar conversas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd>⌘ K</kbd>
        </div>
        <div className="sidebar-label">
          Conversas <span>{friends.length}</span>
        </div>
        <div className="friend-list">
          {filteredFriends.map((item) => {
            const friend = item.friend;
            const active = activeFriend?.friend.id === friend.id;
            const online = onlineUsers.has(friend.id);
            const lastMessage = messages
              .filter(
                (m) =>
                  (m.senderId === friend.id &&
                    m.receiverId === session.user.id) ||
                  (m.senderId === session.user.id &&
                    m.receiverId === friend.id),
              )
              .slice(-1)[0];

            return (
              <button
                key={item.friendshipId}
                className={`friend-row ${active ? 'selected' : ''}`}
                onClick={() => openConversation(item)}
              >
                <div
                  className={`avatar avatar-${friend.username.charCodeAt(0) % 5}`}
                >
                  {initials(friend.username)}
                  <span className={`presence ${online ? 'is-online' : ''}`} />
                </div>
                <div className="friend-row-text">
                  <b>{friend.username}</b>
                  <span>
                    {lastMessage?.content ||
                      (online ? 'Online agora' : 'Conversa direta')}
                  </span>
                </div>
                {lastMessage && (
                  <time>{formatTime(lastMessage.createdAt)}</time>
                )}
              </button>
            );
          })}
          {filteredFriends.length === 0 && (
            <div className="empty-friends">
              <Users size={22} />
              <span>
                {search ? 'Nenhum resultado.' : 'Sua lista está vazia.'}
              </span>
              <button onClick={() => setShowAddFriend(true)}>
                Adicionar amigo
              </button>
            </div>
          )}
        </div>
        <div className="sidebar-section-head request-head">
          <span>Solicitações de amizade</span>
          <button
            className="count-pill"
            onClick={() => setShowRequests((value) => !value)}
          >
            {incoming.length}
          </button>
        </div>
        <button
          className={`nav-row ${showRequests ? 'nav-active' : ''}`}
          onClick={() => setShowRequests((value) => !value)}
        >
          <Bell size={17} />
          <span>Solicitações recebidas</span>
          {incoming.length > 0 && <i>{incoming.length}</i>}
        </button>
        <button
          className="nav-row"
          onClick={() => {
            setShowRequests(true);
            notify(`Você tem ${outgoing.length} solicitação(ões) enviada(s).`);
          }}
        >
          <ArrowUpRight size={17} />
          <span>Solicitações enviadas</span>
        </button>
        <div className="sidebar-bottom">
          <div className="user-profile">
            <div
              className="avatar self-avatar"
              style={
                profileIcon
                  ? { backgroundImage: `url(${profileIcon})` }
                  : undefined
              }
            >
              {!profileIcon && initials(session.user.username)}
            </div>
            <div className="user-profile-info">
              <b>{session.user.username}</b>
              <span>
                <i className={socketConnected ? 'status-online' : ''} />
                {socketConnected ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
            <button className="icon-button quiet" title="Sair" onClick={logout}>
              <LogOut size={17} />
            </button>
          </div>
          <div className="sidebar-help">
            <CircleHelp size={15} />
            <span>Precisa de ajuda?</span>
            <button onClick={() => notify('Este é um MVP local do Ryuto.')}>
              Ajuda
            </button>
          </div>
        </div>
      </aside>

      <section
        className={`main-panel ${mobileView === 'list' ? 'mobile-chat-hidden' : ''}`}
      >
        <header className="topbar">
          <div className="topbar-left">
            {activeFriend && (
              <button
                className="icon-button back-button"
                onClick={() => setMobileView('list')}
              >
                <ArrowLeft size={19} />
              </button>
            )}
            <div className="crumb">
              Mensagens <span>/</span>{' '}
              <b>{selectedFriend?.username || 'Geral'}</b>
            </div>
          </div>
          <div className="topbar-right">
            <div
              className={`connection-status ${socketConnected ? 'connected' : ''}`}
            >
              <span />
              {socketConnected ? 'Online' : 'Conectando...'}
            </div>
            <button
              className="icon-button"
              title="Solicitações"
              onClick={() => setShowRequests((value) => !value)}
            >
              <Bell size={18} />
              {incoming.length > 0 && <i className="notification-dot" />}
            </button>
            <button
              className="icon-button"
              title="Mais opções"
              aria-expanded={showOptions}
              onClick={() => setShowOptions((value) => !value)}
            >
              <MoreHorizontal size={19} />
            </button>
            {showOptions && (
              <div className="options-menu" role="menu">
                <button
                  role="menuitem"
                  onClick={() => {
                    setAccountPage('profile');
                    setShowOptions(false);
                    setShowRequests(false);
                  }}
                >
                  <Users size={16} /> Meu perfil
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setAccountPage('settings');
                    setShowOptions(false);
                    setShowRequests(false);
                  }}
                >
                  <Settings2 size={16} /> Configurações
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setAccountPage('notifications');
                    setShowOptions(false);
                    setShowRequests(false);
                  }}
                >
                  <Bell size={16} /> Notificações
                </button>
              </div>
            )}
          </div>
        </header>

        {accountPage ? (
          <div className="requests-page account-page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">SUA CONTA</div>
                <h1>
                  {accountPage === 'profile'
                    ? 'Meu perfil'
                    : accountPage === 'settings'
                      ? 'Configurações'
                      : 'Notificações'}
                </h1>
                <p>
                  {accountPage === 'profile'
                    ? 'Suas informações de conta.'
                    : accountPage === 'settings'
                      ? 'Preferências do aplicativo.'
                      : 'Atividade e solicitações da sua conta.'}
                </p>
              </div>
              <button
                className="secondary-button"
                onClick={() => setAccountPage(null)}
              >
                Voltar para mensagens
              </button>
            </div>
            {accountPage === 'profile' && (
              <section className="request-card account-card profile-account-card">
                <div
                  className="avatar self-avatar large-avatar profile-icon-preview"
                  style={
                    profileIcon
                      ? { backgroundImage: `url(${profileIcon})` }
                      : undefined
                  }
                >
                  {!profileIcon && initials(session.user.username)}
                </div>
                <div className="request-person">
                  <b>{session.user.username}</b>
                  <span>Nome de usuário</span>
                </div>
                <div className="account-detail">
                  <span>Status</span>
                  <b>{socketConnected ? 'Conectado' : 'Desconectado'}</b>
                </div>
                <div className="profile-icon-actions">
                  <input
                    ref={profileIconInput}
                    className="profile-icon-input"
                    type="file"
                    accept="image/*"
                    aria-label="Selecionar imagem do perfil"
                    onChange={(event) =>
                      chooseProfileIcon(event.target.files?.[0])
                    }
                  />
                  <button
                    className="secondary-button"
                    onClick={() => profileIconInput.current?.click()}
                  >
                    {profileIcon ? 'Trocar imagem' : 'Escolher imagem'}
                  </button>
                  {profileIcon && (
                    <button
                      className="secondary-button"
                      onClick={removeProfileIcon}
                    >
                      Remover
                    </button>
                  )}
                  <small>
                    Selecione uma imagem do seu dispositivo. Ela fica salva
                    neste navegador.
                  </small>
                </div>
              </section>
            )}
            {accountPage === 'settings' && (
              <section className="request-card account-card">
                <div>
                  <b>Sessão</b>
                  <p>Gerencie o acesso à sua conta neste dispositivo.</p>
                </div>
                <button className="secondary-button" onClick={logout}>
                  <LogOut size={16} /> Sair da conta
                </button>
              </section>
            )}
            {accountPage === 'notifications' && (
              <section className="request-card account-card">
                <div>
                  <b>Solicitações recebidas</b>
                  <p>
                    Você tem {incoming.length} solicitação(ões) aguardando
                    resposta.
                  </p>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setAccountPage(null);
                    setShowRequests(true);
                  }}
                >
                  Ver solicitações
                </button>
              </section>
            )}
          </div>
        ) : showRequests ? (
          <div className="requests-page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">SUA REDE</div>
                <h1>Solicitações</h1>
                <p>Gerencie as conexões com outras pessoas.</p>
              </div>
              <button
                className="primary-button"
                onClick={() => setShowAddFriend(true)}
              >
                <UserPlus size={17} /> Adicionar amigo
              </button>
            </div>
            <div className="request-columns">
              <section className="request-card">
                <div className="card-heading">
                  <h3>Recebidas</h3>
                  <span>{incoming.length}</span>
                </div>
                {incoming.length === 0 ? (
                  <div className="empty-state compact">
                    Nenhuma solicitação por enquanto.
                  </div>
                ) : (
                  incoming.map((request) => (
                    <div className="request-row" key={request.id}>
                      <div className="avatar avatar-2">
                        {initials(request.requester?.username || '?')}
                      </div>
                      <div className="request-person">
                        <b>{request.requester?.username || 'Usuário'}</b>
                        <span>Quer adicionar você</span>
                      </div>
                      <button
                        className="accept-button"
                        title="Aceitar"
                        onClick={() => handleRequest(request.id, 'accept')}
                      >
                        <Check size={17} />
                      </button>
                      <button
                        className="reject-button"
                        title="Rejeitar"
                        onClick={() => handleRequest(request.id, 'reject')}
                      >
                        <X size={17} />
                      </button>
                    </div>
                  ))
                )}
              </section>
              <section className="request-card">
                <div className="card-heading">
                  <h3>Enviadas</h3>
                  <span>{outgoing.length}</span>
                </div>
                {outgoing.length === 0 ? (
                  <div className="empty-state compact">
                    Nenhuma solicitação enviada.
                  </div>
                ) : (
                  outgoing.map((request) => (
                    <div className="request-row" key={request.id}>
                      <div className="avatar avatar-3">
                        {initials(request.receiver?.username || '?')}
                      </div>
                      <div className="request-person">
                        <b>{request.receiver?.username || 'Usuário'}</b>
                        <span>Solicitação pendente</span>
                      </div>
                      <span className="pending-label">Pendente</span>
                    </div>
                  ))
                )}
              </section>
            </div>
          </div>
        ) : selectedFriend ? (
          <div className="chat-layout">
            <div className="chat-header">
              <div
                className={`avatar avatar-${selectedFriend.username.charCodeAt(0) % 5} large-avatar`}
              >
                {initials(selectedFriend.username)}
                <span
                  className={`presence ${onlineUsers.has(selectedFriend.id) ? 'is-online' : ''}`}
                />
              </div>
              <div className="chat-contact">
                <h2>{selectedFriend.username}</h2>
                <span>
                  <i
                    className={
                      onlineUsers.has(selectedFriend.id) ? 'status-online' : ''
                    }
                  />
                  {onlineUsers.has(selectedFriend.id)
                    ? 'Online agora'
                    : 'Offline'}
                </span>
              </div>
              <div className="chat-header-actions">
                <button
                  className="icon-button"
                  title="Buscar na conversa"
                  onClick={() => notify('Busca na conversa em breve.')}
                >
                  <Search size={18} />
                </button>
                <button
                  className="icon-button"
                  title="Mais opções"
                  onClick={() => notify('Opções da conversa em breve.')}
                >
                  <MoreHorizontal size={19} />
                </button>
              </div>
            </div>
            <div className="chat-date">
              <span /> <b>CONVERSA DIRETA</b> <span />
            </div>
            <div className="messages-area">
              {loadingMessages ? (
                <div className="empty-state">
                  <span className="spinner dark-spinner" />
                  Carregando mensagens...
                </div>
              ) : currentMessages.length === 0 ? (
                <div className="empty-chat">
                  <div className="empty-chat-icon">
                    <MessageCircle size={24} />
                  </div>
                  <h3>Comece a conversa</h3>
                  <p>
                    Envie uma mensagem para <b>@{selectedFriend.username}</b>.
                  </p>
                </div>
              ) : (
                currentMessages.map((message, index) => {
                  const mine = message.senderId === session.user.id;
                  const previous = currentMessages[index - 1];
                  const showDay =
                    !previous ||
                    formatDay(previous.createdAt) !==
                      formatDay(message.createdAt);
                  return (
                    <div key={message.id}>
                      {showDay && (
                        <div className="day-divider">
                          <span>{formatDay(message.createdAt)}</span>
                        </div>
                      )}
                      <div className={`message-row ${mine ? 'mine' : ''}`}>
                        {!mine && (
                          <div
                            className={`avatar message-avatar avatar-${selectedFriend.username.charCodeAt(0) % 5}`}
                          >
                            {initials(selectedFriend.username)}
                          </div>
                        )}
                        <div className="message-content">
                          <div
                            className={`message-bubble ${mine ? 'own-bubble' : ''}`}
                          >
                            {message.content}
                          </div>
                          <div className="message-meta">
                            {formatTime(message.createdAt)}{' '}
                            {mine && <CheckCheck size={13} />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>
            <form className="composer" onSubmit={sendMessage}>
              <div className="composer-input">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Mensagem para ${selectedFriend.username}...`}
                  maxLength={4000}
                />
                <span>
                  {draft.length > 0 ? `${draft.length}/4000` : '↵ enviar'}
                </span>
              </div>
              <button
                className="send-button"
                type="submit"
                disabled={!draft.trim() || !socketConnected}
                aria-label="Enviar mensagem"
              >
                <Send size={17} />
              </button>
            </form>
            <div className="composer-foot">
              <ShieldCheck size={13} /> Suas mensagens são enviadas por uma
              conexão autenticada.
            </div>
          </div>
        ) : (
          <div className="overview">
            <div className="overview-glow" />
            <div className="overview-content">
              <div className="overview-icon">
                <MessageCircle size={27} />
              </div>
              <div className="eyebrow">
                <span className="eyebrow-dot" /> SUAS MENSAGENS PRIVADAS, FUJA
                DO TRABALHO
              </div>
              <h1>
                Suas conversas,
                <br />
                <span>em um só lugar.</span>
              </h1>
              <p>
                Escolha alguém na sua lista para começar a conversar, ou
                adicione uma nova conexão.
              </p>
              <div className="overview-actions">
                <button
                  className="primary-button"
                  onClick={() => setShowAddFriend(true)}
                >
                  <UserPlus size={17} /> Adicionar amigo
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setShowRequests(true)}
                >
                  <ArrowDownLeft size={17} /> Ver solicitações
                  {incoming.length > 0 && (
                    <span className="button-count">{incoming.length}</span>
                  )}
                </button>
              </div>
              <div className="overview-stats">
                <div>
                  <b>{friends.length.toString().padStart(2, '0')}</b>
                  <span>CONEXÕES</span>
                </div>
                <div>
                  <b>{incoming.length.toString().padStart(2, '0')}</b>
                  <span>PENDENTES</span>
                </div>
                <div>
                  <b>{socketConnected ? 'AO VIVO' : '—'}</b>
                  <span>STATUS</span>
                </div>
              </div>
            </div>
            <div className="overview-bottom">
              <span>RYUTO - Fast Web Chat</span>
              <span>
                Construído pro seu grupo seleto de amigos!{' '}
                <span className="brand-dot">●</span>
              </span>
            </div>
          </div>
        )}
      </section>

      {showAddFriend && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) =>
            e.target === e.currentTarget && setShowAddFriend(false)
          }
        >
          <section className="modal-card">
            <button
              className="modal-close icon-button"
              onClick={() => setShowAddFriend(false)}
            >
              <X size={18} />
            </button>
            <div className="modal-icon">
              <UserPlus size={21} />
            </div>
            <div className="eyebrow">AUMENTE SEU CICLO!</div>
            <h2>Adicionar amigo</h2>
            <p>Digite o nome de usuário da pessoa que você quer adicionar.</p>
            <form onSubmit={addFriend}>
              <label>
                Nome de usuário
                <div className="input-wrap">
                  <span>@</span>
                  <input
                    autoFocus
                    value={friendUsername}
                    onChange={(e) => setFriendUsername(e.target.value)}
                    placeholder="username"
                    minLength={3}
                    maxLength={30}
                    required
                  />
                </div>
              </label>
              <button
                className="primary-button modal-submit"
                disabled={!friendUsername.trim()}
              >
                <UserPlus size={16} /> Enviar solicitação
              </button>
            </form>
          </section>
        </div>
      )}

      {notice && (
        <div className={`toast ${notice.kind}`}>
          {notice.kind === 'success' ? <Check size={16} /> : <X size={16} />}
          {notice.text}
        </div>
      )}
    </main>
  );
}
