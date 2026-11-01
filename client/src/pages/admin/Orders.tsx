import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ShoppingCart, Clock, CheckCircle, XCircle, Package, Truck, MapPin, DollarSign, Link2, Bell } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import ProtectedAdminRoute from '@/components/admin/ProtectedAdminRoute';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  in_production: 'bg-violet-100 text-violet-800',
  ready_for_pickup: 'bg-green-100 text-green-800',
  out_for_delivery: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-800',
};

const orderStatuses = ['pending', 'approved', 'in_production', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled'];

const formatStatus = (s: string) => s ? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Unknown';

export default function AdminOrders() {
  const [location] = useLocation();
  const [activeTab, setActiveTab] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [statusDialogOrder, setStatusDialogOrder] = useState<any>(null);
  const [newStatus, setNewStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [paymentLinkDialogOrder, setPaymentLinkDialogOrder] = useState<any>(null);
  const [depositPercent, setDepositPercent] = useState('25');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const token = localStorage.getItem('adminToken');

  // Prefer window search — wouter's location often omits ?query.
  const deepLinkId = (() => {
    const fromWindow = typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '';
    const fromLocation = location.includes('?') ? location.split('?')[1] : '';
    const params = new URLSearchParams(fromWindow || fromLocation);
    const id = Number(params.get('id') || params.get('order'));
    return Number.isFinite(id) && id > 0 ? id : null;
  })();

  const { data: orders, isLoading } = useQuery({
    queryKey: ['adminOrders', activeTab],
    queryFn: async () => {
      const url = activeTab === 'all' ? '/api/admin/orders' : `/api/admin/orders?status=${activeTab}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const { data: deepLinkOrder } = useQuery({
    queryKey: ['adminOrderDetail', 'deeplink', deepLinkId],
    queryFn: async () => {
      if (!deepLinkId) return null;
      const res = await fetch(`/api/admin/orders/${deepLinkId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: !!deepLinkId && !!token && !selectedOrder,
  });

  useEffect(() => {
    if (!deepLinkId || selectedOrder) return;
    if (deepLinkOrder?.id) {
      setSelectedOrder(deepLinkOrder);
      return;
    }
    const match = Array.isArray(orders) ? orders.find((order: any) => Number(order.id) === deepLinkId) : null;
    if (match) setSelectedOrder(match);
  }, [deepLinkId, deepLinkOrder, orders, selectedOrder]);

  const closeOrderDetail = () => {
    setSelectedOrder(null);
    if (typeof window !== 'undefined' && (window.location.search.includes('id=') || window.location.search.includes('order='))) {
      window.history.replaceState({}, '', '/admin/orders');
    }
  };

  const { data: orderDetail } = useQuery({
    queryKey: ['adminOrderDetail', selectedOrder?.id],
    queryFn: async () => {
      if (!selectedOrder) return null;
      const res = await fetch(`/api/admin/orders/${selectedOrder.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: !!selectedOrder,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ orderId, status, notes }: { orderId: number; status: string; notes: string }) => {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['adminOrders'] });
      queryClient.invalidateQueries({ queryKey: ['adminOrderDetail'] });
      toast({ title: 'Order status updated', description: data.notification_sent ? 'Customer notified' : undefined });
      setStatusDialogOrder(null);
      setNewStatus('');
      setStatusNotes('');
    },
  });

  const paymentLinkMutation = useMutation({
    mutationFn: async ({ orderId, depositPercent }: { orderId: number; depositPercent: number }) => {
      const res = await fetch(`/api/admin/orders/${orderId}/payment-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deposit_percent: depositPercent }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['adminOrders'] });
      queryClient.invalidateQueries({ queryKey: ['adminOrderDetail'] });
      toast({ title: 'Payment link sent', description: `Deposit: $${data.deposit_amount}` });
      setPaymentLinkDialogOrder(null);
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    },
  });

  return (
    <ProtectedAdminRoute>
      <AdminLayout>
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">Orders</h1>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
              <div className="bg-white shadow-sm rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Deposit</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8">Loading...</TableCell></TableRow>
                    ) : !orders?.length ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-500">No orders found</TableCell></TableRow>
                    ) : (
                      orders.map((order: any) => (
                        <TableRow key={order.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setSelectedOrder(order)}>
                          <TableCell className="font-mono text-sm font-medium">
                            #{order.order_number?.slice(0, 8) || order.id}
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-sm">{order.business_name || order.customer_name || 'Guest'}</p>
                            <p className="text-xs text-gray-500">{order.customer_email || order.email}</p>
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1 text-xs text-gray-600">
                              {order.fulfillment_type === 'delivery' ? <Truck className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                              {order.fulfillment_type === 'delivery' ? 'Delivery' : 'Pickup'}
                            </span>
                          </TableCell>
                          <TableCell className="font-semibold">${order.total || 0}</TableCell>
                          <TableCell>
                            {order.deposit_paid ? (
                              <Badge className="bg-green-100 text-green-800 text-[10px]">
                                <DollarSign className="h-3 w-3 mr-0.5" />Paid
                              </Badge>
                            ) : order.deposit_amount ? (
                              <Badge className="bg-amber-100 text-amber-800 text-[10px]">
                                <Clock className="h-3 w-3 mr-0.5" />${order.deposit_amount}
                              </Badge>
                            ) : (
                              <span className="text-xs text-gray-400">--</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={`${statusColors[order.status] || 'bg-gray-100'} text-xs`}>
                              {formatStatus(order.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={(e) => { e.stopPropagation(); setStatusDialogOrder(order); setNewStatus(order.status); }}>
                                Status
                              </Button>
                              {!order.deposit_paid && order.total > 0 && (
                                <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={(e) => { e.stopPropagation(); setPaymentLinkDialogOrder(order); }}>
                                  <Link2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Order Detail Dialog */}
        <Dialog open={!!selectedOrder} onOpenChange={(open) => { if (!open) closeOrderDetail(); }}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Order #{selectedOrder?.order_number?.slice(0, 8) || selectedOrder?.id}</DialogTitle>
            </DialogHeader>
            {orderDetail && (
              <div className="space-y-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <Badge className={statusColors[orderDetail.status] || ''}>{formatStatus(orderDetail.status)}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-medium">{orderDetail.business_name || orderDetail.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Email</span>
                  <span>{orderDetail.customer_email || orderDetail.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Fulfillment</span>
                  <span className="capitalize">{orderDetail.fulfillment_type || orderDetail.delivery_type}</span>
                </div>
                {orderDetail.preferred_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Preferred Date</span>
                    <span>{new Date(orderDetail.preferred_date + 'T12:00:00').toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-base">
                  <span>Total</span>
                  <span>${orderDetail.total}</span>
                </div>

                {/* Deposit Info */}
                {(orderDetail.deposit_amount || orderDetail.deposit_paid) && (
                  <div className={`rounded-lg p-3 ${orderDetail.deposit_paid ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Deposit</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">${orderDetail.deposit_amount}</span>
                        {orderDetail.deposit_paid ? (
                          <Badge className="bg-green-100 text-green-800 text-[10px]">Paid</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 text-[10px]">Pending</Badge>
                        )}
                      </div>
                    </div>
                    {orderDetail.deposit_paid_at && (
                      <p className="text-xs text-gray-500 mt-1">Paid on {new Date(orderDetail.deposit_paid_at).toLocaleString()}</p>
                    )}
                  </div>
                )}

                {orderDetail.items?.length > 0 && (
                  <div>
                    <p className="font-semibold mb-2">Items</p>
                    {orderDetail.items.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between py-1 border-b last:border-0">
                        <span>{item.format || item.size_option} x{item.quantity}</span>
                        <span>${item.total_price}</span>
                      </div>
                    ))}
                  </div>
                )}

                {orderDetail.special_instructions && (
                  <div>
                    <p className="font-semibold mb-1">Notes</p>
                    <p className="text-gray-600 bg-gray-50 rounded p-2">{orderDetail.special_instructions}</p>
                  </div>
                )}

                {orderDetail.status_history?.length > 0 && (
                  <div>
                    <p className="font-semibold mb-2">Status History</p>
                    {orderDetail.status_history.map((h: any, i: number) => (
                      <div key={i} className="flex justify-between py-1 text-xs">
                        <span>{formatStatus(h.new_status || h.status)}</span>
                        <span className="text-gray-400">{new Date(h.created_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => { setStatusDialogOrder(selectedOrder); setNewStatus(orderDetail.status); closeOrderDetail(); }}>
                    Update Status
                  </Button>
                  {!orderDetail.deposit_paid && orderDetail.total > 0 && (
                    <Button variant="outline" onClick={() => { setPaymentLinkDialogOrder(selectedOrder); closeOrderDetail(); }}>
                      <Link2 className="h-4 w-4 mr-1" /> Send Payment Link
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Status Update Dialog */}
        <Dialog open={!!statusDialogOrder} onOpenChange={() => setStatusDialogOrder(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Update Order Status</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Order #{statusDialogOrder?.order_number?.slice(0, 8) || statusDialogOrder?.id}</p>
              <div>
                <Label>New Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {orderStatuses.map(s => (
                      <SelectItem key={s} value={s}>{formatStatus(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea value={statusNotes} onChange={e => setStatusNotes(e.target.value)} placeholder="e.g. Ready by 3 PM tomorrow" />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Bell className="h-3 w-3" /> Customer will be notified by email when status changes to approved, ready, out for delivery, or completed.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStatusDialogOrder(null)}>Cancel</Button>
              <Button onClick={() => statusDialogOrder && statusMutation.mutate({ orderId: statusDialogOrder.id, status: newStatus, notes: statusNotes })} disabled={statusMutation.isPending}>
                {statusMutation.isPending ? 'Updating...' : 'Update Status'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Payment Link Dialog */}
        <Dialog open={!!paymentLinkDialogOrder} onOpenChange={() => setPaymentLinkDialogOrder(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Send Payment Link</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Order #{paymentLinkDialogOrder?.order_number?.slice(0, 8) || paymentLinkDialogOrder?.id} - Total: ${paymentLinkDialogOrder?.total}
              </p>
              <div>
                <Label>Deposit Percentage</Label>
                <Select value={depositPercent} onValueChange={setDepositPercent}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25% (${Math.max(100, Math.round((paymentLinkDialogOrder?.total || 0) * 0.25))})</SelectItem>
                    <SelectItem value="50">50% (${Math.max(100, Math.round((paymentLinkDialogOrder?.total || 0) * 0.50))})</SelectItem>
                    <SelectItem value="100">100% (${paymentLinkDialogOrder?.total || 0})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                A Stripe payment link will be created and emailed to the customer. Minimum deposit: $100.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPaymentLinkDialogOrder(null)}>Cancel</Button>
              <Button
                onClick={() => paymentLinkDialogOrder && paymentLinkMutation.mutate({ orderId: paymentLinkDialogOrder.id, depositPercent: parseInt(depositPercent) })}
                disabled={paymentLinkMutation.isPending}
              >
                {paymentLinkMutation.isPending ? 'Creating...' : 'Send Payment Link'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </ProtectedAdminRoute>
  );
}
