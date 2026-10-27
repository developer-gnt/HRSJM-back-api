export interface SendMailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
}

export interface DonationThankYouMailPayload {
  donorName: string;
  donorEmail: string;
  amount: number;
  currency?: string;
  receiptNumber: string;
  receiptDate?: Date | string;
  cause?: string;
  paymentMethod?: string;
  gatewayPaymentId?: string;
}

export interface MembershipWelcomeMailPayload {
  memberName: string;
  memberEmail: string;
  membershipId?: string;
  categoryName?: string;
  amount?: number;
  receiptNumber?: string;
}

export interface MembershipPaymentSuccessMailPayload {
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
  applicationRef: string;
  categoryName: string;
  amount: number;
  currency?: string;
  transactionId?: string;
  paymentOrderRef?: string;
  paymentMethod?: string;
  paymentDate?: Date | string;
  status?: string;
}

export interface ComplaintConfirmationMailPayload {
  complainantName: string;
  complainantEmail: string;
  complainantPhone?: string;
  ticketId: string;
  complaintType: string;
  state: string;
  policeStation: string;
  details: string;
  submittedAt?: Date | string;
  status?: string;
}

export interface TicketStatusUpdateMailPayload {
  complainantName: string;
  complainantEmail: string;
  ticketId: string;
  subject: string;
  category?: string;
  status: 'UNDER_REVIEW' | 'RESOLVED' | 'CLOSED';
  note?: string;
  updatedAt?: Date | string;
}

export interface MembershipStatusUpdateMailPayload {
  memberName: string;
  memberEmail: string;
  membershipNumber: string;
  categoryName?: string;
  status: 'APPROVED' | 'ACTIVE' | 'UNDER_REVIEW' | 'REJECTED' | 'SUSPENDED';
  validFrom?: Date | string | null;
  validUntil?: Date | string | null;
  rejectionReason?: string | null;
  notes?: string | null;
}

export interface AdminPasswordResetMailPayload {
  recipientName: string;
  recipientEmail: string;
  temporaryPassword: string;
  resetDate?: Date | string;
}

export interface AssistanceRequestConfirmationMailPayload {
  applicantName: string;
  applicantEmail: string;
  requestId: string;
  reason: string;
  requestedAmount?: number;
  submittedAt?: Date | string;
  status?: string;
}

export interface AssistanceStatusUpdateMailPayload {
  applicantName: string;
  applicantEmail: string;
  requestId: string;
  reason?: string;
  status: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'DISBURSED';
  approvedAmount?: number;
  rejectionReason?: string;
  notes?: string;
  updatedAt?: Date | string;
}

export interface PasswordChangedNoticeMailPayload {
  recipientName: string;
  recipientEmail: string;
  changedAt?: Date | string;
}

export interface ContactInquiryMailPayload {
  senderName: string;
  senderEmail: string;
  senderPhone?: string;
  subject?: string;
  message: string;
  inquiryRef?: string;
  submittedAt?: Date | string;
}


