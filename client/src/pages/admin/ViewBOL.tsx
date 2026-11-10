import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Printer, Mail, FileText, Truck, MapPin, Package, Scale, FileIcon, X, Maximize2, Pencil, Send, CheckCircle, Copy, ShieldCheck, Link, DollarSign, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import OperationsLayout from '@/components/admin/OperationsLayout';
import ProtectedAdminRoute from '@/components/admin/ProtectedAdminRoute';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { sswFrom } from '@shared/sswEmailFrom.js';

interface BOLDetails {
  id: number;
  bol_number: string;
  date: string;
  origin_location: string;
  origin_address: string;
  origin_city: string;
  origin_state: string;
  origin_zip: string;
  customer_name: string;
  destination_address: string;
  destination_city: string;
  destination_state: string;
  destination_zip: string;
  onsite_contact_name: string;
  onsite_contact_phone: string;
  material_type: string;
  material_description: string;
  gross_weight: number;
  tare_weight: number;
  net_weight: number;
  net_weight_tons: string;
  carrier_name: string;
  driver_name: string;
  truck_number: string;
  license_plate: string;
  trailer_number: string;
  notes: string;
  reference_number: string;
  status: string;
  load_type: string;
  client_tag: string;
  created_at: string;
  created_by: string;
  sent_to_email?: string;
  sent_at?: string;
  billing_status: string;
  invoice_id?: string;
  invoice_number?: string;
  invoice_amount?: number;
  invoice_date?: string;
  billing_notes?: string;
}

const STATUS_FLOW = ['draft', 'completed', 'delivered'] as const;
type BOLStatus = typeof STATUS_FLOW[number];

