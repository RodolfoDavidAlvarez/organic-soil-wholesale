import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Search, Plus, ExternalLink, FileText, Package, Calendar, DollarSign, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import OperationsLayout from '@/components/admin/OperationsLayout';
import ProtectedAdminRoute from '@/components/admin/ProtectedAdminRoute';
import { format } from 'date-fns';

interface Order {
  id: number;
  order_number: string;
  status: string;
  total_amount: number;
  created_at: string;
  customer_name: string;
  customer_email: string;
  shipping_address: string;
  shipping_city: string;
  shipping_state: string;
  shipping_zip: string;
  items: OrderItem[];
}

interface OrderItem {
  id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export default function OperationsOrders() {
  const [, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Fetch orders from the existing orders endpoint
  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ['operations-orders', statusFilter],
    queryFn: async () => {
      const token = localStorage.getItem('adminToken');
      const url = statusFilter !== 'all'
        ? `/api/admin/orders?status=${statusFilter}`
        : '/api/admin/orders';
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch orders');
      return response.json();
    }
  });

  const filteredOrders = orders?.filter(order => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      order.order_number?.toLowerCase().includes(search) ||
      order.customer_name?.toLowerCase().includes(search) ||
      order.customer_email?.toLowerCase().includes(search) ||
      order.shipping_city?.toLowerCase().includes(search)
    );
  }) || [];

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
      pending: { variant: "secondary", label: "Pending" },
      processing: { variant: "default", label: "Processing" },
      shipped: { variant: "outline", label: "Shipped" },
      delivered: { variant: "outline", label: "Delivered" },
      cancelled: { variant: "destructive", label: "Cancelled" }
    };
    const { variant, label } = config[status] || { variant: "secondary", label: status };
    return <Badge variant={variant} className="text-xs">{label}</Badge>;
  };

  const handleCreateBOL = (order: Order) => {
    // Navigate to CreateBOL with order data pre-filled via URL params
    const params = new URLSearchParams({
      orderId: String(order.id),
      customerName: order.customer_name || '',
      destinationAddress: order.shipping_address || '',
      destinationCity: order.shipping_city || '',
      destinationState: order.shipping_state || 'AZ',
      destinationZip: order.shipping_zip || '',
      referenceNumber: order.order_number || ''
    });
    navigate(`/admin/operations/bols/new?${params.toString()}`);
  };

  return (
    <ProtectedAdminRoute>
      <OperationsLayout>
        <div className="p-4 md:p-6 space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">Customer Orders</h1>
              <p className="text-sm text-gray-500">View orders and create BOLs for fulfillment</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Orders Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">Loading orders...</div>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <Package className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Orders Found</h3>
              <p className="text-sm text-gray-500">
                {searchTerm ? 'Try adjusting your search terms' : 'No orders match the current filter'}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Destination</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="text-sm font-mono font-medium text-gray-900">
                            {order.order_number || `#${order.id}`}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{order.customer_name}</div>
                          <div className="text-xs text-gray-500">{order.customer_email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900">{order.shipping_city}, {order.shipping_state}</div>
                          <div className="text-xs text-gray-500 truncate max-w-[200px]">{order.shipping_address}</div>
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(order.status)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">
                            ${(order.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-500">
                            {format(new Date(order.created_at), 'MMM dd, yyyy')}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/admin/orders?id=${order.id}`)}
                              className="h-8 text-xs"
                            >
                              <ExternalLink className="w-3.5 h-3.5 mr-1" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleCreateBOL(order)}
                              className="h-8 text-xs bg-[#264027] hover:bg-[#3c5233]"
                            >
                              <FileText className="w-3.5 h-3.5 mr-1" />
                              Create BOL
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Summary */}
          {filteredOrders.length > 0 && (
            <div className="flex items-center justify-between text-sm text-gray-500 pt-2">
              <span>Showing {filteredOrders.length} orders</span>
              <span>
                Total: ${filteredOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>
      </OperationsLayout>
    </ProtectedAdminRoute>
  );
}
