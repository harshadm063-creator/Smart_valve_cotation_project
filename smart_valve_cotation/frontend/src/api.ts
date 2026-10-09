import type {
  EquipmentConfig,
  EstimateCalculationResponse,
  QuotationDetail,
  QuotationSummary,
  ExtractionResponse,
  MaterialItem,
  ProcessingRateItem,
  BoughtOutItem,
  ActuationPackage
} from './types';

const BASE_URL = '/api/v1';

export async function fetchHealth() {
  const res = await fetch(`${BASE_URL}/health`);
  return res.json();
}

export async function fetchOptions() {
  const res = await fetch(`${BASE_URL}/options`);
  if (!res.ok) throw new Error('Failed to load application options');
  return res.json();
}

export async function extractPdfSpecifications(file: File): Promise<ExtractionResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE_URL}/specifications/extract`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Extraction failed' }));
    throw new Error(err.detail || 'Failed to extract PDF specifications');
  }
  return res.json();
}

export async function calculateEstimatePreview(config: EquipmentConfig): Promise<EstimateCalculationResponse> {
  const res = await fetch(`${BASE_URL}/estimates/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Calculation error' }));
    throw new Error(err.detail || 'Calculation failed');
  }
  return res.json();
}

export async function saveEstimate(config: EquipmentConfig): Promise<QuotationDetail> {
  const res = await fetch(`${BASE_URL}/estimates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to save estimate' }));
    throw new Error(err.detail || 'Failed to save estimate');
  }
  return res.json();
}

export async function listEstimates(search?: string, equipmentType?: string, status?: string): Promise<QuotationSummary[]> {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (equipmentType) params.append('equipment_type', equipmentType);
  if (status) params.append('status', status);

  const res = await fetch(`${BASE_URL}/estimates?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to retrieve estimates');
  return res.json();
}

export async function getEstimate(id: number): Promise<QuotationDetail> {
  const res = await fetch(`${BASE_URL}/estimates/${id}`);
  if (!res.ok) throw new Error(`Failed to load quotation #${id}`);
  return res.json();
}

export async function updateEstimate(id: number, config: EquipmentConfig): Promise<QuotationDetail> {
  const res = await fetch(`${BASE_URL}/estimates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Update failed' }));
    throw new Error(err.detail || 'Failed to update quotation');
  }
  return res.json();
}

export async function duplicateEstimate(id: number): Promise<QuotationDetail> {
  const res = await fetch(`${BASE_URL}/estimates/${id}/duplicate`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to duplicate quotation');
  return res.json();
}

export async function recalculateEstimate(id: number): Promise<QuotationDetail> {
  const res = await fetch(`${BASE_URL}/estimates/${id}/recalculate`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to recalculate quotation');
  return res.json();
}

export async function issueQuotation(id: number): Promise<QuotationDetail> {
  const res = await fetch(`${BASE_URL}/estimates/${id}/issue`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to issue quotation');
  return res.json();
}

export function getQuotationPdfUrl(id: number): string {
  return `${BASE_URL}/quotations/${id}/pdf`;
}

export async function listMaterials(): Promise<MaterialItem[]> {
  const res = await fetch(`${BASE_URL}/materials`);
  return res.json();
}

export async function updateMaterial(id: number, data: Partial<MaterialItem>): Promise<MaterialItem> {
  const res = await fetch(`${BASE_URL}/materials/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update material');
  return res.json();
}

export async function createMaterial(data: MaterialItem): Promise<MaterialItem> {
  const res = await fetch(`${BASE_URL}/materials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create material');
  return res.json();
}

export async function listProcessingRates(): Promise<ProcessingRateItem[]> {
  const res = await fetch(`${BASE_URL}/processing-rates`);
  return res.json();
}

export async function updateProcessingRate(code: string, rate_per_kg: number): Promise<ProcessingRateItem> {
  const res = await fetch(`${BASE_URL}/processing-rates/${code}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rate_per_kg }),
  });
  if (!res.ok) throw new Error('Failed to update processing rate');
  return res.json();
}

export async function listBoughtOutItems(equipmentType?: string, sizeCategory?: string): Promise<BoughtOutItem[]> {
  const params = new URLSearchParams();
  if (equipmentType) params.append('equipment_type', equipmentType);
  if (sizeCategory) params.append('size_category', sizeCategory);
  const res = await fetch(`${BASE_URL}/bought-out-items?${params.toString()}`);
  return res.json();
}

export async function createBoughtOutItem(item: BoughtOutItem): Promise<BoughtOutItem> {
  const res = await fetch(`${BASE_URL}/bought-out-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error('Failed to add bought-out component rule');
  return res.json();
}

export async function listActuationPackages(): Promise<ActuationPackage[]> {
  const res = await fetch(`${BASE_URL}/actuation-packages`);
  return res.json();
}
