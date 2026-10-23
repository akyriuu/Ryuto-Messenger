import type { ChatMessage, Friend, FriendRequest, User } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const raw = await response.text();
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!response.ok) {
    const body = data as { message?: string | string[]; error?: string } | null;
    const message = Array.isArray(body?.message)
      ? body?.message.join(', ')
      : body?.message || body?.error || `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<User>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    request<{ accessToken: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  updateAvatar: (avatarUrl: string, token: string) =>
    request<User>(
      '/auth/me/avatar',
      {
        method: 'PATCH',
        body: JSON.stringify({ avatarUrl }),
      },
      token,
    ),

  friends: (token: string) => request<Friend[]>('/friends', {}, token),

  incomingRequests: (token: string) =>
    request<FriendRequest[]>('/friends/requests/incoming', {}, token),

  outgoingRequests: (token: string) =>
    request<FriendRequest[]>('/friends/requests/outgoing', {}, token),

  sendFriendRequest: (username: string, token: string) =>
    request<FriendRequest>(
      '/friends/requests',
      {
        method: 'POST',
        body: JSON.stringify({ username }),
      },
      token,
    ),

  acceptRequest: (id: string, token: string) =>
    request<FriendRequest>(
      `/friends/requests/${encodeURIComponent(id)}/accept`,
      {
        method: 'PATCH',
      },
      token,
    ),

  rejectRequest: (id: string, token: string) =>
    request<FriendRequest>(
      `/friends/requests/${encodeURIComponent(id)}/reject`,
      {
        method: 'PATCH',
      },
      token,
    ),

  history: (otherUserId: string, token: string) =>
    request<ChatMessage[]>(
      `/messages/${encodeURIComponent(otherUserId)}`,
      {},
      token,
    ),
};