export default function ViewBOL() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pdfFullscreen, setPdfFullscreen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({
    recipientEmail: '',
    recipientName: '',
    customMessage: ''
  });
  const [editingClientTag, setEditingClientTag] = useState(false);
  const [billingDialogOpen, setBillingDialogOpen] = useState(false);
  const [billingForm, setBillingForm] = useState({
    invoiceNumber: '',
    invoiceAmount: '',
    invoiceDate: '',
    billingNotes: ''
  });

  const token = localStorage.getItem('adminToken');
  const pdfUrl = `/api/admin/operations/bols/${id}/pdf?token=${token}`;

  const { data: bol, isLoading } = useQuery<BOLDetails>({
    queryKey: ['bol', id],
    queryFn: async () => {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/admin/operations/bols/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch BOL');
      return response.json();
    }
  });

  // Fetch linked CODs for this BOL
  const { data: linkedCODs } = useQuery<Array<{ id: number; cod_number: string; date_received: string; status: string; received_from: string }>>({
    queryKey: ['bol-cods', id],
    queryFn: async () => {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/admin/operations/bols/${id}/cods`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!id
  });

  // Status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/admin/operations/bols/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (!response.ok) throw new Error('Failed to update status');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bol', id] });
      queryClient.invalidateQueries({ queryKey: ['bols'] });
      toast({
        title: 'Status Updated',
        description: 'BOL status has been updated successfully.'
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Email mutation
  const sendEmailMutation = useMutation({
    mutationFn: async (data: typeof emailForm) => {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/admin/operations/bols/${id}/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send email');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bol', id] });
      setEmailDialogOpen(false);
      setEmailForm({ recipientEmail: '', recipientName: '', customMessage: '' });
      toast({
        title: 'Email Sent',
        description: `BOL sent successfully to ${data.sentTo}`
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const updateClientTagMutation = useMutation({
    mutationFn: async (newTag: string) => {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/admin/operations/bols/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ client_tag: newTag })
      });
      if (!response.ok) throw new Error('Failed to update client tag');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bol', id] });
      queryClient.invalidateQueries({ queryKey: ['bols'] });
      setEditingClientTag(false);
      toast({ title: 'Updated', description: 'Client tag updated successfully.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  // Billing mutation
  const updateBillingMutation = useMutation({
    mutationFn: async (data: { billingStatus: string; invoiceNumber?: string; invoiceAmount?: number; invoiceDate?: string; billingNotes?: string }) => {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/admin/operations/bols/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update billing');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bol', id] });
      queryClient.invalidateQueries({ queryKey: ['bols'] });
      setBillingDialogOpen(false);
      toast({ title: 'Billing Updated', description: 'Billing status has been updated.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const handleMarkBilled = (e: React.FormEvent) => {
    e.preventDefault();
    updateBillingMutation.mutate({
      billingStatus: 'billed',
      invoiceNumber: billingForm.invoiceNumber || undefined,
      invoiceAmount: billingForm.invoiceAmount ? parseFloat(billingForm.invoiceAmount) : undefined,
      invoiceDate: billingForm.invoiceDate || undefined,
      billingNotes: billingForm.billingNotes || undefined
    });
  };

  const handleMarkUnbilled = () => {
    updateBillingMutation.mutate({ billingStatus: 'unbilled' });
  };

  const handlePrint = () => {
    window.open(pdfUrl, '_blank');
  };

  const handleEmail = () => {
    // Pre-fill with customer name from BOL data
    setEmailForm(prev => ({
      ...prev,
      recipientName: bol?.customer_name || '',
      customMessage: ''
    }));
    setEmailDialogOpen(true);
  };

  const handleSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailForm.recipientEmail) {
      toast({
        title: 'Error',
        description: 'Please enter a recipient email address.',
        variant: 'destructive'
      });
      return;
    }
    sendEmailMutation.mutate(emailForm);
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", color: string, label: string }> = {
      draft: { variant: "secondary", color: "text-gray-600", label: "Draft" },
      completed: { variant: "default", color: "text-green-600", label: "Ready" },
      delivered: { variant: "outline", color: "text-blue-600", label: "Delivered" }
    };
    const { variant, color, label } = config[status] || { variant: "secondary", color: "text-gray-600", label: status };
    return <Badge variant={variant} className={`${color} text-xs font-mono uppercase tracking-wider`}>{label}</Badge>;
  };

  const getNextStatus = (currentStatus: string): BOLStatus | null => {
    const currentIndex = STATUS_FLOW.indexOf(currentStatus as BOLStatus);
    if (currentIndex < STATUS_FLOW.length - 1) {
      return STATUS_FLOW[currentIndex + 1];
    }
    return null;
  };

  const getStatusButtonLabel = (status: BOLStatus): string => {
    const labels: Record<BOLStatus, string> = {
      draft: 'Mark as Ready',
      completed: 'Mark as Delivered',
      delivered: 'Completed'
    };
    return labels[status] || status;
  };

  if (isLoading) {
    return (
      <ProtectedAdminRoute>
        <OperationsLayout>
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-gray-500">Loading BOL details...</div>
          </div>
        </OperationsLayout>
      </ProtectedAdminRoute>
    );
  }

  if (!bol) {
    return (
      <ProtectedAdminRoute>
        <OperationsLayout>
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-gray-500">BOL not found</div>
          </div>
        </OperationsLayout>
      </ProtectedAdminRoute>
    );
  }

  const nextStatus = getNextStatus(bol.status);

  return (
    <ProtectedAdminRoute>
      <OperationsLayout>
        <div className="min-h-screen bg-gray-50 p-3 md:p-4">
          {/* Header */}
          <div className="max-w-7xl mx-auto mb-3">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => navigate('/admin/operations')}
                className="text-xs text-gray-600 hover:text-[#264027] h-8 -ml-2"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => navigate(`/admin/operations/bols/${id}/edit`)}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                >
                  <Pencil className="w-3.5 h-3.5 mr-1" />
                  Edit
                </Button>
                <Button
                  onClick={() => navigate(`/admin/operations/bols/new?duplicate=${id}`)}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                >
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Duplicate
                </Button>
                <Button
                  onClick={handlePrint}
                  size="sm"
                  className="bg-[#264027] hover:bg-[#3c5233] h-8 text-xs"
                >
                  <Printer className="w-3.5 h-3.5 mr-1" />
                  Print
                </Button>
                <Button
                  onClick={handleEmail}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                >
                  <Mail className="w-3.5 h-3.5 mr-1" />
                  Email
                </Button>
              </div>
            </div>
          </div>

          {/* Main Content - Two Column Layout */}
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-4">
            {/* PDF Preview - Left Side */}
            <div className="lg:w-1/2 xl:w-2/5">
              <div className="bg-white rounded-md border border-gray-200 overflow-hidden sticky top-4">
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <FileIcon className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-xs font-medium text-gray-700">{bol.bol_number}.pdf</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPdfFullscreen(true)}
                      className="p-1 rounded hover:bg-gray-200 text-gray-500"
                      title="Fullscreen"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handlePrint}
                      className="p-1 rounded hover:bg-gray-200 text-gray-500"
                      title="Open in new tab"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="bg-gray-100">
                  <iframe
                    src={pdfUrl}
                    className="w-full h-[600px] lg:h-[calc(100vh-180px)]"
                    title="BOL PDF Preview"
                  />
                </div>
              </div>
            </div>

            {/* Details - Right Side */}
            <div className="lg:w-1/2 xl:w-3/5 space-y-3">
              {/* Title Card with Status */}
              <div className="bg-white rounded-md border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-bold font-mono text-[#264027]">{bol.bol_number}</h1>
                    {getStatusBadge(bol.status)}
                    {(bol.billing_status || 'unbilled') === 'billed' ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200">
                        <DollarSign className="w-2.5 h-2.5" /> BILLED
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200">
                        UNBILLED
                      </span>
                    )}
                    {bol.load_type && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide ${
                        bol.load_type === 'Inbound' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        bol.load_type === 'Outbound' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        'bg-gray-100 text-gray-600 border border-gray-200'
                      }`}>
                        {bol.load_type === 'Inbound' ? 'INBOUND' : bol.load_type === 'Outbound' ? 'OUTBOUND' : bol.load_type.toUpperCase()}
                      </span>
                    )}
                    {editingClientTag ? (
                      <div className="relative">
                        <select
                          autoFocus
                          className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#264027]"
                          value={bol.client_tag || ''}
                          onChange={(e) => updateClientTagMutation.mutate(e.target.value)}
                          onBlur={() => setEditingClientTag(false)}
                        >
                          <option value="">No Tag</option>
                          <option value="vanguard">Vanguard</option>
                          <option value="willcox">Willcox</option>
                          <option value="3lag">3LAG</option>
                          <option value="flower_gods">Flower of Gods</option>
                        </select>
                      </div>
                    ) : (
                      <span
                        onClick={() => setEditingClientTag(true)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors ${
                          bol.client_tag === 'vanguard' ? 'bg-purple-50 text-purple-700 hover:bg-purple-100' :
                          bol.client_tag === 'willcox' ? 'bg-orange-50 text-orange-700 hover:bg-orange-100' :
                          bol.client_tag === '3lag' ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' :
                          bol.client_tag === 'flower_gods' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' :
                          'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                        title="Click to change client tag"
                      >
                        {bol.client_tag ? (
                          bol.client_tag === 'vanguard' ? 'Vanguard' :
                          bol.client_tag === 'willcox' ? 'Willcox' :
                          bol.client_tag === '3lag' ? '3LAG' :
                          bol.client_tag === 'flower_gods' ? 'Flower of Gods' :
                          bol.client_tag
                        ) : '+ Add Tag'}
                      </span>
                    )}
                  </div>
                  {nextStatus && (
                    <Button
                      size="sm"
                      onClick={() => updateStatusMutation.mutate(nextStatus)}
                      disabled={updateStatusMutation.isPending}
                      className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1" />
                      {updateStatusMutation.isPending ? 'Updating...' : getStatusButtonLabel(bol.status as BOLStatus)}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Created {format(new Date(bol.created_at), 'MMM dd, yyyy h:mm a')}
                </p>
                {bol.sent_to_email && (
                  <p className="text-xs text-green-600 mt-1">
                    <Mail className="w-3 h-3 inline mr-1" />
                    Sent to {bol.sent_to_email} on {format(new Date(bol.sent_at!), 'MMM dd, yyyy h:mm a')}
                  </p>
                )}
              </div>

              {/* BOL Details */}
              <div className="space-y-3">
                {/* Date & Reference */}
                <div className="bg-white rounded-md border border-gray-200 p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Date</div>
                      <div className="text-sm font-semibold text-gray-900">
                        {format(new Date(bol.date), 'MMM dd, yyyy')}
                      </div>
                    </div>
                    {bol.reference_number && (
                      <div>
                        <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Reference #</div>
                        <div className="text-sm font-mono text-gray-900">{bol.reference_number}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Origin & Destination */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-white rounded-md border border-gray-200 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <MapPin className="w-3.5 h-3.5 text-[#264027]" />
                      <span className="text-xs font-semibold text-gray-700">Origin</span>
                    </div>
                    <div className="text-sm font-medium text-gray-900">{bol.origin_location}</div>
                    <div className="text-xs text-gray-600">{bol.origin_address}</div>
                    <div className="text-xs text-gray-600">
                      {bol.origin_city}, {bol.origin_state} {bol.origin_zip}
                    </div>
                  </div>

                  <div className="bg-white rounded-md border border-gray-200 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <MapPin className="w-3.5 h-3.5 text-[#6f732f]" />
                      <span className="text-xs font-semibold text-gray-700">Destination</span>
                    </div>
                    <div className="text-sm font-medium text-gray-900">{bol.customer_name}</div>
                    <div className="text-xs text-gray-600">{bol.destination_address}</div>
                    <div className="text-xs text-gray-600">
                      {bol.destination_city}, {bol.destination_state} {bol.destination_zip}
                    </div>
                    {bol.onsite_contact_name && (
                      <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-600">
                        Contact: {bol.onsite_contact_name} {bol.onsite_contact_phone && `- ${bol.onsite_contact_phone}`}
                      </div>
                    )}
                  </div>
                </div>

                {/* Material */}
                <div className="bg-white rounded-md border border-gray-200 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Package className="w-3.5 h-3.5 text-[#b38a58]" />
                    <span className="text-xs font-semibold text-gray-700">Material</span>
                  </div>
                  <div className="text-sm font-medium text-gray-900">{bol.material_type}</div>
                  {bol.material_description && (
                    <div className="text-xs text-gray-600 mt-1">{bol.material_description}</div>
                  )}
                </div>

                {/* Weight Information - Only show if weight data exists */}
                {(bol.gross_weight > 0 || bol.tare_weight > 0) && (
                  <div className="bg-gray-900 rounded-md p-3 text-white">
                    <div className="flex items-center gap-1.5 mb-3">
                      <Scale className="w-3.5 h-3.5" />
                      <span className="text-xs font-semibold">Weight</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-white/10 rounded p-2 text-center">
                        <div className="text-[10px] uppercase tracking-wide text-gray-400">Gross</div>
                        <div className="text-base font-bold font-mono">{bol.gross_weight.toLocaleString()}</div>
                        <div className="text-[10px] text-gray-400">lbs</div>
                      </div>
                      <div className="bg-white/10 rounded p-2 text-center">
                        <div className="text-[10px] uppercase tracking-wide text-gray-400">Tare</div>
                        <div className="text-base font-bold font-mono">{bol.tare_weight.toLocaleString()}</div>
                        <div className="text-[10px] text-gray-400">lbs</div>
                      </div>
                      <div className="bg-[#264027] rounded p-2 text-center">
                        <div className="text-[10px] uppercase tracking-wide text-green-300">Net</div>
                        <div className="text-base font-bold font-mono">{bol.net_weight.toLocaleString()}</div>
                        <div className="text-[10px] text-green-300">{bol.net_weight_tons}t</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Carrier Information */}
                <div className="bg-white rounded-md border border-gray-200 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Truck className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-xs font-semibold text-gray-700">Carrier & Transport</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Carrier:</span>
                      <span className="ml-1 text-gray-900">{bol.carrier_name}</span>
                    </div>
                    {bol.driver_name && (
                      <div>
                        <span className="text-gray-500">Driver:</span>
                        <span className="ml-1 text-gray-900">{bol.driver_name}</span>
                      </div>
                    )}
                    {bol.truck_number && (
                      <div>
                        <span className="text-gray-500">Truck #:</span>
                        <span className="ml-1 font-mono text-gray-900">{bol.truck_number}</span>
                      </div>
                    )}
                    {bol.license_plate && (
                      <div>
                        <span className="text-gray-500">Plate:</span>
                        <span className="ml-1 font-mono text-gray-900">{bol.license_plate}</span>
                      </div>
                    )}
                    {bol.trailer_number && (
                      <div>
                        <span className="text-gray-500">Trailer:</span>
                        <span className="ml-1 font-mono text-gray-900">{bol.trailer_number}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {bol.notes && (
                  <div className="bg-yellow-50 rounded-md border border-yellow-200 p-3">
                    <div className="text-[10px] font-semibold text-yellow-700 uppercase tracking-wide mb-1">Notes</div>
                    <div className="text-xs text-gray-700 whitespace-pre-wrap">{bol.notes}</div>
                  </div>
                )}

                {/* Billing Status */}
                <div className={`rounded-md border p-3 ${
                  (bol.billing_status || 'unbilled') === 'billed'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Receipt className="w-3.5 h-3.5 text-gray-600" />
                      <span className="text-xs font-semibold text-gray-700">Billing</span>
                    </div>
                    {(bol.billing_status || 'unbilled') === 'billed' ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-800 border border-green-300">
                          <DollarSign className="w-2.5 h-2.5" /> BILLED
                        </span>
                        <button
                          onClick={handleMarkUnbilled}
                          className="text-[10px] text-gray-400 hover:text-red-500 underline"
                        >
                          Undo
                        </button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => setBillingDialogOpen(true)}
                        className="h-6 text-[10px] bg-amber-600 hover:bg-amber-700"
                      >
                        <DollarSign className="w-3 h-3 mr-0.5" />
                        Mark as Billed
                      </Button>
                    )}
                  </div>
                  {(bol.billing_status || 'unbilled') === 'billed' && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {bol.invoice_number && (
                        <div>
                          <span className="text-gray-500">Invoice #:</span>
                          <span className="ml-1 font-mono font-medium text-gray-900">{bol.invoice_number}</span>
                        </div>
                      )}
                      {bol.invoice_amount && (
                        <div>
                          <span className="text-gray-500">Amount:</span>
                          <span className="ml-1 font-semibold text-gray-900">${bol.invoice_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {bol.invoice_date && (
                        <div>
                          <span className="text-gray-500">Invoice Date:</span>
                          <span className="ml-1 text-gray-900">{format(new Date(bol.invoice_date), 'MMM dd, yyyy')}</span>
                        </div>
                      )}
                      {bol.billing_notes && (
                        <div className="col-span-2">
                          <span className="text-gray-500">Notes:</span>
                          <span className="ml-1 text-gray-700">{bol.billing_notes}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {(bol.billing_status || 'unbilled') === 'unbilled' && (
                    <p className="text-[10px] text-red-600">This weight ticket has not been invoiced yet.</p>
                  )}
                </div>

                {/* Linked CODs */}
                {linkedCODs && linkedCODs.length > 0 && (
                  <div className="bg-white rounded-md border border-gray-200 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />
                      <span className="text-xs font-semibold text-gray-700">Linked CODs</span>
                      <span className="text-[10px] text-gray-400 ml-1">({linkedCODs.length})</span>
                    </div>
                    <div className="space-y-1.5">
                      {linkedCODs.map(cod => (
                        <button
                          key={cod.id}
                          onClick={() => navigate(`/admin/operations/cods/${cod.id}`)}
                          className="w-full flex items-center justify-between p-2 rounded bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <Link className="w-3 h-3 text-gray-400" />
                            <span className="text-xs font-mono font-medium text-purple-700">{cod.cod_number}</span>
                            <span className="text-[10px] text-gray-500">{cod.received_from}</span>
                          </div>
                          <span className="text-[10px] text-gray-400">
                            {format(new Date(cod.date_received), 'MM/dd/yy')}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Fullscreen PDF Modal */}
          {pdfFullscreen && (
            <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
              <div className="flex items-center justify-between p-3 bg-gray-900">
                <span className="text-white text-sm font-medium">{bol.bol_number}.pdf</span>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handlePrint}
                    size="sm"
                    className="h-7 text-xs bg-white text-gray-900 hover:bg-gray-100"
                  >
                    <Printer className="w-3.5 h-3.5 mr-1" />
                    Print
                  </Button>
                  <button
                    onClick={() => setPdfFullscreen(false)}
                    className="p-1.5 rounded hover:bg-gray-800 text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <iframe
                src={pdfUrl}
                className="flex-1 w-full"
                title="BOL PDF Preview Fullscreen"
              />
            </div>
          )}

          {/* Billing Dialog */}
          <Dialog open={billingDialogOpen} onOpenChange={setBillingDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  Mark as Billed
                </DialogTitle>
                <DialogDescription>
                  Link invoice details to <span className="font-mono font-semibold">{bol.bol_number}</span>
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleMarkBilled}>
                <div className="space-y-3 py-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="invoiceNumber" className="text-xs">Invoice Number</Label>
                    <Input
                      id="invoiceNumber"
                      placeholder="e.g., INV-2026-002"
                      value={billingForm.invoiceNumber}
                      onChange={(e) => setBillingForm(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                      className="text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="invoiceAmount" className="text-xs">Amount ($)</Label>
                      <Input
                        id="invoiceAmount"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={billingForm.invoiceAmount}
                        onChange={(e) => setBillingForm(prev => ({ ...prev, invoiceAmount: e.target.value }))}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="invoiceDate" className="text-xs">Invoice Date</Label>
                      <Input
                        id="invoiceDate"
                        type="date"
                        value={billingForm.invoiceDate}
                        onChange={(e) => setBillingForm(prev => ({ ...prev, invoiceDate: e.target.value }))}
                        className="text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="billingNotes" className="text-xs">Notes (optional)</Label>
                    <Textarea
                      id="billingNotes"
                      placeholder="e.g., Included in Feb 2026 batch invoice"
                      value={billingForm.billingNotes}
                      onChange={(e) => setBillingForm(prev => ({ ...prev, billingNotes: e.target.value }))}
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setBillingDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-green-600 hover:bg-green-700"
                    disabled={updateBillingMutation.isPending}
                  >
                    {updateBillingMutation.isPending ? 'Saving...' : 'Mark as Billed'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Email Dialog */}
          <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-[#264027]" />
                  Send BOL via Email
                </DialogTitle>
                <DialogDescription>
                  Send <span className="font-mono font-semibold">{bol.bol_number}</span> as a PDF attachment from <span className="font-medium">{sswFrom('SSW Operations')}</span>
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSendEmail}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="recipientEmail">Recipient Email *</Label>
                    <Input
                      id="recipientEmail"
                      type="email"
                      placeholder="customer@example.com"
                      value={emailForm.recipientEmail}
                      onChange={(e) => setEmailForm(prev => ({ ...prev, recipientEmail: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recipientName">Recipient Name</Label>
                    <Input
                      id="recipientName"
                      placeholder="Used in the greeting (e.g., Hi John)"
                      value={emailForm.recipientName}
                      onChange={(e) => setEmailForm(prev => ({ ...prev, recipientName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customMessage">Custom Message <span className="text-gray-400 font-normal">(optional)</span></Label>
                    <Textarea
                      id="customMessage"
                      placeholder="Leave blank for the default professional message, or type a custom note here"
                      value={emailForm.customMessage}
                      onChange={(e) => setEmailForm(prev => ({ ...prev, customMessage: e.target.value }))}
                      rows={3}
                    />
                  </div>

                  {/* Email Preview */}
                  <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Email Preview</div>
                    <div className="space-y-1 text-xs text-gray-600">
                      <div><span className="text-gray-400">From:</span> {sswFrom('SSW Operations')}</div>
                      <div><span className="text-gray-400">To:</span> {emailForm.recipientEmail || '...'}</div>
                      <div><span className="text-gray-400">Subject:</span> Bill of Lading - {bol.bol_number} | {bol.customer_name}</div>
                      <div><span className="text-gray-400">Attachment:</span> {bol.bol_number}.pdf</div>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEmailDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-[#264027] hover:bg-[#3c5233]"
                    disabled={sendEmailMutation.isPending}
                  >
                    {sendEmailMutation.isPending ? (
                      <>Sending...</>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Email
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </OperationsLayout>
    </ProtectedAdminRoute>
  );
}
