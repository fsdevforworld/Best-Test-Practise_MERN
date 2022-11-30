import IDetail from './i-detail';

interface IActionLogDetail extends IDetail {
  type: 'action-log';
  attributes: {
    reason: string;
    internalUserEmail: string;
    created: string;
    note?: string;
    zendeskTicketUrl?: string;
  };
}

export default IActionLogDetail;
