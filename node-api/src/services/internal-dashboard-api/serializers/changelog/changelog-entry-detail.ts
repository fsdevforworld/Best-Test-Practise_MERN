import IActionLogDetail from './i-action-log-detail';
import IFieldDetail from './i-field-detail';
import IModificationDetail from './i-modification-detail';

type ChangelogEntryDetail = IActionLogDetail | IFieldDetail | IModificationDetail;

export default ChangelogEntryDetail;
