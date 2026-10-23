export interface User {
  id: string;
  username: string;
  avatarUrl?: string | null;
}

export interface Friend {
  friendshipId: string;
  friend: User;
  createdAt: string;
}

export interface FriendRequest {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: string;
  requester?: User;
  receiver?: User;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
}
