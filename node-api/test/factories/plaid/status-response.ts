import * as Faker from 'faker';
import { DefaultAdapter } from 'factory-girl';
import {
  PlaidInstitutionRefreshInterval,
  PlaidInstitutionStatus,
} from '../../../src/typings/plaid';

export default function(factory: any) {
  factory.setAdapter(new DefaultAdapter(), 'plaid_status_response_unhealthy_login_and_transaction');
  factory.define('plaid_status_response_unhealthy_login_and_transaction', Object, {
    institution: {
      status: {
        item_logins: {
          status: PlaidInstitutionStatus.DOWN,
          last_status_change: Faker.date.past().toString(),
        },
        transactions_updates: {
          status: PlaidInstitutionStatus.DEGRADED,
          last_status_change: Faker.date.past().toString(),
          breakdown: {
            refresh_interval: PlaidInstitutionRefreshInterval.STOPPED,
          },
        },
      },
    },
  });

  factory.setAdapter(new DefaultAdapter(), 'plaid_status_response_healthy');
  factory.define('plaid_status_response_healthy', Object, {
    institution: {
      status: {
        item_logins: {
          status: PlaidInstitutionStatus.HEALTHY,
        },
        transactions_updates: {
          status: PlaidInstitutionStatus.HEALTHY,
          breakdown: {
            refresh_interval: PlaidInstitutionRefreshInterval.NORMAL,
          },
        },
      },
    },
  });

  factory.setAdapter(new DefaultAdapter(), 'plaid_status_response_unhealthy_login_down');
  factory.define('plaid_status_response_unhealthy_login_down', Object, {
    institution: {
      status: {
        item_logins: {
          status: PlaidInstitutionStatus.DOWN,
        },
        transactions_updates: {
          status: PlaidInstitutionStatus.HEALTHY,
          breakdown: {
            refresh_interval: PlaidInstitutionRefreshInterval.NORMAL,
          },
        },
      },
    },
  });

  factory.setAdapter(new DefaultAdapter(), 'plaid_status_response_unhealthy_login_degraded');
  factory.define('plaid_status_response_unhealthy_login_degraded', Object, {
    institution: {
      status: {
        item_logins: {
          status: PlaidInstitutionStatus.DEGRADED,
        },
        transactions_updates: {
          status: PlaidInstitutionStatus.HEALTHY,
          breakdown: {
            refresh_interval: PlaidInstitutionRefreshInterval.NORMAL,
          },
        },
      },
    },
  });

  factory.setAdapter(
    new DefaultAdapter(),
    'plaid_status_response_unhealthy_transaction_down_delayed',
  );
  factory.define('plaid_status_response_unhealthy_transaction_down_delayed', Object, {
    institution: {
      status: {
        item_logins: {
          status: PlaidInstitutionStatus.HEALTHY,
        },
        transactions_updates: {
          status: PlaidInstitutionStatus.DOWN,
          last_status_change: Faker.date.past().toString(),
          breakdown: {
            refresh_interval: PlaidInstitutionRefreshInterval.DELAYED,
          },
        },
      },
    },
  });

  factory.setAdapter(
    new DefaultAdapter(),
    'plaid_status_response_unhealthy_transaction_down_stopped',
  );
  factory.define('plaid_status_response_unhealthy_transaction_down_stopped', Object, {
    institution: {
      status: {
        item_logins: {
          status: PlaidInstitutionStatus.HEALTHY,
        },
        transactions_updates: {
          status: PlaidInstitutionStatus.DOWN,
          last_status_change: Faker.date.past().toString(),
          breakdown: {
            refresh_interval: PlaidInstitutionRefreshInterval.STOPPED,
          },
        },
      },
    },
  });

  factory.setAdapter(
    new DefaultAdapter(),
    'plaid_status_response_unhealthy_transaction_degraded_delayed',
  );
  factory.define('plaid_status_response_unhealthy_transaction_degraded_delayed', Object, {
    institution: {
      status: {
        item_logins: {
          status: PlaidInstitutionStatus.HEALTHY,
        },
        transactions_updates: {
          status: PlaidInstitutionStatus.DEGRADED,
          last_status_change: Faker.date.past().toString(),
          breakdown: {
            refresh_interval: PlaidInstitutionRefreshInterval.DELAYED,
          },
        },
      },
    },
  });

  factory.setAdapter(
    new DefaultAdapter(),
    'plaid_status_response_unhealthy_transaction_degraded_stopped',
  );
  factory.define('plaid_status_response_unhealthy_transaction_degraded_stopped', Object, {
    institution: {
      status: {
        item_logins: {
          status: PlaidInstitutionStatus.HEALTHY,
        },
        transactions_updates: {
          status: PlaidInstitutionStatus.DEGRADED,
          last_status_change: Faker.date.past().toString(),
          breakdown: {
            refresh_interval: PlaidInstitutionRefreshInterval.STOPPED,
          },
        },
      },
    },
  });

  factory.setAdapter(
    new DefaultAdapter(),
    'plaid_status_response_unhealthy_transaction_healthy_delayed',
  );
  factory.define('plaid_status_response_unhealthy_transaction_healthy_delayed', Object, {
    institution: {
      status: {
        item_logins: {
          status: PlaidInstitutionStatus.HEALTHY,
        },
        transactions_updates: {
          status: PlaidInstitutionStatus.HEALTHY,
          last_status_change: Faker.date.past().toString(),
          breakdown: {
            refresh_interval: PlaidInstitutionRefreshInterval.DELAYED,
          },
        },
      },
    },
  });

  factory.setAdapter(
    new DefaultAdapter(),
    'plaid_status_response_unhealthy_transaction_healthy_stopped',
  );
  factory.define('plaid_status_response_unhealthy_transaction_healthy_stopped', Object, {
    institution: {
      status: {
        item_logins: {
          status: PlaidInstitutionStatus.HEALTHY,
        },
        transactions_updates: {
          status: PlaidInstitutionStatus.HEALTHY,
          last_status_change: Faker.date.past().toString(),
          breakdown: {
            refresh_interval: PlaidInstitutionRefreshInterval.STOPPED,
          },
        },
      },
    },
  });
}
