export interface ApiUser {
  id: string;
  name: string;
  email: string;
}

export interface UsersResponse {
  users: ApiUser[];
}
