import { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  DollarSign,
  Plus,
  RefreshCw,
  Download,
  Copy,
  Trash2,
  Search,
  Sliders,
  Settings,
  ArrowRight,
  Check,
  FileCheck,
  Eye,
  FileSpreadsheet,
  RotateCcw,
  History
} from 'lucide-react';

import type {
  EquipmentConfig,
  BOMItem,
  EstimateCalculationResponse,
  QuotationDetail,
  QuotationSummary,
  MaterialItem,
  MaterialRateAudit
} from './types';

import {
  EQUIPMENT_OPTIONS,
  STANDARD_MATERIALS,
  getDefaultComponentTemplate,
  getMaterialRate
} from './templates';

import {
  extractPdfSpecifications,
  calculateEstimatePreview,
  saveEstimate,
  listEstimates,
  getEstimate,
  updateEstimate,
  duplicateEstimate,
  recalculateEstimate,
  issueQuotation,
  getQuotationPdfUrl,
  listMaterials,
  updateMaterial,
  listMaterialRateAudits
} from './api';

// Currency formatter
function formatINR(val: number = 0): string {
  try {
    const s = Math.round(val).toString();
    const lastThree = s.substring(s.length - 3);
    const otherNumbers = s.substring(0, s.length - 3);
    if (otherNumbers !== '') {
      return '₹' + otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
    }
    return '₹' + lastThree;
  } catch {
    return `₹${val.toFixed(2)}`;
  }
}

