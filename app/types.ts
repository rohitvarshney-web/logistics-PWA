export type LogisticsStatus = 'documents_received' | 'order_submitted' | 'visa_received' | 'passports_dispatched';
export interface LogisticsOrder {
  orderId: string;
  passportNumber?: string;
  applicantName?: string;
  country?: string;
  currentStatus?: LogisticsStatus | string;
  statusHistory?: Array<{ status: string; at?: string; by?: string }>;
  raw?: any;
}
