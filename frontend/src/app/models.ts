export interface Staff {
  username: string;
  is_staff: boolean;
}
export interface SessionResponse {
  authenticated: boolean;
  user: Staff | null;
}
export interface InventoryItem {
  id: number;
  title: string;
  description: string;
  remaining_count: number;
  expiration_date: string;
  is_expired: boolean;
  is_bookable: boolean;
  cover_url: string;
}
export interface InventoryResponse {
  items: InventoryItem[];
  total_items: number;
  member_count: number;
  pagination: Pagination;
  filter_counts: Record<InventoryStatus, number>;
}
export interface Member {
  id: number;
  name: string;
  surname: string;
  booking_count: number;
}
export interface ItemOption {
  id: number;
  title: string;
  remaining_count: number;
  expiration_date: string;
  is_expired: boolean;
  is_bookable: boolean;
}
export interface BookingOptions {
  members: Member[];
  items: ItemOption[];
  max_bookings: number;
}
export interface Booking {
  booking_reference: string;
  member_id: number;
  item_id: number;
  booked_at: string;
  cancelled_at: string | null;
  status: 'active' | 'cancelled';
  member_name?: string;
  item_title?: string;
}
export interface Choice {
  id: number;
  label: string;
  detail: string;
  badge: string;
  avatar: string;
  tone: 'available' | 'full' | 'exceeded';
  disabled?: boolean;
}
export type InventoryStatus = 'all' | 'available' | 'low_stock' | 'expired' | 'sold_out';
export type BookingStatus = 'all' | 'active' | 'cancelled';
export interface Pagination {
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
  start_index: number;
  end_index: number;
}
export interface BookingsResponse {
  bookings: Booking[];
  pagination: Pagination;
}
