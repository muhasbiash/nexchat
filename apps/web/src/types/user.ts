export interface ApiUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

export interface UsersResponse {
  users: ApiUser[];
}
