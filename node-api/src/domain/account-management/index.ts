import { removeUserAccountById } from './remove-user-account-by-id';

export {
  DeleteAccountRequestOptions,
  IAccountRemovalRequest,
  findRemovableUserById,
} from './account-removal';
export {
  AccountRemovalError,
  AccountActionError,
  BatchAccountActionsError,
  AccountActionFailure,
  AccountActionSuccess,
} from './account-action';

export const AccountManagement = {
  removeUserAccountById,
};

export default AccountManagement;
