type CreateActionLogPayload = {
  dashboardActionReasonId: number;
  internalUserId: number;
  zendeskTicketUrl: string;
  note?: string;
};

export default CreateActionLogPayload;