export default function App() {
  // Navigation tabs: 'dashboard', 'new', 'bom_editor', 'results', 'preview', 'saved', 'admin'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'new' | 'bom_editor' | 'results' | 'preview' | 'saved' | 'admin'>('dashboard');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Dashboard state
  const [quotations, setQuotations] = useState<QuotationSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // New quotation input mode: 'pdf' or 'manual'
  const [inputMode, setInputMode] = useState<'pdf' | 'manual'>('manual');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // Admin state
  const [materials, setMaterials] = useState<MaterialItem[]>(STANDARD_MATERIALS);
  const [materialAudits, setMaterialAudits] = useState<MaterialRateAudit[]>([]);

  // Equipment switch confirmation modal state
  const [pendingEquipmentType, setPendingEquipmentType] = useState<string | null>(null);
  const [showSwitchModal, setShowSwitchModal] = useState(false);

  // Active Equipment Configuration state
  const [currentConfig, setCurrentConfig] = useState<EquipmentConfig>(() => {
    const initialDims = { length: 1600, width_diameter: 1400, depth: 450 };
    return {
      customer_name: 'National Thermal Power Corporation',
      contact_person: 'Mr. Rajesh Sharma',
      email: 'rsharma@ntpc.co.in',
      phone: '+91 98765 43210',
      project_name: 'Supercritical Thermal FGD Unit',
      rfq_number: 'RFQ-NTPC-FGD-2026-904',
      delivery_location: 'Ramagundam Site, Telangana',
      equipment_type: 'Butterfly Valve',
      tag_number: 'DMP-FGD-ISOL-01',
      quantity: 1,
      length: initialDims.length,
      width_diameter: initialDims.width_diameter,
      depth: initialDims.depth,
      body_material: 'IS 2062',
      flap_disc_material: 'SS 304 L',
      actuation_type: 'Pneumatic',
      remarks: 'Flue gas application with graphite packing and metallic seats.',
      tax_percent: 18,
      margin_percent: 15,
      status: 'Draft',
      custom_bom: getDefaultComponentTemplate('Butterfly Valve', initialDims, STANDARD_MATERIALS)
    };
  });

  // Active calculation / estimate details
  const [estimateResult, setEstimateResult] = useState<EstimateCalculationResponse | null>(null);
  const [savedQuoteDetail, setSavedQuoteDetail] = useState<QuotationDetail | null>(null);
  const calculationRequestId = useRef(0);

  // Load initial options & dashboard quotations
  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      setLoading(true);
      const [quoteList, matsList] = await Promise.all([
        listEstimates().catch(() => []),
        listMaterials().catch(() => STANDARD_MATERIALS)
      ]);
      setQuotations(quoteList);
      if (matsList && matsList.length > 0) {
        setMaterials(matsList);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to initialize app');
    } finally {
      setLoading(false);
    }
  }

  async function refreshQuotations() {
    try {
      const list = await listEstimates(searchQuery, filterType, filterStatus);
      setQuotations(list);
    } catch (err: any) {
      console.error(err);
    }
  }

  // Flash message handler
  function showToast(msg: string, isError = false) {
    if (isError) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 6000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  }

  async function calculateAndSetPreview(config: EquipmentConfig): Promise<EstimateCalculationResponse> {
    const requestId = ++calculationRequestId.current;
    setEstimateResult(null);
    try {
      const result = await calculateEstimatePreview(config);
      if (requestId === calculationRequestId.current) {
        setEstimateResult(result);
      }
      return result;
    } catch (err) {
      if (requestId === calculationRequestId.current) {
        setEstimateResult(null);
      }
      throw err;
    }
  }

  function refreshEstimatePreview(config: EquipmentConfig) {
    calculateAndSetPreview(config).catch(err => {
      showToast(err.message || 'Failed to recalculate estimate', true);
    });
  }

  // Helper to check if current BOM differs from default template
  function isBOMModified(type: string, bom: BOMItem[] = []): boolean {
    const defaultTemplate = getDefaultComponentTemplate(type, {
      length: currentConfig.length,
      width_diameter: currentConfig.width_diameter,
      depth: currentConfig.depth
    }, materials);
    if (bom.length !== defaultTemplate.length) return true;
    for (let i = 0; i < bom.length; i++) {
      if (bom[i].part_name !== defaultTemplate[i].part_name) return true;
      if (bom[i].quantity !== defaultTemplate[i].quantity) return true;
      if (bom[i].material_grade !== defaultTemplate[i].material_grade) return true;
      if (bom[i].rate_source === 'custom') return true;
    }
    return false;
  }

  // Equipment Type Selection Handler with Confirmation Modal
  function handleEquipmentTypeChangeRequest(newType: string) {
    if (newType === currentConfig.equipment_type) return;
    const modified = isBOMModified(currentConfig.equipment_type, currentConfig.custom_bom || []);
    if (modified) {
      setPendingEquipmentType(newType);
      setShowSwitchModal(true);
    } else {
      applyEquipmentTypeSwitch(newType, true);
    }
  }

  function applyEquipmentTypeSwitch(newType: string, loadTemplate: boolean) {
    let newBOM = currentConfig.custom_bom || [];
    if (loadTemplate) {
      newBOM = getDefaultComponentTemplate(newType, {
        length: currentConfig.length,
        width_diameter: currentConfig.width_diameter,
        depth: currentConfig.depth
      }, materials);
    }

    const updated = {
      ...currentConfig,
      equipment_type: newType,
      custom_bom: newBOM
    };
    setCurrentConfig(updated);
    setShowSwitchModal(false);
    setPendingEquipmentType(null);

    // Recalculate preview
    refreshEstimatePreview(updated);

    showToast(`Loaded ${newType} with ${newBOM.length} component template.`);
  }

  // --- Live Calculation for individual BOM item change ---
  function updateBOMItemField(index: number, field: keyof BOMItem, value: any) {
    const updatedBom = [...(currentConfig.custom_bom || [])];
    const item = { ...updatedBom[index], [field]: value };

    // Auto-update material rate if material grade was changed
    if (field === 'material_grade') {
      const dbRate = getMaterialRate(value, materials);
      item.unit_material_rate = dbRate;
      item.rate_source = 'material_default';
    }

    // Flag as custom rate if rate was explicitly typed
    if (field === 'unit_material_rate') {
      const numVal = Math.max(0, parseFloat(value) || 0);
      item.unit_material_rate = numVal;
      const dbRate = getMaterialRate(item.material_grade, materials);
      item.rate_source = numVal === dbRate ? 'material_default' : 'custom';
    }

    // Live calculation formula
    const qty = Math.max(1, parseInt(item.quantity as any) || 1);
    const uWt = Math.max(0, parseFloat(item.unit_weight as any) || 0);
    const mRate = Math.max(0, parseFloat(item.unit_material_rate as any) || 0);
    const machCost = Math.max(0, parseFloat(item.machining_cost as any) || 0);

    const rawCost = Math.round(qty * uWt * mRate * 100) / 100;
    const compTotal = Math.round((rawCost + machCost) * 100) / 100;

    item.quantity = qty;
    item.unit_weight = uWt;
    item.raw_material_cost = rawCost;
    item.machining_cost = machCost;
    item.component_total = compTotal;

    updatedBom[index] = item;

    const updatedConfig = { ...currentConfig, custom_bom: updatedBom };
    setCurrentConfig(updatedConfig);

    // Trigger preview calculation in background
    refreshEstimatePreview(updatedConfig);
  }

  // Add Custom Component
  function handleAddComponent() {
    const currentList = currentConfig.custom_bom || [];
    const defaultMat = currentConfig.body_material || 'IS 2062';
    const dbRate = getMaterialRate(defaultMat, materials);

    const newItem: BOMItem = {
      id: currentList.length + 1,
      part_name: `Custom Part ${currentList.length + 1}`,
      category: 'Auxiliary Trim',
      material_grade: defaultMat,
      quantity: 1,
      unit: 'piece',
      unit_weight: 5.0,
      unit_material_rate: dbRate,
      machining_cost: 250,
      raw_material_cost: 5.0 * dbRate,
      component_total: 5.0 * dbRate + 250,
      rate_source: 'material_default',
      shape: 'plate',
      length: 200,
      width: 100,
      thickness: 10,
      diameter: 0,
      wall_thickness: 0
    };

    const updatedBom = [...currentList, newItem];
    const updatedConfig = { ...currentConfig, custom_bom: updatedBom };
    setCurrentConfig(updatedConfig);
    refreshEstimatePreview(updatedConfig);

    showToast(`Added new component "${newItem.part_name}".`);
  }

  // Duplicate Component
  function handleDuplicateComponent(index: number) {
    const currentList = currentConfig.custom_bom || [];
    const target = currentList[index];
    if (!target) return;

    const dupItem: BOMItem = {
      ...target,
      id: currentList.length + 1,
      part_name: `${target.part_name} (Copy)`
    };

    const updatedBom = [...currentList.slice(0, index + 1), dupItem, ...currentList.slice(index + 1)];
    const updatedConfig = { ...currentConfig, custom_bom: updatedBom };
    setCurrentConfig(updatedConfig);
    refreshEstimatePreview(updatedConfig);

    showToast(`Duplicated component "${target.part_name}".`);
  }

  // Remove Component
  function handleRemoveComponent(index: number) {
    const currentList = currentConfig.custom_bom || [];
    if (currentList.length <= 1) {
      showToast('A minimum of 1 component is required in the Bill of Materials.', true);
      return;
    }
    const removedName = currentList[index]?.part_name || 'Component';
    const updatedBom = currentList.filter((_, i) => i !== index);
    const updatedConfig = { ...currentConfig, custom_bom: updatedBom };
    setCurrentConfig(updatedConfig);
    refreshEstimatePreview(updatedConfig);

    showToast(`Removed "${removedName}".`);
  }

  // Reset to Default Template
  function handleResetTemplate() {
    const template = getDefaultComponentTemplate(currentConfig.equipment_type, {
      length: currentConfig.length,
      width_diameter: currentConfig.width_diameter,
      depth: currentConfig.depth
    }, materials);

    const updatedConfig = { ...currentConfig, custom_bom: template };
    setCurrentConfig(updatedConfig);
    refreshEstimatePreview(updatedConfig);

    showToast(`Reset ${currentConfig.equipment_type} to default engineering template.`);
  }

  // --- Live Cost Summary Metrics Computed on Client ---
  const bomMetrics = useMemo(() => {
    const items = currentConfig.custom_bom || [];
    let totalItemsCount = items.length;
    let totalQty = 0;
    let totalWeight = 0;
    let totalRawMaterialCost = 0;
    let totalMachiningFabCost = 0;
    let totalBOMCost = 0;

    items.forEach(item => {
      const q = item.quantity || 1;
      const uWt = item.unit_weight || 0;
      const mRate = item.unit_material_rate || 0;
      const mach = item.machining_cost || 0;

      const raw = q * uWt * mRate;
      const compTotal = raw + mach;

      totalQty += q;
      totalWeight += q * uWt;
      totalRawMaterialCost += raw;
      totalMachiningFabCost += mach;
      totalBOMCost += compTotal;
    });

    const qtyMultiplier = currentConfig.quantity || 1;
    const subtotal = totalBOMCost * qtyMultiplier;
    const marginPct = currentConfig.margin_percent || 0;
    const marginAmt = subtotal * (marginPct / 100);
    const taxable = subtotal + marginAmt;
    const taxPct = currentConfig.tax_percent || 0;
    const taxAmt = taxable * (taxPct / 100);
    const finalAmount = taxable + taxAmt;
    const calculatedCosts = estimateResult?.cost_breakdown;

    if (calculatedCosts) {
      totalWeight = estimateResult.total_weight_kg;
      totalRawMaterialCost = calculatedCosts.raw_material_cost;
      totalMachiningFabCost = calculatedCosts.cutting_cost
        + calculatedCosts.machining_cost
        + calculatedCosts.fabrication_cost
        + calculatedCosts.finishing_cost;
      totalBOMCost = estimateResult.bom_items.reduce(
        (sum, item) => sum + (item.component_total || 0),
        0
      ) * (currentConfig.quantity || 1);
    }

    return {
      totalItemsCount,
      totalQty,
      totalWeight: Math.round(totalWeight * 100) / 100,
      totalRawMaterialCost: Math.round(totalRawMaterialCost * 100) / 100,
      totalMachiningFabCost: Math.round(totalMachiningFabCost * 100) / 100,
      totalBOMCost: Math.round(totalBOMCost * 100) / 100,
      subtotal: calculatedCosts?.subtotal ?? Math.round(subtotal * 100) / 100,
      marginAmt: calculatedCosts?.margin_amount ?? Math.round(marginAmt * 100) / 100,
      taxAmt: calculatedCosts?.tax_amount ?? Math.round(taxAmt * 100) / 100,
      finalAmount: calculatedCosts?.final_amount ?? Math.round(finalAmount * 100) / 100
    };
  }, [currentConfig, estimateResult]);

  // --- PDF Import & Extraction Workflow ---
  async function handleFileUpload(file: File) {
    setPdfFile(file);
    setIsExtracting(true);
    setErrorMsg(null);
    try {
      const result = await extractPdfSpecifications(file);
      const fields = result.extracted_fields;
      const eqType = fields.equipment_type?.value || currentConfig.equipment_type;
      const l = fields.length?.value ? Number(fields.length.value) : currentConfig.length;
      const w = fields.width_diameter?.value ? Number(fields.width_diameter.value) : currentConfig.width_diameter;
      const d = fields.depth?.value ? Number(fields.depth.value) : currentConfig.depth;

      const template = getDefaultComponentTemplate(eqType, { length: l, width_diameter: w, depth: d }, materials);

      setCurrentConfig(prev => ({
        ...prev,
        customer_name: fields.customer_name?.value || prev.customer_name,
        rfq_number: fields.rfq_number?.value || prev.rfq_number,
        equipment_type: eqType,
        tag_number: fields.tag_number?.value || prev.tag_number,
        quantity: fields.quantity?.value ? Number(fields.quantity.value) : prev.quantity,
        length: l,
        width_diameter: w,
        depth: d,
        body_material: fields.body_material?.value || prev.body_material,
        flap_disc_material: fields.flap_disc_material?.value || prev.flap_disc_material,
        actuation_type: fields.actuation_type?.value || prev.actuation_type,
        custom_bom: template
      }));

      showToast(`Successfully parsed "${file.name}". Auto-loaded template for ${eqType}.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to parse technical specification PDF', true);
    } finally {
      setIsExtracting(false);
    }
  }

  // Quick test button for sample PDF
  async function loadSamplePdf() {
    try {
      setIsExtracting(true);
      const res = await fetch('/api/v1/sample-spec-pdf');
      const blob = await res.blob();
      const sampleFile = new File([blob], 'sample_customer_damper_spec.pdf', { type: 'application/pdf' });
      await handleFileUpload(sampleFile);
    } catch (err: any) {
      showToast('Could not load sample PDF. You can upload any customer specification PDF directly.', true);
      setIsExtracting(false);
    }
  }

  // --- Calculation & Proceed to BOM / Results ---
  async function handleProceedToBOM() {
    if (!currentConfig.length || currentConfig.length < 100) {
      showToast('Please enter a valid length (minimum 100 mm)', true);
      return;
    }
    if (!currentConfig.width_diameter || currentConfig.width_diameter < 100) {
      showToast('Please enter a valid width/diameter (minimum 100 mm)', true);
      return;
    }
    if (!currentConfig.depth || currentConfig.depth < 50) {
      showToast('Please enter a valid casing depth (minimum 50 mm)', true);
      return;
    }

    try {
      setLoading(true);
      await calculateAndSetPreview(currentConfig);
      setActiveTab('bom_editor');
      showToast('Bill of Materials loaded and validated with centralized cost engine.');
    } catch (err: any) {
      showToast(err.message || 'Error generating BOM', true);
    } finally {
      setLoading(false);
    }
  }

  // --- Save / Issue Quotation ---
  async function handleSaveQuotation(status: string = 'Draft') {
    try {
      setLoading(true);
      const payload = {
        ...currentConfig,
        custom_bom: currentConfig.custom_bom || estimateResult?.bom_items,
        status: status
      };

      let saved: QuotationDetail;
      if (savedQuoteDetail && savedQuoteDetail.id) {
        saved = await updateEstimate(savedQuoteDetail.id, payload);
      } else {
        saved = await saveEstimate(payload);
      }

      setSavedQuoteDetail(saved);
      showToast(`Quotation ${saved.quote_number} (Rev ${saved.revision}) saved as ${saved.status}!`);
      await refreshQuotations();
      setActiveTab('preview');
    } catch (err: any) {
      showToast(err.message || 'Failed to save quotation', true);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadSavedQuote(id: number) {
    try {
      setLoading(true);
      const detail = await getEstimate(id);
      setSavedQuoteDetail(detail);
      setCurrentConfig({
        customer_name: detail.customer_name,
        contact_person: detail.contact_person,
        email: detail.email,
        phone: detail.phone,
        project_name: detail.project_name,
        rfq_number: detail.rfq_number,
        delivery_location: detail.delivery_location,
        equipment_type: detail.equipment_type,
        tag_number: detail.tag_number,
        quantity: detail.quantity,
        length: detail.length,
        width_diameter: detail.width_diameter,
        depth: detail.depth,
        body_material: detail.body_material,
        flap_disc_material: detail.flap_disc_material,
        actuation_type: detail.actuation_type,
        remarks: detail.remarks,
        tax_percent: detail.cost_breakdown.tax_percent,
        margin_percent: detail.cost_breakdown.margin_percent,
        status: detail.status,
        custom_bom: detail.bom_items
      });
      await calculateAndSetPreview({
        ...detail,
        custom_bom: detail.bom_items,
        tax_percent: detail.cost_breakdown.tax_percent,
        margin_percent: detail.cost_breakdown.margin_percent
      });
      setActiveTab('preview');
    } catch (err: any) {
      showToast(err.message || 'Failed to open quotation', true);
    } finally {
      setLoading(false);
    }
  }

  async function handleDuplicateQuote(id: number) {
    try {
      setLoading(true);
      const dup = await duplicateEstimate(id);
      showToast(`Duplicated into new draft ${dup.quote_number}`);
      await refreshQuotations();
      await handleLoadSavedQuote(dup.id);
    } catch (err: any) {
      showToast(err.message || 'Duplicate failed', true);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecalculateCurrentRates(id: number) {
    try {
      setLoading(true);
      const rec = await recalculateEstimate(id);
      showToast(`Recalculated ${rec.quote_number} with latest database rates (now Revision R${rec.revision})`);
      await refreshQuotations();
      await handleLoadSavedQuote(rec.id);
    } catch (err: any) {
      showToast(err.message || 'Recalculation failed', true);
    } finally {
      setLoading(false);
    }
  }

  async function handleIssueCurrentQuote() {
    if (!savedQuoteDetail) return;
    try {
      setLoading(true);
      const issued = await issueQuotation(savedQuoteDetail.id);
      setSavedQuoteDetail(issued);
      showToast(`Quotation ${issued.quote_number} successfully marked as Officially ISSUED!`);
      await refreshQuotations();
    } catch (err: any) {
      showToast(err.message || 'Failed to issue quotation', true);
    } finally {
      setLoading(false);
    }
  }

  // --- Admin Data Load ---
  async function loadAdminData() {
    try {
      setLoading(true);
      const [mats, audits] = await Promise.all([
        listMaterials().catch(() => STANDARD_MATERIALS),
        listMaterialRateAudits().catch(() => [])
      ]);
      setMaterials(mats);
      setMaterialAudits(audits);
    } catch (err: any) {
      showToast(err.message || 'Failed to load pricing database', true);
    } finally {
      setLoading(false);
    }
  }

  // Calculate dashboard stats
  const totalQuotesCount = quotations.length;
  const draftQuotesCount = quotations.filter(q => q.status === 'Draft').length;
  const completedQuotesCount = quotations.filter(q => q.status === 'Validated' || q.status === 'Issued').length;
  const totalEstimatedValue = quotations.reduce((acc, q) => acc + q.final_amount, 0);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* 1. LEFT SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col justify-between shrink-0 shadow-xl border-r border-slate-800">
        <div>
          {/* Brand Logo & Name */}
          <div className="p-5 border-b border-slate-800 flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500 flex items-center justify-center text-slate-900 font-black shadow-md text-xl tracking-tighter">
              SV
            </div>
            <div>
              <h1 className="font-bold text-base text-white tracking-tight leading-tight">
                Smart Valve & Damper
              </h1>
              <p className="text-xs text-amber-400 font-medium tracking-wide uppercase">
                Estimation Platform
              </p>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="p-3 space-y-1 text-sm font-medium">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Layers className="h-4 w-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => {
                setSavedQuoteDetail(null);
                setEstimateResult(null);
                setActiveTab('new');
              }}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                activeTab === 'new'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Plus className="h-4 w-4" />
              <span>Create New Quotation</span>
            </button>

            <button
              onClick={() => {
                if (currentConfig.custom_bom) refreshEstimatePreview(currentConfig);
                setActiveTab('bom_editor');
              }}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                activeTab === 'bom_editor'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>BOM & Component Editor</span>
            </button>

            <button
              onClick={() => {
                if (currentConfig.custom_bom) refreshEstimatePreview(currentConfig);
                setActiveTab('results');
              }}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                activeTab === 'results'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <DollarSign className="h-4 w-4" />
              <span>Cost Estimation</span>
            </button>

            {savedQuoteDetail && (
              <button
                onClick={() => setActiveTab('preview')}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                  activeTab === 'preview'
                    ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <FileCheck className="h-4 w-4" />
                <span>Quotation Preview</span>
              </button>
            )}

            <button
              onClick={() => {
                refreshQuotations();
                setActiveTab('saved');
              }}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                activeTab === 'saved'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>Saved Quotations</span>
            </button>

            <button
              onClick={() => {
                loadAdminData();
                setActiveTab('admin');
              }}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                activeTab === 'admin'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Settings className="h-4 w-4" />
              <span>Pricing Administration</span>
            </button>
          </nav>
        </div>

        {/* System Status Footer */}
        <div className="p-4 border-t border-slate-800 text-xs text-slate-400 space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-slate-300">Dynamic Engine Active</span>
            </span>
            <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px]">
              v2.0
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            Compliant with ASME & AMCA dynamic estimation standards.
          </p>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col overflow-y-auto bg-slate-100">
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center space-x-2 text-sm text-slate-500">
            <span className="font-medium text-slate-800">Smart Valve</span>
            <span>/</span>
            <span className="capitalize font-semibold text-amber-600">
              {activeTab === 'new' ? 'Dynamic Quotation Configuration' : activeTab.replace('_', ' ')}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                setSavedQuoteDetail(null);
                setActiveTab('new');
              }}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center space-x-1.5 shadow-sm transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create New Quotation</span>
            </button>
          </div>
        </header>

        {/* Notification Toast Banners */}
        {errorMsg && (
          <div className="bg-rose-50 border-l-4 border-rose-500 p-3 mx-6 mt-4 rounded-r-md flex items-center justify-between shadow-xs">
            <div className="flex items-center space-x-2 text-rose-800 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700 text-xs font-bold">✕</button>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3 mx-6 mt-4 rounded-r-md flex items-center justify-between shadow-xs">
            <div className="flex items-center space-x-2 text-emerald-800 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700 text-xs font-bold">✕</button>
          </div>
        )}

        {/* EQUIPMENT TYPE SWITCH CONFIRMATION MODAL */}
        {showSwitchModal && pendingEquipmentType && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center space-x-3 text-amber-600">
                <AlertTriangle className="h-6 w-6" />
                <h3 className="font-bold text-base text-slate-900">Switch Equipment Type?</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                You have modified components in your current <strong>{currentConfig.equipment_type}</strong> configuration.
                Switching to <strong>{pendingEquipmentType}</strong> will load its default component template.
              </p>
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowSwitchModal(false);
                    setPendingEquipmentType(null);
                  }}
                  className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel (Keep Current)
                </button>
                <button
                  type="button"
                  onClick={() => applyEquipmentTypeSwitch(pendingEquipmentType, false)}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold"
                >
                  Keep Custom Components
                </button>
                <button
                  type="button"
                  onClick={() => applyEquipmentTypeSwitch(pendingEquipmentType, true)}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs"
                >
                  Load {pendingEquipmentType} Template
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="p-6 space-y-6">
            {/* Top KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Quotations</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{totalQuotesCount}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <FileText className="h-5 w-5" />
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Draft Estimates</p>
                  <p className="text-2xl font-bold text-amber-600 mt-1">{draftQuotesCount}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Clock className="h-5 w-5" />
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Validated / Issued</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">{completedQuotesCount}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Pipeline Value</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{formatINR(totalEstimatedValue)}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <DollarSign className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* Recent Quotations Table Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Recent Engineering Quotations</h2>
                  <p className="text-xs text-slate-500">Live estimates generated from the centralized cost database</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search customer, quote #..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && refreshQuotations()}
                      className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 w-48"
                    />
                  </div>
                  <select
                    value={filterType}
                    onChange={(e) => {
                      setFilterType(e.target.value);
                      listEstimates(searchQuery, e.target.value, filterStatus).then(setQuotations).catch(() => {});
                    }}
                    className="py-1.5 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-700"
                  >
                    <option value="">All Equipment</option>
                    {EQUIPMENT_OPTIONS.map(opt => <option key={opt.id} value={opt.label}>{opt.label}</option>)}
                  </select>
                  <select
                    value={filterStatus}
                    onChange={(e) => {
                      setFilterStatus(e.target.value);
                      listEstimates(searchQuery, filterType, e.target.value).then(setQuotations).catch(() => {});
                    }}
                    className="py-1.5 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-700"
                  >
                    <option value="">All Statuses</option>
                    <option value="Draft">Draft</option>
                    <option value="Validated">Validated</option>
                    <option value="Issued">Issued</option>
                  </select>
                  <button
                    onClick={refreshQuotations}
                    className="p-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600"
                    title="Refresh list"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {quotations.length === 0 ? (
                <div className="p-12 text-center">
                  <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-700">No quotations found in the database</p>
                  <p className="text-xs text-slate-400 mt-1">Get started by creating your first technical quotation.</p>
                  <button
                    onClick={() => setActiveTab('new')}
                    className="mt-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs px-4 py-2 rounded-lg"
                  >
                    Create New Quotation
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Quote No</th>
                        <th className="py-3 px-4">Customer Name</th>
                        <th className="py-3 px-4">Equipment Type</th>
                        <th className="py-3 px-4">Size Class</th>
                        <th className="py-3 px-4">Calculated Wt</th>
                        <th className="py-3 px-4">Estimated Value</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {quotations.map((q) => (
                        <tr key={q.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                            {q.quote_number} <span className="text-[10px] text-slate-400 font-normal">R{q.revision}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-medium text-slate-800">{q.customer_name}</span>
                            {q.project_name && <span className="block text-[11px] text-slate-400">{q.project_name}</span>}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-700">{q.equipment_type}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              q.size_category === 'SMALL' ? 'bg-blue-50 text-blue-700' :
                              q.size_category === 'MEDIUM' ? 'bg-amber-50 text-amber-700' :
                              'bg-purple-50 text-purple-700'
                            }`}>
                              {q.size_category}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600">{q.total_weight_kg.toFixed(1)} kg</td>
                          <td className="py-3 px-4 font-semibold text-slate-900">{formatINR(q.final_amount)}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              q.status === 'Issued' ? 'bg-emerald-100 text-emerald-800' :
                              q.status === 'Validated' ? 'bg-blue-100 text-blue-800' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {q.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right space-x-1">
                            <button
                              onClick={() => handleLoadSavedQuote(q.id)}
                              className="p-1 hover:bg-slate-200 rounded text-slate-700"
                              title="View & Preview"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDuplicateQuote(q.id)}
                              className="p-1 hover:bg-slate-200 rounded text-slate-700"
                              title="Duplicate Quote"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <a
                              href={getQuotationPdfUrl(q.id)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block p-1 hover:bg-amber-100 text-amber-700 rounded"
                              title="Download Quotation PDF"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: NEW QUOTATION WITH DYNAMIC COMPONENT CONFIGURATION */}
        {activeTab === 'new' && (
          <div className="p-6 max-w-6xl mx-auto w-full space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-slate-200 gap-2">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Create Technical Quotation</h2>
                <p className="text-xs text-slate-500">
                  Select equipment type to automatically load its engineering component template, customize materials, and calculate costs.
                </p>
              </div>

              {/* Mode Toggle Button */}
              <div className="bg-slate-200 p-1 rounded-lg flex space-x-1 text-xs font-semibold">
                <button
                  onClick={() => setInputMode('manual')}
                  className={`px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-all ${
                    inputMode === 'manual' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sliders className="h-3.5 w-3.5" />
                  <span>Manual Configuration</span>
                </button>
                <button
                  onClick={() => setInputMode('pdf')}
                  className={`px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-all ${
                    inputMode === 'pdf' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span>PDF Import & Parse</span>
                </button>
              </div>
            </div>

            {/* OPTION A: PDF UPLOADER */}
            {inputMode === 'pdf' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-amber-500 transition-colors">
                  <UploadCloud className="h-10 w-10 text-amber-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-800">
                    Upload Customer Specification PDF
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Automatically extracts equipment dimensions, tags, materials, and maps to the appropriate valve or damper template.
                  </p>

                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <label className="cursor-pointer bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm">
                      Select PDF File
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleFileUpload(e.target.files[0]);
                          }
                        }}
                      />
                    </label>

                    <button
                      onClick={loadSamplePdf}
                      disabled={isExtracting}
                      className="bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-semibold px-4 py-2 rounded-lg border border-amber-300 shadow-xs"
                    >
                      {isExtracting ? 'Extracting...' : 'Load NTPC Damper Test PDF'}
                    </button>
                  </div>

                  {pdfFile && (
                    <p className="mt-3 text-xs text-slate-600 font-mono">
                      Selected: <strong>{pdfFile.name}</strong> ({(pdfFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* SPECIFICATION ENTRY FORM */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
              {/* Section 1: Customer Information */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">
                  1. Customer & Project Reference
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Company / Customer Name *</label>
                    <input
                      type="text"
                      value={currentConfig.customer_name}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, customer_name: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-amber-500"
                      placeholder="e.g. National Thermal Power Corporation"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Contact Person</label>
                    <input
                      type="text"
                      value={currentConfig.contact_person || ''}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, contact_person: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-amber-500"
                      placeholder="e.g. Mr. Rajesh Sharma"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Email / Phone</label>
                    <input
                      type="text"
                      value={currentConfig.email || ''}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, email: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-amber-500"
                      placeholder="e.g. rsharma@client.com"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Project Name</label>
                    <input
                      type="text"
                      value={currentConfig.project_name || ''}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, project_name: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-amber-500"
                      placeholder="e.g. Supercritical Thermal FGD Unit"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Customer RFQ / Inquiry No.</label>
                    <input
                      type="text"
                      value={currentConfig.rfq_number || ''}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, rfq_number: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-amber-500"
                      placeholder="e.g. RFQ-NTPC-FGD-2026-904"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Delivery Destination</label>
                    <input
                      type="text"
                      value={currentConfig.delivery_location || ''}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, delivery_location: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-amber-500"
                      placeholder="e.g. Ramagundam Site, Telangana"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Technical Parameters */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">
                  2. Technical Equipment Parameters
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Equipment Type *</label>
                    <select
                      value={currentConfig.equipment_type}
                      onChange={(e) => handleEquipmentTypeChangeRequest(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2 font-bold text-amber-900 bg-amber-50/50 focus:ring-1 focus:ring-amber-500 cursor-pointer"
                    >
                      <optgroup label="Industrial Valves">
                        {EQUIPMENT_OPTIONS.filter(o => o.category === 'Valves').map(o => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Heavy Duty Dampers">
                        {EQUIPMENT_OPTIONS.filter(o => o.category === 'Dampers').map(o => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </optgroup>
                    </select>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      {EQUIPMENT_OPTIONS.find(o => o.id === currentConfig.equipment_type)?.description}
                    </span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Equipment Tag No.</label>
                    <input
                      type="text"
                      value={currentConfig.tag_number || ''}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, tag_number: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-amber-500"
                      placeholder="e.g. DMP-FGD-ISOL-01"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Quantity (Units) *</label>
                    <input
                      type="number"
                      min="1"
                      value={currentConfig.quantity}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-amber-500 font-bold"
                    />
                  </div>
                </div>

                {/* Dimensions Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Length (L) <span className="text-slate-400 font-normal">[mm]</span> *
                    </label>
                    <input
                      type="number"
                      min="100"
                      max="10000"
                      value={currentConfig.length}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, length: parseFloat(e.target.value) || 0 })}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono font-medium focus:ring-1 focus:ring-amber-500 bg-white"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Valid range: 100 - 10000 mm</span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Width / Diameter (W) <span className="text-slate-400 font-normal">[mm]</span> *
                    </label>
                    <input
                      type="number"
                      min="100"
                      max="10000"
                      value={currentConfig.width_diameter}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, width_diameter: parseFloat(e.target.value) || 0 })}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono font-medium focus:ring-1 focus:ring-amber-500 bg-white"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Valid range: 100 - 10000 mm</span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Depth / Face-to-Face (D) <span className="text-slate-400 font-normal">[mm]</span> *
                    </label>
                    <input
                      type="number"
                      min="50"
                      max="2000"
                      value={currentConfig.depth}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, depth: parseFloat(e.target.value) || 0 })}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono font-medium focus:ring-1 focus:ring-amber-500 bg-white"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Valid range: 50 - 2000 mm</span>
                  </div>
                </div>

                {/* Materials and Actuation defaults */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Default Body Material</label>
                    <select
                      value={currentConfig.body_material}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, body_material: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 bg-white focus:ring-1 focus:ring-amber-500"
                    >
                      {materials.map(m => (
                        <option key={m.name} value={m.name}>{m.name} (₹{m.raw_rate}/kg)</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Default Disc/Blade Material</label>
                    <select
                      value={currentConfig.flap_disc_material}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, flap_disc_material: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 bg-white focus:ring-1 focus:ring-amber-500"
                    >
                      {materials.map(m => (
                        <option key={m.name} value={m.name}>{m.name} (₹{m.raw_rate}/kg)</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Actuation Type *</label>
                    <select
                      value={currentConfig.actuation_type}
                      onChange={(e) => setCurrentConfig({ ...currentConfig, actuation_type: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 bg-white focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="Pneumatic">Pneumatic Actuator</option>
                      <option value="Electrical">Electrical Motorized Actuator</option>
                      <option value="Manual">Manual (Gearbox / Handwheel)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 3: Dynamic Component Configuration (BOM) */}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 pb-2 gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                        3. Dynamic Component Configuration (BOM)
                      </h3>
                      <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                        {currentConfig.equipment_type} Template
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Edit quantities, material grades, weights, rates, and fabrication charges directly.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleResetTemplate}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 border border-slate-200 transition-colors"
                      title="Reset component list to standard template"
                    >
                      <RotateCcw className="h-3 w-3 text-slate-500" />
                      <span>Reset Template</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAddComponent}
                      className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold px-3.5 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-xs transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Component</span>
                    </button>
                  </div>
                </div>

                {/* Interactive Dynamic Component Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                  <table className="w-full text-left text-xs bg-white">
                    <thead className="bg-slate-900 text-white font-semibold text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3 min-w-44">Component Name</th>
                        <th className="py-2.5 px-3 min-w-36">Material Grade</th>
                        <th className="py-2.5 px-2 w-16 text-center">Qty</th>
                        <th className="py-2.5 px-2 w-20">Unit</th>
                        <th className="py-2.5 px-3 w-28">Unit Wt (kg)</th>
                        <th className="py-2.5 px-3 w-32">Material Rate (₹/kg)</th>
                        <th className="py-2.5 px-3 w-32">Machining/Fab (₹)</th>
                        <th className="py-2.5 px-3 w-32 text-right">Total Cost (₹)</th>
                        <th className="py-2.5 px-2 w-20 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(currentConfig.custom_bom || []).map((item, idx) => {
                        const rawCost = (item.quantity || 1) * (item.unit_weight || 0) * (item.unit_material_rate || 0);
                        const compTotal = estimateResult?.bom_items[idx]?.component_total
                          ?? rawCost + (item.machining_cost || 0);
                        const isCustomRate = item.rate_source === 'custom';

                        return (
                          <tr key={idx} className="hover:bg-amber-50/30 transition-colors">
                            <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>

                            {/* Component Name */}
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={item.part_name}
                                onChange={(e) => updateBOMItemField(idx, 'part_name', e.target.value)}
                                className="w-full font-semibold text-slate-800 bg-transparent border border-transparent hover:border-slate-300 focus:border-amber-500 focus:bg-white rounded px-2 py-1 text-xs"
                                placeholder="e.g. Housing Plate"
                              />
                            </td>

                            {/* Material Grade */}
                            <td className="py-2 px-3">
                              <select
                                value={item.material_grade}
                                onChange={(e) => updateBOMItemField(idx, 'material_grade', e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs font-medium text-slate-800 focus:ring-1 focus:ring-amber-500"
                              >
                                {materials.map(m => (
                                  <option key={m.name} value={m.name}>
                                    {m.name} (₹{m.raw_rate}/kg)
                                  </option>
                                ))}
                                {!materials.some(m => m.name === item.material_grade) && (
                                  <option value={item.material_grade}>{item.material_grade} (Custom)</option>
                                )}
                              </select>
                            </td>

                            {/* Quantity */}
                            <td className="py-2 px-2 text-center">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateBOMItemField(idx, 'quantity', e.target.value)}
                                className="w-14 text-center font-bold text-slate-900 border border-slate-200 rounded px-1.5 py-1 text-xs focus:ring-1 focus:ring-amber-500"
                              />
                            </td>

                            {/* Unit */}
                            <td className="py-2 px-2">
                              <select
                                value={item.unit || 'piece'}
                                onChange={(e) => updateBOMItemField(idx, 'unit', e.target.value)}
                                className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs bg-white text-slate-600"
                              >
                                <option value="piece">piece</option>
                                <option value="Nos">Nos</option>
                                <option value="set">set</option>
                                <option value="kg">kg</option>
                                <option value="m">m</option>
                              </select>
                            </td>

                            {/* Unit Weight */}
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.unit_weight}
                                onChange={(e) => updateBOMItemField(idx, 'unit_weight', e.target.value)}
                                className="w-24 font-mono font-medium text-slate-800 border border-slate-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-amber-500"
                              />
                            </td>

                            {/* Material Rate */}
                            <td className="py-2 px-3">
                              <div className="flex flex-col space-y-0.5">
                                <input
                                  type="number"
                                  step="1"
                                  min="0"
                                  value={item.unit_material_rate}
                                  onChange={(e) => updateBOMItemField(idx, 'unit_material_rate', e.target.value)}
                                  className={`w-28 font-mono font-semibold border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-amber-500 ${
                                    isCustomRate ? 'border-amber-400 bg-amber-50/60 text-amber-900' : 'border-slate-200 text-slate-800'
                                  }`}
                                />
                                <span className={`text-[9px] font-bold uppercase tracking-wider px-1 rounded inline-block w-max ${
                                  isCustomRate ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {isCustomRate ? 'Custom Rate' : 'DB Rate'}
                                </span>
                              </div>
                            </td>

                            {/* Machining / Fabrication Cost */}
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                step="10"
                                min="0"
                                value={item.machining_cost || 0}
                                onChange={(e) => updateBOMItemField(idx, 'machining_cost', parseFloat(e.target.value) || 0)}
                                className="w-28 font-mono text-slate-800 border border-slate-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-amber-500"
                              />
                            </td>

                            {/* Component Total */}
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 text-xs">
                              {formatINR(compTotal)}
                            </td>

                            {/* Actions */}
                            <td className="py-2 px-2 text-center space-x-1">
                              <button
                                type="button"
                                onClick={() => handleDuplicateComponent(idx)}
                                className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-900 rounded"
                                title="Duplicate this component"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveComponent(idx)}
                                className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded"
                                title="Delete component"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Live Automatic Cost Summary Banner */}
                <div className="mt-4 bg-slate-900 text-white rounded-xl p-4 shadow-sm">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center divide-y sm:divide-y-0 sm:divide-x divide-slate-800 text-xs">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Components</p>
                      <p className="text-base font-bold text-white mt-0.5">
                        {bomMetrics.totalItemsCount} <span className="text-xs font-normal text-slate-400">({bomMetrics.totalQty} pcs)</span>
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Total Material Wt</p>
                      <p className="text-base font-mono font-bold text-amber-400 mt-0.5">
                        {bomMetrics.totalWeight.toFixed(2)} kg
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Raw Material Cost</p>
                      <p className="text-base font-mono font-bold text-slate-200 mt-0.5">
                        {formatINR(bomMetrics.totalRawMaterialCost)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Cutting, Machining & Fab</p>
                      <p className="text-base font-mono font-bold text-slate-200 mt-0.5">
                        {formatINR(bomMetrics.totalMachiningFabCost)}
                      </p>
                    </div>

                    <div className="bg-amber-500/10 rounded-lg p-1">
                      <p className="text-[10px] text-amber-400 uppercase font-bold">Total BOM Subtotal</p>
                      <p className="text-base font-mono font-black text-amber-400 mt-0.5">
                        {formatINR(bomMetrics.totalBOMCost)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Commercial Controls: Margin & Tax Summary */}
                <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center space-x-2">
                      <label className="font-semibold text-slate-700">Margin (%):</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={currentConfig.margin_percent || 0}
                        onChange={(e) => setCurrentConfig({ ...currentConfig, margin_percent: parseFloat(e.target.value) || 0 })}
                        className="w-16 border border-slate-300 rounded px-2 py-1 bg-white font-mono"
                      />
                      <span className="text-slate-500 font-mono">+{formatINR(bomMetrics.marginAmt)}</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <label className="font-semibold text-slate-700">GST / Tax (%):</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={currentConfig.tax_percent || 0}
                        onChange={(e) => setCurrentConfig({ ...currentConfig, tax_percent: parseFloat(e.target.value) || 0 })}
                        className="w-16 border border-slate-300 rounded px-2 py-1 bg-white font-mono"
                      />
                      <span className="text-slate-500 font-mono">+{formatINR(bomMetrics.taxAmt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase">Estimated Quotation Total:</span>
                    <span className="text-lg font-black text-slate-900 font-mono">
                      {formatINR(bomMetrics.finalAmount)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold rounded-lg text-xs"
                >
                  Cancel
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleSaveQuotation('Draft')}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg text-xs"
                  >
                    Save Draft
                  </button>

                  <button
                    type="button"
                    onClick={handleProceedToBOM}
                    disabled={loading}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow-sm"
                  >
                    <span>Proceed to Full BOM & Cost Engine</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DEDICATED BOM AND COMPONENT EDITOR */}
        {activeTab === 'bom_editor' && (
          <div className="p-6 max-w-6xl mx-auto w-full space-y-5">
            {/* Header Summary */}
            <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="bg-amber-500 text-slate-950 font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">
                  {estimateResult?.size_category || 'DYNAMIC'} CATEGORY
                </span>
                <h2 className="text-lg font-bold mt-1 tracking-tight">
                  {currentConfig.equipment_type} — Dynamic Bill of Materials (BOM)
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Real-time calculated weights & individual material rates
                </p>
              </div>

              <div className="flex items-center space-x-4 bg-slate-800/80 px-4 py-2.5 rounded-lg border border-slate-700">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Total Weight</p>
                  <p className="text-base font-mono font-bold text-amber-400">
                    {bomMetrics.totalWeight.toFixed(2)} kg
                  </p>
                </div>
                <div className="h-8 w-px bg-slate-700"></div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Total BOM Cost</p>
                  <p className="text-base font-mono font-bold text-white">
                    {formatINR(bomMetrics.totalBOMCost)}
                  </p>
                </div>
              </div>
            </div>

            {/* Interactive BOM Table Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Verified Component Items</h3>
                  <p className="text-xs text-slate-500">Edit component names, material grades, weights, and unit material rates.</p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleResetTemplate}
                    className="bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-200 flex items-center space-x-1"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Reset Default Template</span>
                  </button>

                  <button
                    onClick={handleAddComponent}
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Custom Part</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Component Name</th>
                      <th className="py-2.5 px-3">Material Grade</th>
                      <th className="py-2.5 px-2 text-center">Qty</th>
                      <th className="py-2.5 px-2">Unit</th>
                      <th className="py-2.5 px-3">Unit Wt (kg)</th>
                      <th className="py-2.5 px-3">Material Rate (₹/kg)</th>
                      <th className="py-2.5 px-3">Machining/Fab (₹)</th>
                      <th className="py-2.5 px-3 text-right">Component Total</th>
                      <th className="py-2.5 px-2 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(currentConfig.custom_bom || []).map((item, idx) => {
                      const rawCost = (item.quantity || 1) * (item.unit_weight || 0) * (item.unit_material_rate || 0);
                      const compTotal = estimateResult?.bom_items[idx]?.component_total
                        ?? rawCost + (item.machining_cost || 0);
                      const isCustomRate = item.rate_source === 'custom';

                      return (
                        <tr key={idx} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={item.part_name}
                              onChange={(e) => updateBOMItemField(idx, 'part_name', e.target.value)}
                              className="w-40 font-semibold text-slate-800 border border-slate-200 rounded px-1.5 py-1 text-xs"
                            />
                          </td>

                          <td className="py-2 px-3">
                            <select
                              value={item.material_grade}
                              onChange={(e) => updateBOMItemField(idx, 'material_grade', e.target.value)}
                              className="border border-slate-200 rounded px-1.5 py-1 text-xs bg-white text-slate-800 font-medium"
                            >
                              {materials.map(m => (
                                <option key={m.name} value={m.name}>{m.name} (₹{m.raw_rate}/kg)</option>
                              ))}
                            </select>
                          </td>

                          <td className="py-2 px-2 text-center">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateBOMItemField(idx, 'quantity', e.target.value)}
                              className="w-14 text-center font-bold border border-slate-200 rounded px-1 py-1 text-xs"
                            />
                          </td>

                          <td className="py-2 px-2">
                            <select
                              value={item.unit || 'piece'}
                              onChange={(e) => updateBOMItemField(idx, 'unit', e.target.value)}
                              className="border border-slate-200 rounded px-1 py-1 text-xs bg-white text-slate-600"
                            >
                              <option value="piece">piece</option>
                              <option value="Nos">Nos</option>
                              <option value="set">set</option>
                              <option value="kg">kg</option>
                              <option value="m">m</option>
                            </select>
                          </td>

                          <td className="py-2 px-3">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.unit_weight}
                              onChange={(e) => updateBOMItemField(idx, 'unit_weight', e.target.value)}
                              className="w-20 font-mono border border-slate-200 rounded px-1.5 py-1 text-xs"
                            />
                          </td>

                          <td className="py-2 px-3">
                            <div className="flex items-center space-x-1">
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={item.unit_material_rate}
                                onChange={(e) => updateBOMItemField(idx, 'unit_material_rate', e.target.value)}
                                className={`w-20 font-mono border rounded px-1.5 py-1 text-xs ${
                                  isCustomRate ? 'border-amber-400 bg-amber-50 text-amber-900 font-bold' : 'border-slate-200 text-slate-800'
                                }`}
                              />
                              <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${
                                isCustomRate ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {isCustomRate ? 'Custom' : 'DB'}
                              </span>
                            </div>
                          </td>

                          <td className="py-2 px-3">
                            <input
                              type="number"
                              step="10"
                              min="0"
                              value={item.machining_cost || 0}
                              onChange={(e) => updateBOMItemField(idx, 'machining_cost', parseFloat(e.target.value) || 0)}
                              className="w-24 font-mono border border-slate-200 rounded px-1.5 py-1 text-xs"
                            />
                          </td>

                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                            {formatINR(compTotal)}
                          </td>

                          <td className="py-2 px-2 text-center space-x-1">
                            <button
                              onClick={() => handleDuplicateComponent(idx)}
                              className="p-1 hover:bg-slate-100 text-slate-500 rounded"
                              title="Duplicate"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleRemoveComponent(idx)}
                              className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded"
                              title="Remove part"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setActiveTab('new')}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to Equipment Form
              </button>

              <button
                onClick={() => {
                  refreshEstimatePreview(currentConfig);
                  setActiveTab('results');
                }}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow-sm"
              >
                <span>View Complete Cost Breakdown</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: COST ESTIMATION RESULTS */}
        {activeTab === 'results' && (
          <div className="p-6 max-w-5xl mx-auto w-full space-y-6">
            {/* Top Engineering Summary Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Calculated Equipment Weight</p>
                <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
                  {bomMetrics.totalWeight.toFixed(2)} <span className="text-sm font-normal text-slate-500">kg</span>
                </p>
                <span className="text-[11px] text-slate-400 mt-1 block">For {currentConfig.quantity} configured unit(s)</span>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Equipment Specification</p>
                <div className="mt-1">
                  <span className="px-2.5 py-1 rounded text-sm font-bold bg-amber-100 text-amber-900">
                    {currentConfig.equipment_type}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 mt-1.5 block">
                  {currentConfig.length} × {currentConfig.width_diameter} × {currentConfig.depth} mm
                </span>
              </div>

              <div className="bg-amber-500 rounded-xl p-5 text-slate-950 shadow-md">
                <p className="text-xs font-bold uppercase tracking-wider opacity-90">Final Estimated Price (INR)</p>
                <p className="text-2xl font-black mt-1 tracking-tight">
                  {formatINR(bomMetrics.finalAmount)}
                </p>
                <span className="text-[11px] font-medium opacity-90 mt-1 block">
                  Includes {currentConfig.margin_percent}% margin & {currentConfig.tax_percent}% GST
                </span>
              </div>
            </div>

            {/* Transparent Cost Heads Breakdown Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Transparent Cost Head Breakdown</h3>
                  <p className="text-xs text-slate-500">Itemized calculation from raw material to machining and commercial overheads</p>
                </div>
              </div>

              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">#</th>
                    <th className="py-2.5 px-4">Cost Head Description</th>
                    <th className="py-2.5 px-4">Calculation Basis / Engineering Metric</th>
                    <th className="py-2.5 px-4 text-right">Amount (INR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  <tr>
                    <td className="py-3 px-4 text-slate-400">1</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">Raw Material Cost</td>
                    <td className="py-3 px-4 text-slate-500">Component weights × individual material rates</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                      {formatINR(bomMetrics.totalRawMaterialCost)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 px-4 text-slate-400">2</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">Cutting Charges</td>
                    <td className="py-3 px-4 text-slate-500">Weight-based cutting and preparation costs</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatINR(estimateResult?.cost_breakdown.cutting_cost || 0)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 px-4 text-slate-400">3</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">Machining Charges</td>
                    <td className="py-3 px-4 text-slate-500">Component-specific machining costs</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatINR(estimateResult?.cost_breakdown.machining_cost || 0)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 px-4 text-slate-400">4</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">Fabrication Charges</td>
                    <td className="py-3 px-4 text-slate-500">Material and fabrication-rate based costs</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatINR(estimateResult?.cost_breakdown.fabrication_cost || 0)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 px-4 text-slate-400">5</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">Finishing Charges</td>
                    <td className="py-3 px-4 text-slate-500">Weight-based finishing costs</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatINR(estimateResult?.cost_breakdown.finishing_cost || 0)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 px-4 text-slate-400">6</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">Bought-out Components</td>
                    <td className="py-3 px-4 text-slate-500">Configured purchased components</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatINR(estimateResult?.cost_breakdown.bought_out_cost || 0)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 px-4 text-slate-400">7</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">Actuation Package</td>
                    <td className="py-3 px-4 text-slate-500">Actuator, gearbox and accessories</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatINR(estimateResult?.cost_breakdown.actuation_cost || 0)}
                    </td>
                  </tr>

                  {/* Manufacturing Subtotal */}
                  <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                    <td colSpan={3} className="py-3 px-4 text-slate-900 text-right">
                      Pre-tax Quotation Subtotal:
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-900 text-sm">
                      {formatINR(bomMetrics.subtotal)}
                    </td>
                  </tr>

                  {/* Commercial Controls: Margin & Tax */}
                  <tr className="bg-white">
                    <td colSpan={2} className="py-2.5 px-4 text-slate-700 font-semibold">
                      Approved Engineering Margin ({currentConfig.margin_percent}%):
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">Commercial engineering overhead & margin</td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-800">
                      {formatINR(bomMetrics.marginAmt)}
                    </td>
                  </tr>

                  <tr className="bg-white">
                    <td colSpan={2} className="py-2.5 px-4 text-slate-700 font-semibold">
                      Applicable GST / Taxes ({currentConfig.tax_percent}%):
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">Statutory Indirect Taxes</td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-800">
                      {formatINR(bomMetrics.taxAmt)}
                    </td>
                  </tr>

                  {/* Final Amount */}
                  <tr className="bg-amber-100 font-black border-t-2 border-amber-400">
                    <td colSpan={3} className="py-3.5 px-4 text-slate-950 text-right text-sm">
                      FINAL COMMERCIAL ESTIMATE:
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-base text-slate-950">
                      {formatINR(bomMetrics.finalAmount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setActiveTab('bom_editor')}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to Component BOM
              </button>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => handleSaveQuotation('Draft')}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg text-xs"
                >
                  Save as Draft
                </button>

                <button
                  onClick={() => handleSaveQuotation('Validated')}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow-sm"
                >
                  <FileText className="h-4 w-4" />
                  <span>Generate & Review Quotation</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: QUOTATION PREVIEW & PDF DOWNLOAD */}
        {activeTab === 'preview' && savedQuoteDetail && (
          <div className="p-6 max-w-4xl mx-auto w-full space-y-6">
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center space-x-3">
                <div className="h-9 w-9 bg-emerald-100 text-emerald-800 rounded-lg flex items-center justify-center font-bold">
                  ✓
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {savedQuoteDetail.quote_number} (Rev R{savedQuoteDetail.revision})
                  </h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    savedQuoteDetail.status === 'Issued' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    Status: {savedQuoteDetail.status}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <a
                  href={getQuotationPdfUrl(savedQuoteDetail.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-4 py-2 rounded-lg flex items-center space-x-1.5 shadow-sm"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Quotation PDF</span>
                </a>

                {savedQuoteDetail.status !== 'Issued' && (
                  <button
                    onClick={handleIssueCurrentQuote}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center space-x-1.5 shadow-sm"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Issue Official Quote</span>
                  </button>
                )}
              </div>
            </div>

            {/* Document Preview Card */}
            <div className="bg-white rounded-xl border border-slate-300 shadow-md p-8 space-y-6 text-slate-800">
              <div className="flex justify-between items-start border-b-2 border-amber-500 pb-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">INDUSTRIAL FLOW & DAMPER TECHNOLOGIES</h2>
                  <p className="text-xs text-slate-500">Engineering Solutions & Flow Control Systems</p>
                  <p className="text-xs text-slate-400">Chennai Industrial Area Phase II, India</p>
                </div>
                <div className="text-right">
                  <h3 className="text-sm font-bold text-slate-900">TECHNICAL & COMMERCIAL QUOTATION</h3>
                  <p className="text-xs font-mono font-semibold text-amber-600 mt-1">{savedQuoteDetail.quote_number}</p>
                  <p className="text-xs text-slate-500">Revision: R{savedQuoteDetail.revision} | Date: {new Date(savedQuoteDetail.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Client & Equipment Summary */}
              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <h4 className="font-bold text-slate-900 uppercase text-[10px] mb-1">Customer / Project</h4>
                  <p className="font-semibold text-slate-800">{savedQuoteDetail.customer_name}</p>
                  <p className="text-slate-500">RFQ: {savedQuoteDetail.rfq_number || 'N/A'}</p>
                  <p className="text-slate-500">Project: {savedQuoteDetail.project_name || 'N/A'}</p>
                  <p className="text-slate-500">Location: {savedQuoteDetail.delivery_location || 'N/A'}</p>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 uppercase text-[10px] mb-1">Equipment Details</h4>
                  <p className="font-bold text-slate-900">{savedQuoteDetail.equipment_type} ({savedQuoteDetail.quantity} Unit)</p>
                  <p className="text-slate-600 font-mono">Dimensions: {savedQuoteDetail.length} × {savedQuoteDetail.width_diameter} × {savedQuoteDetail.depth} mm</p>
                  <p className="text-slate-600 font-mono">Total Weight: {savedQuoteDetail.total_weight_kg.toFixed(2)} kg</p>
                  <p className="text-slate-600">Actuation: {savedQuoteDetail.actuation_type}</p>
                </div>
              </div>

              {/* Saved Components Table */}
              <div>
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2">Itemized Bill of Materials</h4>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-white font-semibold text-[11px]">
                      <tr>
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Component Description</th>
                        <th className="py-2 px-3">Material Grade</th>
                        <th className="py-2 px-2 text-center">Qty</th>
                        <th className="py-2 px-3 text-right">Unit Wt (kg)</th>
                        <th className="py-2 px-3 text-right">Rate (₹/kg)</th>
                        <th className="py-2 px-3 text-right">Machining (₹)</th>
                        <th className="py-2 px-3 text-right">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {(savedQuoteDetail.bom_items || []).map((item, idx) => {
                        const raw = (item.quantity || 1) * (item.unit_weight || 0) * (item.unit_material_rate || getMaterialRate(item.material_grade, materials));
                        const tot = raw + (item.machining_cost || 0);
                        return (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                            <td className="py-2 px-3 font-semibold text-slate-900">{item.part_name}</td>
                            <td className="py-2 px-3 text-slate-700">{item.material_grade}</td>
                            <td className="py-2 px-2 text-center font-bold">{item.quantity}</td>
                            <td className="py-2 px-3 text-right font-mono">{item.unit_weight?.toFixed(2)}</td>
                            <td className="py-2 px-3 text-right font-mono">₹{item.unit_material_rate || getMaterialRate(item.material_grade, materials)}</td>
                            <td className="py-2 px-3 text-right font-mono">{formatINR(item.machining_cost || 0)}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{formatINR(tot)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Commercial Total */}
              <div className="flex justify-end pt-2">
                <div className="w-72 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-1 text-slate-800">
                  <div className="flex justify-between">
                    <span>Manufacturing Subtotal:</span>
                    <span className="font-mono font-semibold">{formatINR(savedQuoteDetail.cost_breakdown.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Margin ({savedQuoteDetail.cost_breakdown.margin_percent}%):</span>
                    <span className="font-mono">{formatINR(savedQuoteDetail.cost_breakdown.margin_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>GST ({savedQuoteDetail.cost_breakdown.tax_percent}%):</span>
                    <span className="font-mono">{formatINR(savedQuoteDetail.cost_breakdown.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-amber-300 pt-1.5 font-bold text-sm text-slate-950">
                    <span>Quotation Total:</span>
                    <span className="font-mono">{formatINR(savedQuoteDetail.cost_breakdown.final_amount)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: SAVED QUOTATIONS LIST */}
        {activeTab === 'saved' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Saved Quotations Repository</h2>
                <p className="text-xs text-slate-500">Access, duplicate, and download formal technical PDFs.</p>
              </div>
              <button
                onClick={refreshQuotations}
                className="p-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 flex items-center space-x-1.5 text-xs font-semibold"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Refresh</span>
              </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Quote No</th>
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4">Equipment Type</th>
                    <th className="py-3 px-4">Created Date</th>
                    <th className="py-3 px-4">Size Class</th>
                    <th className="py-3 px-4">Weight (kg)</th>
                    <th className="py-3 px-4">Estimated Value</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {quotations.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{q.quote_number}</td>
                      <td className="py-3 px-4 text-slate-800">{q.customer_name}</td>
                      <td className="py-3 px-4 text-slate-700">{q.equipment_type}</td>
                      <td className="py-3 px-4 text-slate-500">{new Date(q.created_at).toLocaleDateString()}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {q.size_category}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">{q.total_weight_kg.toFixed(1)} kg</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{formatINR(q.final_amount)}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          q.status === 'Issued' ? 'bg-emerald-100 text-emerald-800' :
                          q.status === 'Validated' ? 'bg-blue-100 text-blue-800' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {q.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1">
                        <button
                          onClick={() => handleLoadSavedQuote(q.id)}
                          className="p-1 hover:bg-slate-100 rounded text-slate-700"
                          title="View Quotation"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDuplicateQuote(q.id)}
                          className="p-1 hover:bg-slate-100 rounded text-slate-700"
                          title="Duplicate"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleRecalculateCurrentRates(q.id)}
                          className="p-1 hover:bg-slate-100 rounded text-slate-700"
                          title="Recalculate with latest DB rates"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <a
                          href={getQuotationPdfUrl(q.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block p-1 hover:bg-amber-100 text-amber-700 rounded"
                          title="Download PDF"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 7: PRICING & MATERIAL ADMINISTRATION */}
        {activeTab === 'admin' && (
          <div className="p-6 max-w-5xl mx-auto w-full space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-slate-200 gap-2">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Material & Pricing Administration</h2>
                <p className="text-xs text-slate-500">
                  Maintain centralized material rates, densities, processing rates, and audit logs.
                </p>
              </div>
              <span className="bg-amber-100 text-amber-900 text-xs font-semibold px-3 py-1 rounded-full border border-amber-200">
                Configurable Estimates (Verify against supplier quotes)
              </span>
            </div>

            {/* 1. Raw Materials Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Central Material Database</h3>
                  <p className="text-xs text-slate-500">Material grades, densities, rates in ₹/kg, and fabrication multipliers</p>
                </div>
              </div>

              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Material Grade</th>
                    <th className="py-2.5 px-4">Density (kg/mm³)</th>
                    <th className="py-2.5 px-4">Raw Rate (₹/kg)</th>
                    <th className="py-2.5 px-4">Fab Multiplier</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {materials.map((m) => (
                    <tr key={m.name} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-bold text-slate-900">{m.name}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">
                        <input
                          type="number"
                          step="0.00000001"
                          value={m.density}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setMaterials(prev => prev.map(item => item.name === m.name ? { ...item, density: val } : item));
                          }}
                          className="w-32 border border-slate-200 rounded px-2 py-1 font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-4 font-mono">
                        <input
                          type="number"
                          value={m.raw_rate}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setMaterials(prev => prev.map(item => item.name === m.name ? { ...item, raw_rate: val } : item));
                          }}
                          className="w-24 border border-slate-200 rounded px-2 py-1 font-mono text-xs font-bold text-slate-900"
                        />
                      </td>
                      <td className="py-2.5 px-4 font-mono">
                        <input
                          type="number"
                          step="0.05"
                          value={m.fab_multiplier}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setMaterials(prev => prev.map(item => item.name === m.name ? { ...item, fab_multiplier: val } : item));
                          }}
                          className="w-20 border border-slate-200 rounded px-2 py-1 font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={async () => {
                            if (!m.id) return;
                            try {
                              await updateMaterial(m.id, {
                                density: m.density,
                                raw_rate: m.raw_rate,
                                fab_multiplier: m.fab_multiplier
                              });
                              showToast(`Updated material ${m.name} to ₹${m.raw_rate}/kg.`);
                              loadAdminData();
                            } catch (err: any) {
                              showToast(err.message, true);
                            }
                          }}
                          className="bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold px-3 py-1 rounded text-xs border border-amber-200"
                        >
                          Save Rate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Material Rate Audit Log */}
            {materialAudits.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-3">
                <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
                  <History className="h-4 w-4 text-slate-600" />
                  <h3 className="font-bold text-slate-900 text-sm">Material Rate Audit Log</h3>
                </div>
                <div className="overflow-x-auto max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0">
                      <tr>
                        <th className="py-1.5 px-3">Material Grade</th>
                        <th className="py-1.5 px-3">Previous Rate</th>
                        <th className="py-1.5 px-3">New Rate</th>
                        <th className="py-1.5 px-3">Changed At</th>
                        <th className="py-1.5 px-3">Author</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {materialAudits.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3 font-semibold text-slate-900 font-sans">{a.material_name}</td>
                          <td className="py-1.5 px-3 text-slate-500">₹{a.previous_rate}</td>
                          <td className="py-1.5 px-3 font-bold text-amber-700">₹{a.new_rate}</td>
                          <td className="py-1.5 px-3 text-slate-500">{new Date(a.changed_at).toLocaleString()}</td>
                          <td className="py-1.5 px-3 text-slate-600 font-sans">{a.changed_by}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
