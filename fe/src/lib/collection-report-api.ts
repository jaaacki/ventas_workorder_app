import api from './api';

export interface CollectionReportClinic {
  clinicId: string | null;
  clinicName: string | null;
  hciCode: string | null;
  count: number;
}

export interface CollectionReportPeriod {
  period: string;
  count: number;
}

export interface CollectionReport {
  from: string | null;
  to: string | null;
  clinicId: string | null;
  groupBy: 'week' | 'month';
  generatedAt: string;
  total: number;
  byClinic: CollectionReportClinic[];
  byPeriod: CollectionReportPeriod[];
}

export async function fetchCollectionReport(params?: {
  clinicId?: string;
  from?: string;
  to?: string;
  groupBy?: 'week' | 'month';
}): Promise<CollectionReport> {
  const { data } = await api.get<CollectionReport>('/api/reports/collections', { params });
  return data;
}
