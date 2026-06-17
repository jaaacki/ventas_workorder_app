import api from './api';

export interface Role {
  id: string;
  key: 'owner' | 'admin' | 'user';
  name: string;
  description: string | null;
  builtIn: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  active: boolean;
  role: Role | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/api/auth/login', { email, password });
  return data;
}

export async function register(payload: {
  email: string;
  password: string;
  name?: string;
  roleId?: string;
}): Promise<User> {
  const { data } = await api.post<User>('/api/auth/register', payload);
  return data;
}

export async function me(): Promise<User> {
  const { data } = await api.get<User>('/api/auth/me');
  return data;
}

export async function logoutApi(): Promise<void> {
  await api.post('/api/auth/logout');
}

export async function fetchRoles(): Promise<Role[]> {
  const { data } = await api.get<Role[]>('/api/auth/roles');
  return data;
}

export async function updateRole(id: string, payload: { name?: string; description?: string }): Promise<Role> {
  const { data } = await api.patch<Role>(`/api/auth/roles/${id}`, payload);
  return data;
}

export async function fetchStaff(): Promise<User[]> {
  const { data } = await api.get<User[]>('/api/auth/staff');
  return data;
}

export async function updateStaffRole(id: string, roleId: string): Promise<User> {
  const { data } = await api.patch<User>(`/api/auth/staff/${id}/role`, { roleId });
  return data;
}

export async function updateStaffActive(id: string, active: boolean): Promise<User> {
  const { data } = await api.patch<User>(`/api/auth/staff/${id}/active`, { active });
  return data;
}
