import { findAllUsers } from '../repositories/user.repository.js';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

export async function getAllUsers(): Promise<PublicUser[]> {
  const users = await findAllUsers();

  return users.map((user) => ({
    id: user._id!.toString(),
    name: user.name,
    email: user.email,
  }));
}
