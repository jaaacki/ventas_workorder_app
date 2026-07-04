import api from './api';

export interface CycleTimePhaseMetric {
  phaseShort: string;
  count: number;
  avgMinutes: number;
  p50Minutes: number;
  p90Minutes: number;
}

export interface WipPhaseMetric {
  phaseShort: string | null;
  count: number;
}

export interface ThroughputPoint {
  period: string;
  released: number;
  lotsMinted: number;
}

export interface StalledRunMetric {
  id: string;
  woNumber: string | null;
  phaseShort: string | null;
  ageDays: number;
  updatedAt: string;
}

export interface CollectionPipelineMetric {
  status: string;
  count: number;
}

export interface MetricsOverview {
  windowDays: number;
  stalledDays: number;
  generatedAt: string;
  cycleTimeByPhase: CycleTimePhaseMetric[];
  wipByPhase: WipPhaseMetric[];
  throughput: { weekly: ThroughputPoint[]; monthly: ThroughputPoint[] };
  stalledRuns: StalledRunMetric[];
  collectionPipeline: CollectionPipelineMetric[];
}

export async function fetchMetricsOverview(params?: {
  windowDays?: number;
  stalledDays?: number;
}): Promise<MetricsOverview> {
  const { data } = await api.get<MetricsOverview>('/api/metrics/overview', { params });
  return data;
}
