import React, { FunctionComponent, useMemo, useState } from 'react';
import { Dispatch, bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import { RootAction, RootState } from 'typings/redux';
import { get } from 'lodash';

import { getUser } from 'actions/user';
import { selectUser } from 'selectors/user';
import * as Analytics from 'lib/analytics';

import TwoColumnLayout from 'components/layout';
import AppStoreButtons from 'components/app-store-buttons';
import AdvanceQualifyModal from 'features/advance-qualify/components/modals';

import { LifeguardPhone, RaceCar } from 'img/daveWithBg';

const mapStateToProps = (state: RootState) => ({
  user: selectUser(state),
});

const mapDispatchToProps = (dispatch: Dispatch<RootAction>) =>
  bindActionCreators(
    {
      getUser,
    },
    dispatch,
  );

type Props = ReturnType<typeof mapStateToProps> & ReturnType<typeof mapDispatchToProps>;

const Register: FunctionComponent<Props> = (props) => {
  const isApproved = get(props, 'location.state.isApproved');
  const [showQualifyModal, setShowQualifyModal] = useState(false);

  const data = useMemo(() => {
    return { isApproved };
  }, [isApproved]);

  const viewName = isApproved ? 'approved' : 'notApproved';
  Analytics.useAnalytics(Analytics.EVENTS.ADVANCE_APPROVAL_LOADED, data);

  const views = {
    approved: {
      title: (
        <span className="title-6 text-black">
          You&apos;re approved! <br /> Cash out in the app.
        </span>
      ),
      body: (
        <>
          <span className="body-4 text-black col-10">
            I just sent you a link to download the Dave app to get your advance and unlock your full
            Dave membership benefits.
          </span>
          <AppStoreButtons />
        </>
      ),
      backgroundImage: LifeguardPhone,
    },
    notApproved: {
      title: (
        <span className="title-6 text-black">
          I can&apos;t approve <br /> you - yet.
        </span>
      ),
      body: (
        <>
          <span className="body-4 text-black col-10">
            I’ll help you get approved in no time. Download the app to use your membership.
            I&apos;ll improve your finances and give you new ways to make money.
          </span>
          <AppStoreButtons />
          <p className="link" onClick={() => setShowQualifyModal(true)}>
            How do I get approved?
          </p>
          <AdvanceQualifyModal
            showModal={showQualifyModal}
            onClose={() => setShowQualifyModal(false)}
            openEvent={Analytics.EVENTS.ADVANCE_APPROVAL_QUALIFY_MODAL_OPENED}
            closeEvent={Analytics.EVENTS.ADVANCE_APPROVAL_QUALIFY_MODAL_CLOSED}
          />
        </>
      ),
      backgroundImage: RaceCar,
    },
  };

  return <TwoColumnLayout {...views[viewName]} />;
};

export default connect(mapStateToProps, mapDispatchToProps)(Register);
