export function genChargebackData(overrides: any) {
  const data = {
    'Merchant Reference ID': '5519165',
    'Exception Date': '07/23/2018',
    'Action-Status': 'Documentation received',
    'Status Date': '07/23/2018',
    'Original Creation Date': '5/31/2018',
    'Original Settled Amount': '80.74',
  };

  return Object.assign({}, data, overrides);
}
export function genDisbursementData(overrides: any) {
  const data = {
    'Reference ID': 'yo',
    Status: 'COMPLETE',
    Type: 'Purchase',
    'Processed Date': '06/08/2017 23:01:01',
    'Transaction Amount': '75',
    'Network ID': '299878256',
    'Approval Code': '578258',
    'Settlement Network': 'Visa',
  };
  return Object.assign({}, data, overrides);
}
