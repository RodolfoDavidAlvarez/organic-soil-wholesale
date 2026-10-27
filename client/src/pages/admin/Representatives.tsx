import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  Mail,
  Phone,
  Save,
  User,
  Building2,
  Image as ImageIcon,
  Video,
  MapPin,
  Link2,
  MessageSquare,
  Loader2,
  ChevronDown,
  ChevronUp,
  Info,
  UserCircle,
  AlertCircle,
} from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import ProtectedAdminRoute from '@/components/admin/ProtectedAdminRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { usePhoneNumberLock } from '@/hooks/usePhoneNumberLock';
import { formatPhoneNumber } from '@/utils/phone';

interface Representative {
  id: number;
  slug: string;
  name: string;
  email: string;
  phone?: string;
  website?: string;
  bio?: string;
  photo_url?: string;
  banner_image_url?: string;
  gallery_images?: string[];
  video_urls?: string[];
  company_name?: string;
  title?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  admin_id?: string | null; // Link to admin (UUID)
  social_links?: {
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    instagram?: string;
    customLinks?: Array<{ label: string; url: string }>;
    [key: string]: string | Array<{ label: string; url: string }> | undefined;
  };
  custom_fields?: Record<string, any>;
  contact_button_text?: string;
  contact_card_button_text?: string;
  contact_form_title?: string;
  contact_form_description?: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface RepresentativeFormData {
  adminId?: string | null; // Link to admin (UUID)
  slug: string;
  name: string;
  email: string;
  phone?: string;
  website?: string;
  bio?: string;
  photoUrl?: string;
  bannerImageUrl?: string;
  galleryImages: string[];
  videoUrls: string[];
  companyName?: string;
  title?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  socialLinks: {
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    instagram?: string;
    customLinks?: Array<{ label: string; url: string }>;
    [key: string]: string | Array<{ label: string; url: string }> | undefined;
  };
  customFields: Record<string, any>;
  contactButtonText?: string;
  contactCardButtonText?: string;
  contactFormTitle?: string;
  contactFormDescription?: string;
  isActive: boolean;
  displayOrder: number;
}

const createEmptyFormData = (): RepresentativeFormData => ({
  adminId: null,
  slug: '',
  name: '',
  email: '',
  phone: '',
  website: '',
  bio: '',
  photoUrl: '',
  companyName: '',
  title: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  bannerImageUrl: '',
  galleryImages: [],
  videoUrls: [],
  socialLinks: { customLinks: [] },
  customFields: {},
  contactButtonText: 'Enter Your Contact Details',
  contactCardButtonText: 'Download Contact Card',
  contactFormTitle: 'Stay In Touch',
  contactFormDescription: '',
  isActive: true,
  displayOrder: 0,
});

export default function AdminRepresentatives() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRep, setEditingRep] = useState<Representative | null>(null);
  const [formData, setFormData] = useState<RepresentativeFormData>(createEmptyFormData());
  const [imagesExpanded, setImagesExpanded] = useState(false);
  const [locationExpanded, setLocationExpanded] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  usePhoneNumberLock({ enabled: true });

  // Note: Admin pages keep phone tracking for analytics
  // Only contact card landing pages (/rep/*) are excluded

  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: representatives = [],
    isLoading,
  } = useQuery<Representative[]>({
    queryKey: ['adminRepresentatives'],
    queryFn: async () => {
      const token = localStorage.getItem('adminToken');
      const response = await fetch('/api/admin/representatives', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch contact cards');
      }

      return response.json();
    },
  });

  // Fetch admins for dropdown
  const { data: admins = [] } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: async () => {
      const token = localStorage.getItem('adminToken');
      const response = await fetch('/api/admin/representatives/admins', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch admins');
      }

      return response.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: RepresentativeFormData) => {
      const token = localStorage.getItem('adminToken');
      
      toast({
        title: 'Creating...',
        description: 'Adding new representative',
      });

      const response = await fetch('/api/admin/representatives', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to create contact card';
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (parseError) {
          // If JSON parsing fails, try to get text
          try {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          } catch (textError) {
            // If all else fails, use status text
            errorMessage = response.statusText || errorMessage;
          }
        }
        
        // Check for database schema errors
        if (errorMessage.includes('column') && errorMessage.includes('not found')) {
          throw new Error(
            'Database schema is missing required columns. Please run the migration script: scripts/add-representative-contact-fields.sql'
          );
        }
        
        // Check for duplicate slug errors
        if (errorMessage.includes('slug') && errorMessage.includes('already exists')) {
          throw new Error('A contact card with this slug already exists. Please choose a different slug.');
        }
        
        throw new Error(errorMessage);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminRepresentatives'] });
      setIsDialogOpen(false);
      setFormData(createEmptyFormData());
      setFormError(null);
      toast({
        title: '✅ Success',
        description: 'Contact card created successfully',
        duration: 3000,
      });
    },
    onError: (error: Error) => {
      console.error('Create contact card error:', error);
      const errorMessage = error.message || 'An unexpected error occurred. Please try again.';
      setFormError(errorMessage);
      toast({
        title: '❌ Error Creating Contact Card',
        description: errorMessage,
        variant: 'destructive',
        duration: 7000,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: RepresentativeFormData }) => {
      const token = localStorage.getItem('adminToken');
      
      toast({
        title: 'Saving...',
        description: 'Updating representative information',
      });

      const response = await fetch(`/api/admin/representatives/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to update contact card';
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (parseError) {
          // If JSON parsing fails, try to get text
          try {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          } catch (textError) {
            // If all else fails, use status text
            errorMessage = response.statusText || errorMessage;
          }
        }
        
        // Check for database schema errors
        if (errorMessage.includes('column') && errorMessage.includes('not found')) {
          throw new Error(
            'Database schema is missing required columns. Please run the migration script: scripts/add-representative-contact-fields.sql'
          );
        }
        
        // Check for duplicate slug errors
        if (errorMessage.includes('slug') && errorMessage.includes('already exists')) {
          throw new Error('A contact card with this slug already exists. Please choose a different slug.');
        }
        
        throw new Error(errorMessage);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminRepresentatives'] });
      setIsDialogOpen(false);
      setEditingRep(null);
      setFormData(createEmptyFormData());
      setFormError(null);
      toast({
        title: '✅ Success',
        description: 'Contact card updated successfully',
        duration: 3000,
      });
    },
    onError: (error: Error) => {
      console.error('Update contact card error:', error);
      const errorMessage = error.message || 'An unexpected error occurred. Please try again.';
      setFormError(errorMessage);
      toast({
        title: '❌ Error Saving Contact Card',
        description: errorMessage,
        variant: 'destructive',
        duration: 7000,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/admin/representatives/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete representative');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminRepresentatives'] });
      toast({
        title: 'Success',
        description: 'Representative deleted successfully',
      });
    },
    onError: (error: Error) => {
      console.error('Delete contact card error:', error);
      toast({
        title: '❌ Error Deleting Contact Card',
        description: error.message || 'Failed to delete contact card. Please try again.',
        variant: 'destructive',
        duration: 5000,
      });
    },
  });

  const filteredReps = representatives.filter((rep) => {
    const search = searchTerm.toLowerCase();
    return (
      rep.name.toLowerCase().includes(search) ||
      rep.email.toLowerCase().includes(search) ||
      rep.slug.toLowerCase().includes(search) ||
      rep.company_name?.toLowerCase().includes(search)
    );
  });

  const uploadImage = async (file: File): Promise<string> => {
    const token = localStorage.getItem('adminToken');
    const formData = new FormData();
    formData.append('image', file);
    formData.append('folder', 'contact-cards/gallery');

    const response = await fetch('/api/admin/uploads/product-image', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(errorData.error || 'Failed to upload image');
    }

    const result = await response.json();
    return result.url;
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const files = Array.from(e.target.files);
    const currentImages = formData.galleryImages || [];

    toast({
      title: 'Uploading...',
      description: `Uploading ${files.length} image${files.length > 1 ? 's' : ''}`,
    });

    try {
      const uploadPromises = files.map((file) => uploadImage(file));
      const uploadedUrls = await Promise.all(uploadPromises);

      setFormData({
        ...formData,
        galleryImages: [...currentImages, ...uploadedUrls],
      });

      toast({
        title: 'Images uploaded',
        description: `${uploadedUrls.length} image${uploadedUrls.length > 1 ? 's' : ''} uploaded and optimized.`,
      });
    } catch (error) {
      console.error('Gallery upload error:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload images',
        variant: 'destructive',
      });
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGalleryDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

    const files = Array.from(e.dataTransfer.files);
    const currentImages = formData.galleryImages || [];

    toast({
      title: 'Uploading...',
      description: `Uploading ${files.length} image${files.length > 1 ? 's' : ''}`,
    });

    try {
      const uploadPromises = files.map((file) => uploadImage(file));
      const uploadedUrls = await Promise.all(uploadPromises);

      setFormData({
        ...formData,
        galleryImages: [...currentImages, ...uploadedUrls],
      });

      toast({
        title: 'Images uploaded',
        description: `${uploadedUrls.length} image${uploadedUrls.length > 1 ? 's' : ''} uploaded and optimized.`,
      });
    } catch (error) {
      console.error('Gallery upload error:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload images',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveGalleryImage = (index: number) => {
    const next = [...(formData.galleryImages || [])];
    next.splice(index, 1);
    setFormData({
      ...formData,
      galleryImages: next,
    });
  };

  const handleCreate = () => {
    setEditingRep(null);
    setFormData(createEmptyFormData());
    setFormError(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (rep: Representative) => {
    setEditingRep(rep);
    setFormData({
      adminId: (rep as any).admin_id || null,
      slug: rep.slug,
      name: rep.name,
      email: rep.email,
      phone: rep.phone,
      website: rep.website,
      bio: rep.bio,
      photoUrl: rep.photo_url,
      bannerImageUrl: rep.banner_image_url,
      galleryImages: rep.gallery_images || [],
      videoUrls: rep.video_urls || [],
      companyName: rep.company_name,
      title: rep.title,
      address: rep.address,
      city: rep.city,
      state: rep.state,
      zipCode: rep.zip_code,
      socialLinks: {
        ...(rep.social_links || {}),
        customLinks: (rep.social_links as any)?.customLinks || [],
      },
      customFields: rep.custom_fields || {},
      contactButtonText: rep.contact_button_text || 'Enter Your Contact Details',
      contactCardButtonText: rep.contact_card_button_text || 'Download Contact Card',
      contactFormTitle: rep.contact_form_title || 'Stay In Touch',
      contactFormDescription: rep.contact_form_description || '',
      isActive: rep.is_active,
      displayOrder: rep.display_order,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this contact card?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!formData.name || !formData.email || !formData.phone) {
      toast({
        title: '⚠️ Validation Error',
        description: 'Name, email, and phone are required fields',
        variant: 'destructive',
        duration: 4000,
      });
      return;
    }

    // Auto-generate slug if not provided
    if (!formData.slug) {
      formData.slug = formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast({
        title: '⚠️ Invalid Email',
        description: 'Please enter a valid email address',
        variant: 'destructive',
        duration: 4000,
      });
      return;
    }

    const payload: RepresentativeFormData = {
      ...formData,
      socialLinks: formData.socialLinks || {},
      customFields: formData.customFields || {},
      isActive: formData.isActive ?? true,
      displayOrder: formData.displayOrder ?? 0,
      galleryImages: (formData.galleryImages || []).filter((url) => url.trim().length > 0),
      videoUrls: (formData.videoUrls || []).filter((url) => url.trim().length > 0),
      contactButtonText: formData.contactButtonText || 'Enter Your Contact Details',
      contactCardButtonText: formData.contactCardButtonText || 'Download Contact Card',
      contactFormTitle: formData.contactFormTitle || 'Stay In Touch',
      adminId: formData.adminId || null,
    };

    try {
      if (editingRep) {
        await updateMutation.mutateAsync({ id: editingRep.id, data: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (error) {
      // Error handling is done in mutation onError, but ensure it's displayed
      console.error('Error submitting form:', error);
      if (error instanceof Error) {
        toast({
          title: '❌ Error',
          description: error.message || 'An unexpected error occurred. Please check the form and try again.',
          variant: 'destructive',
          duration: 7000,
        });
      }
    }
  };

  const handleViewLandingPage = (slug: string) => {
    window.open(`/rep/${slug}`, '_blank');
  };

  return (
    <ProtectedAdminRoute>
      <AdminLayout>
        <div className="space-y-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Contact Cards</h1>
              <p className="text-muted-foreground">
                Manage contact card landing pages and track prospects
              </p>
            </div>
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add Contact Card
            </Button>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>All Contact Cards</CardTitle>
                  <CardDescription>
                    {filteredReps.length} contact card{filteredReps.length !== 1 ? 's' : ''}
                  </CardDescription>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search contact cards..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading...</div>
              ) : filteredReps.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  {searchTerm ? 'No contact cards found' : 'No contact cards yet. Create one to get started.'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReps.map((rep) => (
                      <TableRow key={rep.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {rep.photo_url && (
                              <img
                                src={rep.photo_url}
                                alt={rep.name}
                                className="h-10 w-10 rounded-full object-cover"
                              />
                            )}
                            <div>
                              <div>{rep.name}</div>
                              {rep.title && (
                                <div className="text-sm text-muted-foreground">{rep.title}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm">
                              <Mail className="h-3 w-3" />
                              {rep.email}
                            </div>
                            {rep.phone && (
                              <div className="flex items-center gap-2 text-sm">
                                <Phone className="h-3 w-3" />
                                <span
                                  data-callrail-ignore="true" data-calltrk-noswap="true"
                                  data-dynamic-number-ignore="true"
                                  data-call-tracking-ignore="true"
                                  data-phone-number={rep.phone}
                                >
                                  {formatPhoneNumber(rep.phone)}
                                </span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{rep.company_name || '-'}</TableCell>
                        <TableCell>
                          <code className="rounded bg-muted px-2 py-1 text-xs">
                            {rep.slug}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Badge variant={rep.is_active ? 'default' : 'secondary'}>
                            {rep.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleViewLandingPage(rep.slug)}
                              title="View Landing Page"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(rep)}
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(rep.id)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Create/Edit Dialog */}
          <Dialog 
            open={isDialogOpen} 
            onOpenChange={(open) => {
              // Prevent closing during save
              if (!open && (createMutation.isPending || updateMutation.isPending)) {
                return;
              }
              setIsDialogOpen(open);
              // Clear error when dialog closes
              if (!open) {
                setFormError(null);
              }
            }}
          >
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-2xl">
                  {editingRep ? 'Edit Contact Card' : 'Create Contact Card'}
                </DialogTitle>
                <DialogDescription>
                  {editingRep
                    ? 'Update contact card information and landing page settings'
                    : 'Add a new contact card landing page'}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-6 py-4">
                {/* Error Alert */}
                {formError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}

                {/* Admin Selection - First and Prominent */}
                <Card className="border-2 border-primary/20">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <UserCircle className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">Link to Admin</CardTitle>
                    </div>
                    <CardDescription>
                      Select which admin will receive contacts from this contact card
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label htmlFor="adminId">Admin</Label>
                      <Select
                        value={formData.adminId?.toString() || ''}
                        onValueChange={(value) =>
                          setFormData({
                            ...formData,
                            adminId: value === 'none' ? null : value,
                          })
                        }
                      >
                        <SelectTrigger id="adminId">
                          <SelectValue placeholder="Select an admin (recommended)" />
                        </SelectTrigger>
                        <SelectContent>
                          {admins.map((admin: any) => (
                            <SelectItem key={admin.id} value={admin.id.toString()}>
                              {admin.full_name || admin.email}
                            </SelectItem>
                          ))}
                          <SelectItem value="none" className="text-muted-foreground italic">
                            No Admin (not recommended)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Contacts from this card will be associated with the selected admin
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Required Information Section */}
                <Card className="border-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <User className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">Required Information</CardTitle>
                    </div>
                    <CardDescription>Core details required for the contact card</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">
                          Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="name"
                          value={formData.name || ''}
                          onChange={(e) => {
                            const name = e.target.value;
                            // Auto-generate slug from name only if creating new (not editing) and slug is empty
                            const shouldAutoGenerate = !editingRep && !formData.slug;
                            setFormData({
                              ...formData,
                              name,
                              // Auto-generate slug from name if creating new contact card
                              slug: shouldAutoGenerate 
                                ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                                : formData.slug,
                            });
                          }}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">
                          Email <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email || ''}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">
                        Phone <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="phone"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="(555) 123-4567"
                        required
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Highly Recommended Section */}
                <Card className="border-2 border-blue-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Info className="h-5 w-5 text-blue-600" />
                      <CardTitle className="text-lg">Highly Recommended</CardTitle>
                    </div>
                    <CardDescription>
                      These fields make your contact card look professional and complete
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <ImageUpload
                          value={formData.photoUrl}
                          onChange={(url) => setFormData({ ...formData, photoUrl: url })}
                          onRemove={() => setFormData({ ...formData, photoUrl: '' })}
                          folder="contact-cards/profiles"
                          label="Profile Photo"
                          description="Square image recommended (will be cropped to circle)"
                          aspectRatio="square"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="title">
                          Title <span className="text-blue-600 text-xs">(Recommended)</span>
                        </Label>
                        <Input
                          id="title"
                          value={formData.title || ''}
                          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                          placeholder="Sales Representative"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="companyName">
                          Company Name <span className="text-blue-600 text-xs">(Recommended)</span>
                        </Label>
                        <Input
                          id="companyName"
                          value={formData.companyName || ''}
                          onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <ImageUpload
                          value={formData.bannerImageUrl}
                          onChange={(url) => setFormData({ ...formData, bannerImageUrl: url })}
                          onRemove={() => setFormData({ ...formData, bannerImageUrl: '' })}
                          folder="contact-cards/banners"
                          label="Banner Image"
                          description="Wide hero image (recommended: 1920x600px)"
                          aspectRatio="banner"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bio">
                        Bio <span className="text-blue-600 text-xs">(Recommended)</span>
                      </Label>
                      <Textarea
                        id="bio"
                        value={formData.bio || ''}
                        onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                        rows={4}
                        placeholder="Tell us about this contact card..."
                        className="resize-none"
                      />
                      <p className="text-xs text-muted-foreground">
                        Description that appears on the landing page
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Social Media Links Section - In Recommended but also here for organization */}
                <Card className="border-2 border-blue-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Link2 className="h-5 w-5 text-blue-600" />
                      <CardTitle className="text-lg">Social Media Links</CardTitle>
                    </div>
                    <CardDescription>Connect your social media profiles</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="facebook" className="text-xs">Facebook</Label>
                        <Input
                          id="facebook"
                          placeholder="https://facebook.com/username"
                          value={formData.socialLinks?.facebook || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              socialLinks: {
                                ...(formData.socialLinks || {}),
                                facebook: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="linkedin" className="text-xs">LinkedIn</Label>
                        <Input
                          id="linkedin"
                          placeholder="https://linkedin.com/in/username"
                          value={formData.socialLinks?.linkedin || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              socialLinks: {
                                ...(formData.socialLinks || {}),
                                linkedin: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="instagram" className="text-xs">Instagram</Label>
                        <Input
                          id="instagram"
                          placeholder="https://instagram.com/username"
                          value={formData.socialLinks?.instagram || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              socialLinks: {
                                ...(formData.socialLinks || {}),
                                instagram: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="twitter" className="text-xs">Twitter</Label>
                        <Input
                          id="twitter"
                          placeholder="https://twitter.com/username"
                          value={formData.socialLinks?.twitter || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              socialLinks: {
                                ...(formData.socialLinks || {}),
                                twitter: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                    </div>

                    {/* Custom Links */}
                    <div className="space-y-3 pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <Label>Custom Links</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const currentLinks = formData.socialLinks?.customLinks || [];
                            setFormData({
                              ...formData,
                              socialLinks: {
                                ...(formData.socialLinks || {}),
                                customLinks: [...currentLinks, { label: '', url: '' }],
                              },
                            });
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Custom Link
                        </Button>
                      </div>
                      {(formData.socialLinks?.customLinks || []).map((link, index) => (
                        <div key={`custom-${index}`} className="flex gap-2">
                          <Input
                            placeholder="Link Label"
                            value={link.label}
                            onChange={(e) => {
                              const customLinks = [...(formData.socialLinks?.customLinks || [])];
                              customLinks[index] = { ...customLinks[index], label: e.target.value };
                              setFormData({
                                ...formData,
                                socialLinks: {
                                  ...(formData.socialLinks || {}),
                                  customLinks,
                                },
                              });
                            }}
                            className="flex-1"
                          />
                          <Input
                            placeholder="https://example.com"
                            value={link.url}
                            onChange={(e) => {
                              const customLinks = [...(formData.socialLinks?.customLinks || [])];
                              customLinks[index] = { ...customLinks[index], url: e.target.value };
                              setFormData({
                                ...formData,
                                socialLinks: {
                                  ...(formData.socialLinks || {}),
                                  customLinks,
                                },
                              });
                            }}
                            className="flex-2"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const customLinks = (formData.socialLinks?.customLinks || []).filter((_, i) => i !== index);
                              setFormData({
                                ...formData,
                                socialLinks: {
                                  ...(formData.socialLinks || {}),
                                  customLinks,
                                },
                              });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Images & Media - Collapsible */}
                <Collapsible open={imagesExpanded} onOpenChange={setImagesExpanded}>
                  <Card className="border-2">
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ImageIcon className="h-5 w-5 text-primary" />
                            <CardTitle className="text-lg">Images & Media</CardTitle>
                          </div>
                          {imagesExpanded ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <CardDescription>Additional images and gallery</CardDescription>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="space-y-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label>Gallery Images</Label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Upload Images
                            </Button>
                          </div>
                          
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleGalleryUpload}
                            className="hidden"
                          />

                          {(!formData.galleryImages || formData.galleryImages.length === 0) ? (
                            <div
                              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onDrop={handleGalleryDrop}
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <ImageIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                              <p className="text-sm font-medium mb-1">Drag images here or click to upload</p>
                              <p className="text-xs text-muted-foreground">
                                PNG, JPG, WebP up to 20MB each
                              </p>
                            </div>
                          ) : (
                            <div
                              className="grid grid-cols-2 sm:grid-cols-3 gap-4"
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onDrop={handleGalleryDrop}
                            >
                              {(formData.galleryImages || []).map((url, index) => (
                                <div key={`gallery-${index}`} className="relative group">
                                  <div className="aspect-square rounded-lg overflow-hidden border-2 border-border">
                                    <img
                                      src={url}
                                      alt={`Gallery ${index + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon"
                                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => handleRemoveGalleryImage(index)}
                                    aria-label="Remove image"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                              <div
                                className="aspect-square border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
                                onClick={() => fileInputRef.current?.click()}
                              >
                                <Plus className="h-6 w-6 text-muted-foreground" />
                              </div>
                            </div>
                      )}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
            <Card className="border-2">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Video className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">YouTube Spotlight</CardTitle>
                </div>
                <CardDescription>Add short-form videos that automatically play on the contact card.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Label>Video URLs</Label>
                    <p className="text-xs text-muted-foreground">Use full YouTube links (watch or share URLs).</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        videoUrls: [...(formData.videoUrls || []), ''],
                      })
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Video
                  </Button>
                </div>
                <div className="space-y-3">
                  {(formData.videoUrls || []).length === 0 && (
                    <p className="text-sm text-muted-foreground">No videos yet. Click “Add Video” to get started.</p>
                  )}
                  {(formData.videoUrls || []).map((url, index) => (
                    <div key={`video-${index}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={url}
                        onChange={(e) => {
                          const next = [...(formData.videoUrls || [])];
                          next[index] = e.target.value;
                          setFormData({ ...formData, videoUrls: next });
                        }}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const next = (formData.videoUrls || []).filter((_, i) => i !== index);
                          setFormData({ ...formData, videoUrls: next });
                        }}
                        aria-label="Remove video"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

                {/* Location - Collapsible */}
                <Collapsible open={locationExpanded} onOpenChange={setLocationExpanded}>
                  <Card className="border-2">
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-primary" />
                            <CardTitle className="text-lg">Location</CardTitle>
                          </div>
                          {locationExpanded ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <CardDescription>Physical address information</CardDescription>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="address">Address</Label>
                            <Input
                              id="address"
                              value={formData.address || ''}
                              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                              placeholder="123 Main St"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="city">City</Label>
                            <Input
                              id="city"
                              value={formData.city || ''}
                              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                              placeholder="City"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-2">
                              <Label htmlFor="state">State</Label>
                              <Input
                                id="state"
                                value={formData.state || ''}
                                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                                placeholder="CA"
                                maxLength={2}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="zipCode">Zip Code</Label>
                              <Input
                                id="zipCode"
                                value={formData.zipCode || ''}
                                onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                                placeholder="12345"
                              />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>

                {/* Contact Form Settings Section */}
                <Card className="border-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">Contact Form Settings</CardTitle>
                    </div>
                    <CardDescription>Customize the contact form on the landing page</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="contactButtonText">Contact Button Label</Label>
                        <Input
                          id="contactButtonText"
                          value={formData.contactButtonText || ''}
                          onChange={(e) => setFormData({ ...formData, contactButtonText: e.target.value })}
                          placeholder="Enter Your Contact Details"
                        />
                        <p className="text-xs text-muted-foreground">
                          Text for the main contact button
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contactCardButtonText">Contact Card Button Label</Label>
                        <Input
                          id="contactCardButtonText"
                          value={formData.contactCardButtonText || ''}
                          onChange={(e) =>
                            setFormData({ ...formData, contactCardButtonText: e.target.value })
                          }
                          placeholder="Download Contact Card"
                        />
                        <p className="text-xs text-muted-foreground">
                          Text for the download contact card button
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contactFormTitle">Contact Form Title</Label>
                      <Input
                        id="contactFormTitle"
                        value={formData.contactFormTitle || ''}
                        onChange={(e) => setFormData({ ...formData, contactFormTitle: e.target.value })}
                        placeholder="Stay In Touch"
                      />
                      <p className="text-xs text-muted-foreground">
                        Main heading above the contact form
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Advanced - Collapsible */}
                <Collapsible open={advancedExpanded} onOpenChange={setAdvancedExpanded}>
                  <Card className="border-2">
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5 text-primary" />
                            <CardTitle className="text-lg">Advanced Settings</CardTitle>
                          </div>
                          {advancedExpanded ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <CardDescription>Additional customization options</CardDescription>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="website">Website</Label>
                          <Input
                            id="website"
                            value={formData.website || ''}
                            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                            placeholder="https://example.com"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="contactFormDescription">Contact Form Description</Label>
                          <Textarea
                            id="contactFormDescription"
                            value={formData.contactFormDescription || ''}
                            onChange={(e) =>
                              setFormData({ ...formData, contactFormDescription: e.target.value })
                            }
                            rows={3}
                            placeholder="Short description that appears above the intake form button"
                            className="resize-none"
                          />
                          <p className="text-xs text-muted-foreground">
                            Brief description that appears below the title
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="slug">
                            Slug <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="slug"
                            value={formData.slug || ''}
                            onChange={(e) => {
                              const newSlug = e.target.value;
                              // If editing and slug is being changed, show warning
                              if (editingRep && newSlug !== editingRep.slug) {
                                if (!confirm(
                                  '⚠️ WARNING: Changing the slug will break all existing links to this contact card!\n\n' +
                                  'Previous URL: /rep/' + editingRep.slug + '\n' +
                                  'New URL: /rep/' + newSlug + '\n\n' +
                                  'Anyone who has bookmarked or shared the old link will get a 404 error.\n\n' +
                                  'Are you sure you want to change the slug?'
                                )) {
                                  return; // User cancelled
                                }
                              }
                              setFormData({ ...formData, slug: newSlug });
                            }}
                            placeholder="Auto-generated from name"
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            URL-friendly identifier (e.g., /rep/john-smith). Auto-generated from name on first save.
                            {editingRep && <span className="text-amber-600 font-semibold"> Changing this will break existing links!</span>}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="displayOrder">Display Order</Label>
                          <Input
                            id="displayOrder"
                            type="number"
                            value={formData.displayOrder ?? 0}
                            onChange={(e) =>
                              setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            Lower numbers appear first
                          </p>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>

                {/* Status Section */}
                <Card className="border-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Status</CardTitle>
                    <CardDescription>Control visibility of this representative</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="isActive" className="text-base">Active</Label>
                        <p className="text-sm text-muted-foreground">
                          {formData.isActive 
                            ? 'This representative is visible on the website' 
                            : 'This representative is hidden from the website'}
                        </p>
                      </div>
                      <Switch
                        id="isActive"
                        checked={formData.isActive ?? true}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, isActive: checked })
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button 
                    type="button"
                    variant="outline" 
                    onClick={() => setIsDialogOpen(false)}
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="min-w-[120px]"
                  >
                    {createMutation.isPending || updateMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        {editingRep ? 'Update' : 'Create'}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </AdminLayout>
    </ProtectedAdminRoute>
  );
}
